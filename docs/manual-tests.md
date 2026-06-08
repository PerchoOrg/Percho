# Manual test log

Some checks need a human to run (auth flows, real email delivery, video
upload from a phone). Record results here so they're not re-run blindly.

## Phase 0 — scaffold smoke test

- [x] Local: `pnpm dev` shows landing page on `http://localhost:3000`. (2026-06-07)
- [x] Vercel: production deploy shows landing page on the assigned `*.vercel.app`. (2026-06-07)
- [x] Supabase Studio: 9 tables present, RLS column shows enabled on each. (2026-06-07)

## Phase 1 — auth

### 1.1 Login page renders & submits

- [x] `/login` renders email input + "Send magic link" button. (2026-06-07, Vercel preview)
- [x] Button disabled when email empty; enables on input. (2026-06-07)
- [x] Submitting hits Supabase Auth (verified via Supabase rate-limit error path). (2026-06-07)
- [x] `/login?error=auth_failed` shows red banner. (2026-06-07)

### 1.2 Auth callback

- [x] `GET /auth/callback` (no code) → 307 to `/login?error=auth_failed`. (2026-06-07)
- [x] `GET /auth/callback?code=fake` → 307 to `/login?error=auth_failed`. (2026-06-07)
- [x] Open-redirect guard: `?redirect=//evil.com` is ignored. (2026-06-07)

### 1.3 `handle_new_user` trigger

End-to-end verification — when a new user signs up via Supabase Auth,
trigger `on_auth_user_created` fires `handle_new_user()`, which inserts
a corresponding row into `public.agents`.

How it was verified (2026-06-07):
1. Owner submitted personal email at `/login` on Vercel preview.
2. Supabase sent magic-link email; owner clicked it.
3. Verified in Supabase Studio:
   - `auth.users` has a new row with that email.
   - `public.agents` has a new row with matching `user_id`, `email`,
     and a `slug` derived from the email local-part.

Re-running this check:
- Use a fresh email (Supabase deduplicates by email).
- Or, in Supabase SQL Editor, run
  `delete from auth.users where email = 'test+xxx@example.com';`
  to clean up — `ON DELETE CASCADE` on `agents.user_id` removes the
  agents row automatically (this also incidentally verifies the cascade).

### 1.4–1.7 (pending)

- [ ] `/dashboard/layout.tsx` renders top bar with agent name + Sign out.
- [ ] `/dashboard` empty state visible after first sign-in.
- [ ] `POST /api/auth/signout` clears session; `/dashboard` then redirects to `/login`.
- [ ] Full sign-in → dashboard → sign-out loop on a fresh email.

(Add more sections as phases ship.)
