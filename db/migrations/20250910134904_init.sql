-- Extensions (UUID & crypto)
create extension if not exists pgcrypto;

-- Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'room_status') then
    create type room_status as enum ('lobby','playing','ended');
  end if;
  if not exists (select 1 from pg_type where typname = 'round_result') then
    create type round_result as enum ('hit','miss','timeout','aborted');
  end if;
end$$;

-- TABLE: profiles (1:1 cu auth.users)
create table if not exists public.profiles (
  uid uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  created_at timestamptz not null default now()
);

-- TABLE: characters (personaje 3D)
create table if not exists public.characters (
  id text primary key,
  label text,
  model_url text,
  clips jsonb,            -- ex: {"idle": "...", "win": "..."}
  tri_budget int,         -- informativ
  enabled boolean not null default true
);

-- TABLE: rooms
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,             -- 4–6 litere
  host_uid uuid not null references auth.users(id) on delete cascade,
  seed text not null,
  min_index numeric(5,1) not null default 0.5,
  max_index numeric(5,1) not null default 122.5,
  status room_status not null default 'lobby',
  turn_uid uuid null references auth.users(id) on delete set null,
  turn_ends_at timestamptz null,
  deck_hash text null,
  created_at timestamptz not null default now()
);

-- TABLE: room_members
create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  uid uuid not null references auth.users(id) on delete cascade,
  seat_index smallint not null,
  display_name text not null,
  character_id text null references public.characters(id),
  joined_at timestamptz not null default now(),
  is_ready boolean not null default false,
  primary key (room_id, uid),
  unique (room_id, seat_index),
  unique (room_id, character_id)
);

-- TABLE: cards (deck global privat)
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  situation text not null,
  misery_index numeric(5,1) not null,
  enabled boolean not null default true
);

-- VIEW: cards_public (doar id + situation) prin funcție SECURITY DEFINER
create or replace function public.cards_public_fn()
returns table (id uuid, situation text)
language sql
security definer
set search_path = public
as $$
  select c.id, c.situation
  from public.cards c
  where c.enabled = true;
$$;

create or replace view public.cards_public as
select * from public.cards_public_fn();

-- TABLE: room_decks (instanța deck-ului într-o cameră)
create table if not exists public.room_decks (
  room_id uuid not null references public.rooms(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  draw_order int not null,
  drawn boolean not null default false,
  score_snapshot numeric(5,1) not null,
  revealed_at timestamptz null,
  primary key (room_id, card_id),
  unique (room_id, draw_order)
);

-- TABLE: rounds
create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  turn_number int not null,
  turn_uid uuid not null references auth.users(id) on delete cascade,
  drawn_card_id uuid not null references public.cards(id) on delete cascade,
  result round_result null,
  started_at timestamptz not null default now(),
  resolved_at timestamptz null
);

-- TABLE: player_timelines
create table if not exists public.player_timelines (
  room_id uuid not null references public.rooms(id) on delete cascade,
  uid uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  position_index int not null,
  inserted_at timestamptz not null default now(),
  unique (room_id, uid, position_index)
);

-- Helpful indexes
create index if not exists idx_rooms_code on public.rooms(code);
create index if not exists idx_members_room on public.room_members(room_id);
create index if not exists idx_decks_room_order on public.room_decks(room_id, draw_order);
create index if not exists idx_rounds_room_turn on public.rounds(room_id, turn_number);
create index if not exists idx_timelines_room_uid on public.player_timelines(room_id, uid);

-- =========================
-- RLS
-- =========================
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_decks enable row level security;
alter table public.rounds enable row level security;
alter table public.player_timelines enable row level security;
alter table public.cards enable row level security; -- blocăm accesul direct
-- View-urile nu au RLS; controlăm col/vizibilitatea prin SECURITY DEFINER

-- Helper predicate: user e membru în camera rândului (după room_id)
create or replace function public.is_member_of_room(_room_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.room_members m
    where m.room_id = _room_id
      and m.uid = auth.uid()
  );
$$;

-- ROOMS
create policy "rooms_select_members_only"
on public.rooms
for select
to authenticated
using ( public.is_member_of_room(id) );

create policy "rooms_insert_host_is_self"
on public.rooms
for insert
to authenticated
with check ( host_uid = auth.uid() );

create policy "rooms_update_host_only"
on public.rooms
for update
to authenticated
using ( host_uid = auth.uid() )
with check ( host_uid = auth.uid() );

create policy "rooms_delete_host_only"
on public.rooms
for delete
to authenticated
using ( host_uid = auth.uid() );

-- ROOM_MEMBERS
create policy "members_select_same_room"
on public.room_members
for select
to authenticated
using ( exists (
  select 1 from public.room_members me
  where me.room_id = room_members.room_id
    and me.uid = auth.uid()
) );

create policy "members_insert_self"
on public.room_members
for insert
to authenticated
with check ( uid = auth.uid() );

create policy "members_update_self_or_host"
on public.room_members
for update
to authenticated
using (
  uid = auth.uid()
  or exists (select 1 from public.rooms r where r.id = room_id and r.host_uid = auth.uid())
)
with check (
  uid = auth.uid()
  or exists (select 1 from public.rooms r where r.id = room_id and r.host_uid = auth.uid())
);

create policy "members_delete_self_or_host"
on public.room_members
for delete
to authenticated
using (
  uid = auth.uid()
  or exists (select 1 from public.rooms r where r.id = room_id and r.host_uid = auth.uid())
);

-- ROOM_DECKS (read only pentru membri; scrieri doar via Service Role/funcții)
create policy "decks_select_members_only"
on public.room_decks
for select
to authenticated
using ( public.is_member_of_room(room_id) );

-- ROUNDS (read only pentru membri)
create policy "rounds_select_members_only"
on public.rounds
for select
to authenticated
using ( public.is_member_of_room(room_id) );

-- PLAYER_TIMELINES (read only pentru membri)
create policy "timelines_select_members_only"
on public.player_timelines
for select
to authenticated
using ( public.is_member_of_room(room_id) );

-- CARDS: fără policy => niciun acces pentru anon/auth (Service Role bypass)
-- Dar publicăm o view cu SECURITY DEFINER pentru UI:
grant select on table public.cards_public to anon, authenticated;

-- Safety: permisiuni minime
revoke all on table public.cards from anon, authenticated;
revoke all on table public.rooms from anon;
revoke all on table public.room_members from anon;
revoke all on table public.room_decks from anon;
revoke all on table public.rounds from anon;
revoke all on table public.player_timelines from anon;
