# 3D Card Game (Next.js + three.js + Supabase)

**Status:** Day 2 complete (CI green)

## Stack
- App: Next.js (App Router), TypeScript, Tailwind CSS
- 3D: three.js, GSAP
- Backend: Supabase (Auth, Postgres, Realtime, RLS)
- Tests: Vitest (+ Testing Library)
- CI: GitHub Actions

## Requirements
- Node **22.x** (LTS) — see \.nvmrc\
- npm, Git

## Quickstart (dev)
\\\ash
npm ci
npm run dev
# http://localhost:3000
\\\

## Scripts
- \
pm run dev\ — start dev server
- \
pm run build\ — production build
- \
pm run start\ — run production server
- \
pm run lint\ — ESLint
- \
pm run typecheck\ — TypeScript (noEmit)
- \
pm run test\ — Vitest (unit)
- \
pm run test:watch\, \
pm run test:coverage\

## CI/CD
GitHub Actions runs **lint**, **typecheck**, **test**, **build** on the \main\ branch.  
Workflow file: \.github/workflows/ci.yml\.

## Environment
Use \.env.local\ (not committed). A template is provided in \.env.example\.  
> \SUPABASE_SERVICE_ROLE\ is **server-only** (route handlers / edge functions), never exposed to the client.

## Project Structure (short)
\\\
/
  app/                 # Next.js app
  db/                  # migrations, seeds
  public/models/       # 3D models (FBX)
  src/                 # source code
  docs/                # documentation
  .github/workflows/   # CI
\\\

## Project Journal
- Day 1: docs/day-1.md
- Day 2: docs/day-2.md

## Contributing
See [CONTRIBUTING.md](./CONTRIBUTING.md). Small PRs, green CI before merge.
