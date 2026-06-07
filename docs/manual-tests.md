# Manual test log

Some checks need a human to run (auth flows, real email delivery, video
upload from a phone). Record results here so they're not re-run blindly.

## Phase 0 — scaffold smoke test

- [ ] Local: `pnpm dev` shows landing page on `http://localhost:3000`.
- [ ] Vercel: production deploy shows landing page on the assigned `*.vercel.app`.
- [ ] Supabase Studio: 9 tables present, RLS column shows enabled on each.

## Phase 1 — auth

- [ ] Magic-link sent to a personal email arrives in <30s.
- [ ] Click link → lands on `/dashboard`, top bar shows agent name.
- [ ] `agents` row created (verify in Supabase Studio).
- [ ] Sign out clears session; visiting `/dashboard` redirects to `/login`.

(Add more sections as phases ship.)
