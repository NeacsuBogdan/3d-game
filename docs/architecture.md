# Architecture (Day 1)

## Frontend
- Next.js (App Router) + TypeScript
- Tailwind CSS for UI overlay
- three.js + GSAP for 3D & effects (minimal for now; gameplay logic lands in next days)

## Backend (starting Day 2)
- Supabase: Auth, Postgres, Realtime, RLS
- Critical validations on server (Service Role). Client does not see card scores before reveal.

## Observability (later)
- Sentry (frontend + API)
- Vercel logs & analytics

## Key Decisions (so far)
- Node 22 LTS (consistent dev/CI/prod)
- CI: GitHub Actions running lint/typecheck/test/build
- \.gitattributes\ to normalize LF on Windows
