# Day 4 — Create/Join Room + Realtime Lobby

## Scope & Deliverables
- Create Room route handler: generate `code`, insert `rooms`, insert host into `room_members` (Service Role)
- Join Room route handler: join by code, assign first free seat (Service Role)
- Lobby UI: seats list, unique `character_id` selection (auto-assign on join), Ready toggle
- Realtime: `room_members` live updates; presence channel `room:{id}:presence`
- 3D Lobby Showroom: centered self, others on sides, `base.fbx` idle, label above head
- Swap flow: request/accept with vacate→take→confirm, guarded updates (no 23505)

## Definition of Done (DoD)
- Two browsers: host creates, guest joins via code
- Both see each other in seats & 3D scene
- Presence synced; Ready/Unready reflected in both
- Swap works end-to-end without uniqueness errors

## Manual Test
1. Host login → `/room/create` → redirected to `/room/[code]`
2. Guest login → `/join` → enter code → appears in lobby list & 3D
3. Change character on either side → unique enforced / auto-assign on join
4. Toggle Ready on either → label updates, model stays
5. Initiate swap (A→B), accept on B → characters swapped (no flicker, no errors)

## Notes / Known Issues
- Presence indicator shown in label; extra polish possible
- E2E (Playwright) to be added Day 5
- FBX → GLB conversion & CDN/storage recommended for production

## Commits (suggested)
- feat(lobby): 3D showroom + swap flow
- fix(swap): guarded vacate/take prevents unique violations
- chore(docs): day-4 notes + snapshot
