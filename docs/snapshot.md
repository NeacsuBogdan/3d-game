# Project Snapshot — 3D Card Game

_Last updated: 2025-09-10 (End of Day 4)_

## TL;DR
- Stack: Next.js 15 (App Router), TypeScript, Tailwind; three.js (+ three-stdlib); GSAP; Supabase (Auth, Postgres, Realtime, RLS); Vitest
- Repo/CI: CI (lint, typecheck, test, build) green on `main`
- Status by days:
  - Day 1: Scaffold, CI, docs baseline ✅
  - Day 2: Characters pipeline (FBX), basic 3D debug scene, CSV import for cards ✅
  - Day 3: Auth (email/password), `/login`, `/register`, `/account` with first-login username, RLS on `profiles` ✅
  - Day 4: Rooms create/join, lobby realtime members + presence, 3D showroom lobby, character selection (unique), ready toggle, swap flow ✅

## Local environment
- Node: `.nvmrc` → Node 22 LTS (CI). Local 23 OK, dar preferă 22.
- npm 11.x, Git 2.50+
- `.env.local`:
  - `NEXT_PUBLIC_SUPABASE_URL=...`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
  - `SUPABASE_SERVICE_ROLE=...` (server only)
- Supabase project ref: `esnovimmhnuoijlhnvwp`

## Database (Supabase Postgres)
- Extensions: `pgcrypto`
- Enums: `room_status { lobby, playing, ended }`, `round_result { hit, miss, timeout, aborted }`
- Tables & view: `profiles`, `characters`, `rooms`, `room_members`, `cards`, `cards_public` (view), `room_decks`, `rounds`, `player_timelines`
- RLS: `profiles` self; `rooms` members read / host write; `room_members` members read / self+host write
- Seeds: characters (boss, jolleen, medic, rani) → `public/models/<Char>/base.fbx`; ~245 cards CSV

## Realtime
- `room_members` via `postgres_changes`
- Presence: `room:{id}:presence`
- Broadcast: `room:{id}:events` (swap flow)

## App routes
- Pages: `/`, `/login`, `/register`, `/account`, `/room/create`, `/join`, `/room/[code]`, `/debug/*`
- API: `POST /api/rooms/create`, `POST /api/rooms/join` (Service Role only)

## Lobby (Day 4)
- UI: seats list, unique `character_id` selector (auto-assign first free on join), Ready toggle
- 3D showroom: your character centered, others flanking; `base.fbx` as idle (AnimationClip #0 if present); label above head; no re-init on ready/unready; lazy load + cache per character; smooth swap
- Swap: request → accept → vacate + guarded updates, no unique constraint violations

## What’s next (Day 5+)
- Game start (deck seeding, `status=playing`, `turn_uid`)
- Realtime: `turn_changed`, `draw_started`, validations
- Server validation route (Service Role)
- GSAP effects, timeout handling, reconnection snapshot
- E2E (Playwright), Sentry, GLB conversion & perf, deploy (Vercel + Supabase Storage)
