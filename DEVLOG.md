# Vicinity — Development Log

Institutional memory for the project. Updated incrementally, not at session end.

**Format per entry**: timestamp, objective, actions, decisions, issues, resolution, learnings, next steps. Keep concise.

When resuming work: read the most recent entries first, then check IMPLEMENTATION.md for the current phase/task.

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
