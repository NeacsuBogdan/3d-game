-- Make membership check bypass RLS via SECURITY DEFINER
create or replace function public.is_member_of_room(_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_members m
    where m.room_id = _room_id
      and m.uid = auth.uid()
  );
$$;

-- Recreate the SELECT policy on room_members to use the function (no self-referencing subquery)
drop policy if exists "members_select_same_room" on public.room_members;

create policy "members_select_same_room"
on public.room_members
for select
to authenticated
using ( public.is_member_of_room(room_id) );