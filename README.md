# 3D Card Game (Next.js + three.js + Supabase)

**Status:** Day 1 scaffold (Next.js + Tailwind + tests + CI).  
**Stack:** Next.js (App Router), TypeScript, Tailwind CSS, three.js, GSAP, Vitest (+ Testing Library), GitHub Actions.

## Requirements
- Node **22.x** (LTS) – see \.nvmrc\
- npm, Git

## Quickstart (dev)
\\\ash
npm ci
npm run dev
# http://localhost:3000
\\\

## Scripts
- \
pm run dev\ – start dev server
- \
pm run build\ – production build
- \
pm start\ – run production server
- \
pm run lint\ – ESLint
- \
pm run typecheck\ – TypeScript \--noEmit\
- \
pm run test\ – Vitest (unit)
- \
pm run test:watch\, \
pm run test:coverage\

## CI/CD
GitHub Actions runs \lint\, \	ypecheck\, \	est\, \uild\ on the \main\ branch.  
Workflow file: \.github/workflows/ci.yml\.

## Environment
Use \.env.local\ (not committed). A template is provided in \.env.example\.  
> \SUPABASE_SERVICE_ROLE\ is **server-only** (API routes), never exposed to the client.

## Project Structure (short)
\\\
/ (root)
  app/                 # Next.js app
  db/                  # migrations, seeds, SQL tests
  e2e/                 # Playwright (E2E) – later
  public/models/       # 3D models (GLB)
  scripts/             # internal tooling
  docs/                # documentation
  .github/workflows/   # CI
\\\

## Contributing
See [CONTRIBUTING.md](./CONTRIBUTING.md). Trunk-based, small PRs, green CI before merge.
