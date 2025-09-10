# Day 3 — Auth & Profiles

## Scope
Email/password auth, first-login username creation, and basic guarded UI.

## Outcomes
- Supabase Auth (email + password) wired
- RLS on `public.profiles` (self-only select/insert/update)
- Pages: `/register`, `/login`, `/account`
- First-login flow: create unique `username` (normalized + validated)
- Global Header (Login/Register or Account/Logout)
- Reusable `<Protected>` wrapper for protected routes
- Unit tests for username helpers
- CI green

## Verification
- Register → `/account` → set username → persists
- Login/Logout works, Header updates accordingly
- RLS prevents reading/updating other users' profiles
- CI runs lint, typecheck, test, build successfully