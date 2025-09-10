# Day 1 — Project Setup & CI

## Scope
Bootstrap the application and baseline infrastructure for a professional workflow.

## Deliverables
- Next.js (App Router) + TypeScript + Tailwind scaffold
- Libraries prepared for 3D & backend: three.js, GSAP, @supabase/supabase-js (to be linked on Day 2)
- Unit tests with Vitest (first smoke test passing)
- GitHub Actions CI (lint, typecheck, test, build) – green on main
- Repository hygiene: .editorconfig, .nvmrc (Node 22 LTS), .env.example, .gitattributes

## Scripts
- \
pm run dev\ — local dev
- \
pm run build\ — production build
- \
pm run start\ — run production server
- \
pm run lint\ — ESLint
- \
pm run typecheck\ — TypeScript
- \
pm run test\ — Vitest

## Definition of Done
- Public repo on GitHub
- CI pipeline green on main
