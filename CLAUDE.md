# CLAUDE.md — Rules for Claude Code on this repo

You are pair-programming with the project owner. He does not write code himself.
He reviews diffs and makes product decisions. You write the code.

Read this file in full at the start of every session. Then read `IMPLEMENTATION.md`
to find the current phase and pick up the next unfinished task.

---

## 1. Positioning (do not drift)

Vicinity is for **all US homebuyers**. NOT a Chinese-community platform.

- No `_zh` fields. No bilingual UI. English only for V1.
- No WeChat / 微信 references in schema, UI, or copy.
- No Xiaohongshu / 小红书 in social copy generators.
- Tailwind / Tailwind class names / variable names: English.

If you find any of the above creeping in (e.g. from copying the demo's old code),
strip it. Surface it in the PR description.

---

## 2. Workflow

1. **Always read IMPLEMENTATION.md first** at the start of a session. It lists
   phases and tasks. Pick the first unchecked task.
2. **One task = one PR.** Branch name `phaseN/<task-slug>`. Don't bundle.
3. **Plan before coding.** For each task, post a short plan (3-6 bullets) before
   touching files. Wait for user OK on non-trivial work.
4. **Commit messages**: imperative, prefix with phase: `phase2: add tus uploader`.
5. **End-of-session log**: append a `### YYYY-MM-DD` entry at the bottom of
   IMPLEMENTATION.md with: what shipped, what's blocked, what's next.

---

## 3. Security — non-negotiable

These are the rules that, if broken, the user will be very unhappy:

1. **Never** commit `.env.local` or any file containing real API keys.
2. **Never** put `SUPABASE_SERVICE_ROLE_KEY` in client components, public API
   routes called from the browser, or anywhere reachable by a browser bundle.
   It bypasses RLS — it's effectively a database root password.
   Allowed callers: webhook handlers (after signature verification), cron jobs,
   migrations, and explicit admin scripts under `scripts/admin/`.
3. **Never** disable RLS on a table with `alter table … disable row level security`.
   If you need to bypass RLS for a legitimate reason, use the service role key
   from a secured server context, not by disabling the policy.
4. **Always** validate API input with zod schemas defined in `lib/zod/`. Don't
   trust TypeScript types at runtime.
5. **Always** verify webhook signatures (Cloudflare Stream, Resend if/when
   webhooks are added).
6. **Never** log full PII (email, phone, full address) at `info` level in
   production. Mask or hash before logging.
7. **Never** use `service_role` key from a Server Component or a Route Handler
   that doesn't first verify the caller is authenticated AND authorized for the
   action. Default to `anon` key + RLS.

---

## 4. Code style

- TypeScript **strict** + `noUncheckedIndexedAccess`. No `any`. If a type is
  hard, use `unknown` and narrow with zod.
- No default exports for components or utilities. Named exports only.
  (Next.js `page.tsx` / `layout.tsx` / `route.ts` are the only exceptions —
  the framework requires default exports there.)
- Server Components by default. Mark `'use client'` only when needed (state,
  effects, browser APIs).
- Co-locate component-specific helpers next to the component. Cross-cutting
  utilities go in `lib/`.
- File naming: `kebab-case.ts` for files, `PascalCase` for component exports,
  `camelCase` for functions/variables.
- No barrel files (`index.ts` re-exporting everything). They break tree-shaking
  and make imports ambiguous.
- Tailwind: prefer composing classes inline. Don't extract `@apply` styles
  unless something is genuinely reused 3+ times.

---

## 5. Database & types

- Schema source of truth: `supabase/migrations/*.sql`. Never edit the database
  directly through the Supabase dashboard for schema changes — write a
  migration, commit it, run `pnpm db:push`.
- After every migration, regenerate types: `pnpm db:types`. Commit the
  regenerated `lib/supabase/database.types.ts` in the same PR.
- All tables have RLS enabled. New tables must ship with RLS policies in the
  same migration. A migration that adds a table without RLS is a bug.
- Use `Database['public']['Tables']['<table>']['Row']` types from generated
  types — don't redefine row shapes by hand.

---

## 6. Forbidden patterns

- **No ORMs.** Use `supabase-js` directly. Drizzle / Prisma are over-engineering
  for this stack.
- **No barrel files** (see §4).
- **No `any` casts** to silence errors. Fix the type.
- **No** `eslint-disable` / `biome-ignore` without a comment explaining why.
- **No** committing `console.log` in code paths that run in production. Dev-only
  logs go through a `logger` helper that no-ops in prod (build it in Phase 1).
- **No** inline secrets. Even in tests. Use env vars or fixtures.
- **No** generated/AI-written copy committed as static fixtures unless reviewed
  by the owner.

---

## 7. Cost & quota guardrails

- Anthropic: pin to `claude-sonnet-4-5` (or whatever `ANTHROPIC_MODEL` env is).
  Never call `opus` from V1 code paths. Add a `max_tokens` cap on every call.
- Google Places: cache autocomplete results client-side per session. Never call
  Places API in a render loop.
- Cloudflare Stream: cap upload size at **2 GB** and duration at **5 min** in
  the TUS create endpoint. Reject larger files server-side.
- Resend: never send email in a tight loop or from a Route Handler without a
  rate limit. Lead notifications: 1 email per lead, idempotent.

---

## 8. Things to ask before doing

If a task requires any of the following, **stop and ask the owner first**:

- Adding a new third-party service or paid SaaS.
- Schema changes that drop columns or rename tables (data loss risk).
- Adding a dependency >100 KB to the client bundle.
- Disabling/relaxing RLS on any table.
- Changing the auth flow.
- Anything that touches money (Anthropic spend, Cloudflare Stream minutes,
  Resend email volume) in a way that could 10x current cost.

---

## 9. Definition of done (per task)

A task is done when **all** of the following are true:

- [ ] Code compiles: `pnpm typecheck` passes with zero errors.
- [ ] Lint clean: `pnpm lint` passes with zero errors.
- [ ] Tests added for new logic in `lib/` and API routes. Run: `pnpm test`.
- [ ] If schema changed: migration committed, types regenerated, RLS verified.
- [ ] If new env var: added to `.env.example` with a comment explaining it.
- [ ] PR description includes: what changed, why, manual test steps, any
      env vars to add in Vercel.
- [ ] Updated IMPLEMENTATION.md: check the box, add a one-line note.

---

## 10. When stuck

- If a piece of work is taking >2x the estimated time, **stop and write a
  status note** in IMPLEMENTATION.md describing where you are. Don't keep
  digging silently.
- If you're about to add `any` or disable a lint rule to make something pass,
  **stop**. There's a better path.
- If a migration is going to require backfilling data, **stop and ask** before
  writing the migration. Backfills on production data need a plan.
