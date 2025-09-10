# Changelog

## Day 1
- Bootstrap Next.js + TypeScript + Tailwind
- Set up Vitest (smoke test)
- GitHub Actions (lint, typecheck, test, build) green
- Repository hygiene (.editorconfig, .nvmrc, .env.example, .gitattributes)

## Day 2
- Linked remote Supabase project and applied schema
- Added migrations junction (supabase/migrations → db/migrations)
- Seeded characters; imported 245 cards (0.5–122.5, unique)
- Exposed cards_public view; granted read on characters
- Added debug pages: /debug/supabase and /debug/3d (FBX with crossfades and sit/stand)
- CI passing

## Day 3
- Implemented Auth (email/password) and Profiles
- Added `<Protected>` guard and global Header
- Created first-login username flow with validation
- Profiles RLS policies enabled
- CI passing
