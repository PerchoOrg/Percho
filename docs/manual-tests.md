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

## Phase 5 — lead capture + email notification (5s e2e)

Goal: a non-Vicinity buyer fills the lead form on a published listing page,
the agent receives an email within 5 seconds, and the lead appears live in
`/dashboard/leads` without a page refresh.

Setup (once per Resend domain change):
1. Confirm `RESEND_API_KEY` is set in Vercel (Production + Preview env).
2. Confirm `supabase secrets list` (Mac) shows `RESEND_API_KEY` for the
   Edge Function runtime.
3. Confirm `RESEND_FROM` — defaults to `Vicinity <onboarding@resend.dev>`
   while domain verify pending; switch to `noreply@vicinities.cc` once
   Cloudflare DNS records (SPF / DKIM / DMARC) verify in Resend.
4. Migrations 0006 + 0007 + 0008 + 0009 applied (`supabase db push`).
5. Edge Function `notify-lead` deployed (`supabase functions deploy notify-lead`).
6. Vault secret `service_role_key` holds a real JWT (eyJ…, ~200+ chars).

### 5.1 — public form submit

1. Open a published listing page (incognito, no agent session).
   `/v/<agent-slug>/<listing-slug>`
   **Expect**: lead modal accessible via the "Contact agent" CTA.
2. Fill: name "Carol Test", contact "carol+vtest@gmail.com", message
   "Is this still available?". Submit.
   **Expect**: success state in modal, modal auto-closes ~1.5s.
3. Check Network tab: `POST /api/leads` returns 200 with `{ id, ok: true }`.

### 5.2 — server-side persistence

4. In Supabase SQL Editor:
   `select id, agent_id, name, email, message, source, notified_at, created_at
    from public.leads order by created_at desc limit 1;`
   **Expect**: a row matching the submitted name/email, `agent_id` is the
   listing's owner (server-injected — not from client), `notified_at` is
   non-null within 5s of the insert.

### 5.3 — Edge Function fired

5. In Supabase Dashboard → Edge Functions → notify-lead → Logs.
   **Expect**: a recent invocation with status 200, no `Invalid JWT` errors,
   no `RESEND_API_KEY not configured`.
6. In SQL Editor:
   `select * from net._http_response order by created desc limit 1;`
   **Expect**: status 200 from the trigger's pg_net call.

### 5.4 — email delivered

7. Check the agent's inbox (the email tied to the agent owning the listing).
   **Expect**: within 5s, an email from `Vicinity <…>` with subject
   `New inquiry · <listing address>`. Body has buyer name, contact info,
   message, and a "Reply in dashboard" CTA pointing at
   `https://vicinities.cc/dashboard/leads/<id>`.
   **Spam check**: lands in primary inbox, not spam (only valid once
   `vicinities.cc` is domain-verified in Resend; `onboarding@resend.dev`
   often spam-flags).
8. Click the CTA → lands on the lead detail page (after dashboard auth
   redirect if needed).

### 5.5 — Realtime list

9. With the agent logged in, open `/dashboard/leads` in one tab.
   **Expect**: the new lead is visible in the list with a "sent" badge,
   address, message preview, and time-ago.
10. Submit a SECOND lead (different name) in another browser without
    refreshing tab from step 9.
    **Expect**: within ~2s, the new lead appears at the top of the list
    without a manual refresh. Polling fallback (8s) catches it even if
    Realtime drops.

### 5.6 — detail + reply

11. Click the lead in the list.
    **Expect**: detail page with full message, contact info, listing
    address (linked to `/dashboard/listings/{id}/edit`), and a gold
    "Reply by email" button.
12. Click "Reply by email".
    **Expect**: opens the OS mail client with `To: <buyer email>`, subject
    `Re: your inquiry about <address>`, body pre-filled with a polite
    greeting referencing the listing.
13. For phone-only leads (no email), the modal exposes a `tel:` shortcut
    instead.

### 5.7 — idempotency

14. In SQL Editor, manually re-fire the Edge Function for an already-sent
    lead:
    `select net.http_post(url := '<project>/functions/v1/notify-lead',
       headers := jsonb_build_object('Content-Type','application/json',
       'Authorization', 'Bearer ' || (select decrypted_secret from
       vault.decrypted_secrets where name = 'service_role_key')),
       body := jsonb_build_object('lead_id', '<existing-lead-id>'));`
    **Expect**: response `{ ok: true, skipped: 'already_notified' }`,
    no second email arrives.

### 5.8 — failure modes

15. Submit with neither email nor phone — server returns 400 with
    `email or phone required` (mirrors zod test).
16. Submit with `listing_id` of an unpublished or archived listing — server
    returns 404 (route guard rejects non-published listings).
17. With `RESEND_API_KEY` temporarily removed: insert a lead → Edge
    Function returns 500 `resend_not_configured`, lead row exists but
    `notified_at` stays null. Restore key, re-fire (step 14 pattern) —
    email lands, `notified_at` stamped.

When all 17 checks pass on a real Vercel deploy with a verified domain,
mark Phase 5 done in `IMPLEMENTATION.md` and append a DEVLOG entry with
the deploy URL, test buyer email, and observed end-to-end latency.

(Add more sections as phases ship.)
