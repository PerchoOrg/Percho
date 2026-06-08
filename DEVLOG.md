# Vicinity — Development Log

Institutional memory for the project. Updated incrementally, not at session end.

**Format per entry**: timestamp, objective, actions, decisions, issues, resolution, learnings, next steps. Keep concise.

When resuming work: read the most recent entries first, then check IMPLEMENTATION.md for the current phase/task.

---

## 2026-06-08 09:42 UTC — Phase 1.2: /auth/callback route

**Objective**: Land the magic-link callback so end-to-end sign-in works (form → email → click → session → /dashboard).

**Actions**:
- Added `app/auth/callback/route.ts` (GET handler). Reads `?code` and `?redirect`, calls `supabase.auth.exchangeCodeForSession`, 302s to redirect on success or `/login?error=auth_failed` on failure / missing code.
- Updated `app/(auth)/login/page.tsx` to surface `?error=auth_failed` as a red banner above the form ("That sign-in link was invalid or expired").
- Added `package-lock.json` to `.gitignore` (project uses pnpm, not npm — Mac-side `pnpm install` was leaving an npm lockfile behind).
- Branch: `phase1/auth-callback`.

**Decisions**:
- Open-redirect guard: `redirect` must start with `/` and not `//`. Anything else falls back to `/dashboard`. Considered allow-listing specific paths but it's overkill for V1 — the prefix check covers the only attack we care about (cross-host redirect).
- Used the server `createClient()` (anon key + cookie store), not service role. Auth code exchange is exactly what RLS-aware client is for.
- No CSRF token on the callback. `exchangeCodeForSession` validates the code against Supabase's auth backend; an attacker forging the URL doesn't have a valid code.

**Issues**: none.

**Resolution**: typecheck clean. Verification deferred to Vercel preview (URL-level tests + manual magic-link click on Mac).

**Learnings**: package-lock.json sneaking in is a recurring footgun when the owner runs `pnpm install` on Mac — pnpm itself doesn't write that file but Vercel's npm-based caches sometimes do during their flow. Gitignored.

