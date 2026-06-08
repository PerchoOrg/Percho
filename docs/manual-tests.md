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

### 1.4 Dashboard layout (top bar)

- [x] `/dashboard/layout.tsx` renders top bar with agent name + Sign out. (2026-06-07, Vercel preview)
- [x] Top bar uses design tokens (dark `--bg`, gold `--brand` accent on the wordmark). (2026-06-07)

### 1.5 Dashboard empty state

- [x] `/dashboard` shows centered dashed-border card with home icon, "No listings yet" headline, muted sub-copy, and gold "+ New listing" CTA. (2026-06-08, Vercel preview `phase1/dashboard-content`)
- [x] CTA links to `/listings/new` (404 expected until Phase 4 — link presence verified, click target is acceptable to defer). (2026-06-08)
- [x] Card respects `--card` / `--border` / `--brand` tokens. (2026-06-08, screenshot review)

### 1.6 Sign out

- [x] `POST /api/auth/signout` clears the Supabase session cookie and redirects to `/login`. (2026-06-08, Mac browser, `phase1/dashboard-content` preview)
- [x] After sign-out, navigating to `/dashboard` redirects to `/login` (auth gate in `dashboard/layout.tsx` works). (2026-06-08)

### 1.7 End-to-end sign-in → dashboard → sign-out

Goal: walk a fresh user through the full Phase 1 happy path on a Vercel preview
deployment and confirm every observable side effect. Run this whenever Phase 1
auth code changes.

Setup (once per run):
1. Use a real inbox you can read (Gmail/iCloud). Supabase deduplicates by
   email; if you've used this address before, either pick a `+tag` variant
   (e.g. `you+vicinity-test1@gmail.com`) or first delete the existing user in
   Supabase SQL Editor:
   `delete from auth.users where email = '<addr>';`
   (the `agents` row cascades automatically — see §1.3).
2. Open the Vercel preview URL for the branch under test. Confirm it loads the
   landing page (no 500).

Happy path:
1. Visit `/login`.
   **Expect**: email input + "Send magic link" button, dark theme, gold accent.
2. Type the test email, click "Send magic link".
   **Expect**: button enters loading state, then a confirmation message
   ("Check your email"). No console errors.
3. Open the inbox. Within ~30s, receive an email from Supabase with a
   "Log in" link.
   **Expect**: link points at `<preview-host>/auth/callback?code=…`.
4. Click the magic link.
   **Expect**: browser lands on `/dashboard` (not `/login?error=…`). Session
   cookie set (`sb-<project>-auth-token` visible in DevTools → Application →
   Cookies).
5. On `/dashboard`:
   **Expect**: top bar shows your agent display name (email local-part by
   default) + "Sign out" button. Body shows the empty-state card with the
   "+ New listing" CTA.
6. In Supabase Studio (or SQL Editor) run:
   `select id, user_id, email, slug, created_at from public.agents
    where email = '<addr>';`
   **Expect**: exactly one row, `user_id` matching the new `auth.users` row,
   `slug` derived from the email local-part, `created_at` within the last
   minute. This confirms the `handle_new_user` trigger fired (re-verifying
   §1.3 in-flow).
7. Click "Sign out" in the top bar.
   **Expect**: redirect to `/login`. The auth cookie is gone (DevTools →
   Application → Cookies → cleared for this host).
8. Try to visit `/dashboard` directly via the address bar.
   **Expect**: server-side redirect (307) to `/login`. You do NOT see a flash
   of dashboard UI before the redirect.

Negative cases:
- [ ] **Expired / reused magic link**: click the same magic link a second time
  (or wait past Supabase's link TTL — default 1h).
  **Expect**: lands on `/login?error=auth_failed` with the red banner.
  Cookie is NOT set.
- [ ] **Unauthenticated dashboard access**: in a private/incognito window with
  no session, visit `/dashboard` directly.
  **Expect**: 307 redirect to `/login`. No agent row created (the auth-gate
  runs before any DB write).
- [ ] **Open-redirect guard**: visit
  `/auth/callback?code=anything&redirect=//evil.com`.
  **Expect**: server ignores the off-host redirect target and routes to
  `/login?error=auth_failed` (or `/dashboard` on success); never to
  `evil.com`. (Already covered in §1.2; re-check whenever the callback handler
  is touched.)

When the full happy path + at least one negative case pass on a fresh email,
mark the Phase 1 row complete in `IMPLEMENTATION.md` and append a DEVLOG
entry with the preview URL and the test email used.

(Add more sections as phases ship.)
