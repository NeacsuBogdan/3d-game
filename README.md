# 3D Card Game (Next.js + three.js + Supabase)

**Status:** **Day 4 complete** (CI green)

A multiplayer card-game prototype with a **3D lobby (showroom-style)** built on **Next.js 15 (App Router)**, **three.js**, and **Supabase** (Auth, Postgres, Realtime, RLS).

---

## Stack
- **App:** Next.js (App Router), TypeScript, Tailwind CSS
- **3D:** three.js (+ three-stdlib), GSAP
- **Backend:** Supabase (Auth, Postgres, Realtime, RLS)
- **Tests:** Vitest (+ Testing Library)
- **CI:** GitHub Actions

---

## Requirements
- Node **22.x** (LTS) — see .nvmrc  
  _Local Node 23 works, but prefer 22 for parity with CI._
- npm, Git

---

## Quickstart (dev)
npm ci
npm run dev
# http://localhost:3000

# Quality Gate (local)
npm run typecheck
npm run lint
npm run build
npm run test

# Scripts
npm run dev          # start dev server
npm run build        # production build
npm run start        # run production server
npm run lint         # ESLint
npm run typecheck    # TypeScript (noEmit)
npm run test         # Vitest (unit)
npm run test:watch
npm run test:coverage

---

## CI/CD

GitHub Actions runs lint, typecheck, test, build on the main branch.  
Workflow file: .github/workflows/ci.yml.

---

## Environment

Use .env.local (not committed). A template is provided in .env.example.  
SUPABASE_SERVICE_ROLE is server-only (route handlers / edge functions), never exposed to the client.

NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE=...      # server-only

---

## Project Structure (short)
/  
  app/                 # Next.js app  
  db/                  # migrations, seeds  
  public/models/       # 3D models (FBX)  
  src/                 # source code (hooks, components, lib)  
  docs/                # documentation  
  .github/workflows/   # CI  

---

## Key paths

src/app/room/[code]/page.tsx → route; SSR param handling  
src/app/room/[code]/LobbyPage.tsx → lobby container (React client)  
src/app/room/[code]/components/ShowroomStage3D.tsx → three.js showroom scene  
src/app/room/[code]/components/* → UI (header, stage panel, ready bar, swap banners)  
src/app/room/[code]/hooks/* → data hooks (room, members, presence, swap, characters)  
src/lib/supabase/{client,server,admin}.ts → Supabase clients  

---

## API

src/app/api/rooms/create/route.ts  

---

## Database (Supabase Postgres) — Summary

Extensions: pgcrypto  

Enums:  
room_status { lobby, playing, ended }  
round_result { hit, miss, timeout, aborted }  

Tables & view (main):  
profiles(uid PK → auth.users.id, username UNIQUE, created_at) — RLS: self  
characters(id PK, label, model_url, clips jsonb, tri_budget, enabled)  
rooms(id PK, code UNIQUE, host_uid, seed, min_index, max_index, status, turn_uid, turn_ends_at, deck_hash, created_at) — RLS: members read; host write  
room_members(room_id, uid, seat_index, display_name, character_id, is_ready, joined_at) — unique seat & character per room — RLS: members read; self/host write  
cards(id PK, situation, misery_index, enabled) — RLS: no direct client read  
cards_public (view, SECURITY DEFINER) — exposes { id, situation }  
room_decks(room_id, card_id, draw_order, drawn, score_snapshot, revealed_at)  
rounds(id, room_id, turn_number, turn_uid, drawn_card_id, result, started_at, resolved_at)  
player_timelines(room_id, uid, card_id, position_index, inserted_at)  

Realtime  
room_members via postgres_changes (INSERT/UPDATE/DELETE)  
Presence channel: room:{id}:presence  
Broadcast channel (swap flow): room:{id}:events  

// swap_request  
{ type: "swap_request", room_id, from_uid, to_uid, from_char, to_char }  

// swap_decline  
{ type: "swap_decline", room_id, from_uid, to_uid }  

// swap_vacated  
{ type: "swap_vacated", room_id, vacated_uid, to_uid, vacated_char, other_char }  

// swap_take_done  
{ type: "swap_take_done", room_id, from_uid, to_uid, initiator_old_char }  

---

## App Routes

Pages:  
/ — home  
/login, /register, /account  
/room/create — create room UI (calls API)  
/join — join room by code (calls API)  
/room/[code] — Lobby (3D showroom + realtime)  
/debug/3d, /debug/supabase — debug  

API:  
POST /api/rooms/create — creates room (+ inserts host in room_members) — Service Role  
POST /api/rooms/join — joins room by code, assigns first free seat — Service Role  

---

## 3D Assets

Folder layout (FBX):  
public/models/  
  Boss/ | Jolleen/ | Medic/ | Rani/  
    base.fbx             # used as idle (AnimationClip #0 if present)  
    anims/  
      sit_idle.fbx  
      sit_to_stand.fbx  
      sitting.fbx  
      sitting_disbelief.fbx  
      sitting_point.fbx  
      sitting_victory.fbx  
      wave.fbx  

Some FBX files exceed 50MB. Long-term: convert to GLB and/or store in Supabase Storage + lazy-load.

---

## Day-by-Day

Day 1: scaffold, CI, docs baseline ✅  
Day 2: characters pipeline (FBX), 3D debug scene, CSV import for cards ✅  
Day 3: auth (email/password), /login, /register, /account with first-login username; RLS on profiles ✅  
Day 4: rooms create/join, lobby realtime members + presence, 3D showroom lobby, character selection (unique), Ready toggle, swap flow ✅  

---

## Day 4 Highlights

UI: seats list, unique character_id (auto-assign first free on join), Ready toggle  
3D: your character centered, others flanking; base.fbx idle (clip #0 if present); label above head; no re-init on ready/unready; lazy-load + cache per character; smooth swap  
Stability: guarded updates (no unique constraint violations during swap)  

---

## Manual Test (Day 4)

Host login → /room/create → redirected to /room/[code]  
Guest login → /join → enter code → appears in lobby list & 3D  
Change character on either side → uniqueness enforced / auto-assign on join  
Toggle Ready on either → label updates, model stays  
Initiate swap (A→B), accept on B → characters swapped (no flicker, no errors)  

---

## Docs

Live snapshot: docs/snapshot.md  
Architecture: docs/architecture.md  
Testing: docs/testing.md  
Day notes: docs/day-1.md, docs/day-2.md, docs/day-3.md, docs/day-4.md  
Changelog: docs/changelog.md  

---

## Contributing

See CONTRIBUTING.md.  
Small PRs, green CI before merge.  