**Next steps**: After verify, merge to main → Task 1.3 (verify `handle_new_user` trigger creates `agents` row, or fix it if it doesn't).

---

## 2026-06-07 — Phase 0: Scaffold

**Objective**: Stand up the V1 repo skeleton (Next.js 14 + Supabase + Cloudflare Stream + Vercel) so Claude Code can pick up Phase 1 cleanly.

**Actions**:
- Created `vicinity-homes/Vicinity` GitHub repo.
- Wrote 32 scaffold files: `package.json`, `tsconfig.json` (strict + `noUncheckedIndexedAccess`), `biome.json`, `next.config.mjs`, Tailwind config, Supabase client trio (`lib/supabase/{client,server,middleware}.ts`), zod schemas, AI/CF stubs, CI workflow, `.env.example`, `CLAUDE.md`, `IMPLEMENTATION.md`, `docs/ARCHITECTURE.md`, `docs/architecture.html`.
- Wrote two migrations: `0001_init.sql` (9 tables: agents, communities, listings, listing_videos, community_videos, schools, pois, leads, events — all RLS enabled, fair-housing audit fields NOT NULL on schools/pois) and `0002_agent_signup_trigger.sql` (auto-create `agents` row on `auth.users` insert).
- Pushed to `main` directly per owner request.

**Decisions**:
- All-TypeScript stack, no Python service in V1. LLM calls collected under `lib/ai/` for future extraction.
- `listing_videos` and `community_videos` split — community videos cross-listing reusable, only sustainable design for Vivian's workload.
- Supabase Auth (not Cognito) for V1; documented as "switch later if needed, not a blocker".
- Cloudflare Stream over MediaConvert — 5 days saved, accepted vendor coupling at storage layer (not data layer).

**Issues**:
- `next.config.ts` rejected by Next 14 (only `.mjs/.js` supported in 14). Fixed to `.mjs`.
- TypeScript strict caught untyped `cookiesToSet` parameter in middleware + server cookie adapters. Added `{ name: string; value: string; options?: CookieOptions }[]` annotations.
- Vercel deployment protection blocked Hermes browser verification of preview URLs. Owner disabled "Vercel Authentication" on previews so verify pipeline works.
- Owner pasted real API keys into chat once. All 5 keys (Anthropic, Supabase service_role, Supabase anon, Cloudflare Stream, Resend) rotated immediately. Re-emphasized in CLAUDE.md §3.

**Learnings**:
- Verification path established: agent pushes branch → Vercel preview auto-deploys → Hermes browser tools navigate + screenshot + check console → owner's Mac picks up cookie/email flows that need a real browser identity.
- Vercel preview URL naming is unguessable; owner must paste deployment URL after each push.

**Next steps**:
- Phase 1 task 1.1 (login page) — done, merged.
- Phase 1 tasks 1.2–1.7 next.

---

## 2026-06-07 — Phase 1.1: Login page

**Objective**: Build `/login` with email + magic link via `supabase.auth.signInWithOtp`. No callback yet (1.2).

**Actions**:
- Created `app/(auth)/layout.tsx` (centered minimal layout, no dashboard chrome).
- Created `app/(auth)/login/page.tsx` (Server Component, reads `?redirect=` from searchParams, defaults to `/dashboard`).
- Created `app/(auth)/login/login-form.tsx` (Client Component, manages email state, submit → `signInWithOtp`, success → "Check your inbox" view, failure → red error inline).
- PR `phase1/login-page`, merged to main as `e3325d2`.

**Decisions**:
- Client-side `signInWithOtp` over Server Action — `@supabase/ssr` already manages cookies via the browser client; Server Action would route around that.
- No CAPTCHA, no custom rate limit, no client-side email format check beyond `<input type="email" required>`. Supabase enforces OTP rate limit server-side.
- Open-redirect hardening (whitelist for `?redirect=`) deferred to task 1.2 callback route, where the redirect actually executes.

**Issues**: None.

**Resolution**: Merged.

**Learnings**:
- Supabase rate-limits magic link sends per email aggressively in dev (good — exercised the form's error path during verify without writing extra tests).
- Hermes browser tools verified SSR + form interaction + error path on Vercel preview without owner's Mac. Magic link click-through still requires owner's real inbox.

**Next steps**:
- Task 1.2: `/auth/callback` route — exchange `?code=` for session, validate redirect target (must start with `/`, not `//`), redirect to dashboard.

---

## 2026-06-07 — Phase 1.2: Auth callback route

**Objective**: Build `GET /auth/callback` — exchange `?code=` for session, redirect to `?redirect=` target, harden against open-redirect.

**Actions**:
- Created `app/auth/callback/route.ts` (38 lines). GET handler: reads `code` + `redirect` from URL; calls `supabase.auth.exchangeCodeForSession(code)`; on success redirects to validated target; on any failure redirects to `/login?error=auth_failed`.
- Open-redirect guard: `redirect` must `startsWith('/')` AND NOT `startsWith('//')`. Otherwise falls back to `/dashboard`.
- Updated `app/(auth)/login/page.tsx` to render a red banner when `?error=auth_failed` is in the URL.
- Added `package-lock.json` to `.gitignore` (pnpm project; npm lockfile would conflict).
- PR `phase1/auth-callback`, merged to main as `a4a04f1`.

**Decisions**:
- 307 redirect (Next default) over 302 — preserves request method; consistent with Next defaults.
- Single error code `auth_failed` covers both "no code" and "exchange failed" — failure UX is identical so disambiguating adds no value.
- No structured logging of exchange failures yet — Phase 1 keeps it minimal; will revisit with observability work.

**Issues**: None.

**Resolution**: Merged. Hermes browser verified all four redirect paths on Vercel preview. Real magic-link click-through end-to-end will be exercised naturally in 1.4 when dashboard layout renders.

**Learnings**:
- Vercel Next.js redirects show as 307 in HTTP, not 302 — confirmed expected.
- Open-redirect guard pattern (`startsWith('/') && !startsWith('//')`) is the right minimal check; protocol-relative URLs are the only browser attack vector here.

**Next steps**: Task 1.3 — verify `handle_new_user` trigger end-to-end and document.

---

## 2026-06-07 — Phase 1.3: Trigger verification + manual test log

**Objective**: Confirm the `handle_new_user` trigger (migration 0002) actually creates an `agents` row on Supabase Auth signup, and document the verification so it's repeatable.

**Actions**:
- Owner already exercised the full flow during 1.1 verification (submitted personal email at `/login`, clicked magic link, observed new row in `auth.users` AND `public.agents` in Supabase Studio with derived slug).
- Updated `docs/manual-tests.md` to record exactly what was verified, when, and how to re-run cleanly (use a fresh email; cleanup via `auth.users` deletion cascades to `agents` via FK — incidentally verifies the cascade).
- Filled in checkboxes for Phase 0 and Phase 1.1–1.3.

**Decisions**:
- No automated integration test for the trigger in V1. Reasoning: needs a separate Supabase test instance + service-role key in CI, high setup cost for a declarative SQL trigger that's stable once verified. Revisit only if migration 0002 changes.
- Cleanup path (deleting from `auth.users`) doubles as a cascade-FK verification.

**Issues**: None.

**Resolution**: Trigger confirmed in production-like Supabase environment. Runbook in place.

**Learnings**:
- Slug derivation from email local-part works as designed; collision suffix logic untested in practice but SQL is straightforward.
- `docs/manual-tests.md` is the runbook, DEVLOG is the narrative — keep them complementary, not redundant.

**Next steps**: Task 1.4 — build `/dashboard/layout.tsx` (top bar, agent name, Sign out).

---
