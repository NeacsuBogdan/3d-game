# Day 2 — Supabase Link, Data Seeding & 3D Smoke Test

## Scope
Connect the app to the remote Supabase project, apply schema, seed initial data, and validate 3D assets and animations.

## Outcomes
- Supabase project linked (remote), migrations applied
- Directory junction: \supabase/migrations\ → \db/migrations\ (Windows)
- Seeded \public.characters\: Boss, Jolleen, Medic, Rani
- Imported \public.cards\: 245 rows (range 0.5–122.5, unique indices)
- Published \public.cards_public\ SECURITY DEFINER view (id + situation)
- Grants: \GRANT SELECT ON public.characters TO anon, authenticated\
- Debug pages:
  - \/debug/supabase\ — reads \cards_public\ + \characters\
  - \/debug/3d\ — FBX loader with smooth crossfades, sit/stand transitions, camera framing & clamped zoom
- CI green (lint, typecheck, test, build)

## Verification
- \SELECT count(*), min(misery_index), max(misery_index) FROM public.cards;\ → 245, 0.5, 122.5
- No duplicate \misery_index\
- Pages load and play animations smoothly across all four characters
