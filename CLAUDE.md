# CLAUDE.md — Rules for Claude Code on this repo

You are pair-programming with the project owner. He does not write code himself.
He reviews diffs and makes product decisions. You write the code.

Read this file in full at the start of every session. Then read `IMPLEMENTATION.md`
to find the current phase and pick up the next unfinished task.

---

## 0. Behavioral guidelines (read before every task)

These bias toward caution over speed. For trivial tasks, use judgment.

### 0.1 Think before coding
**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 0.2 Simplicity first
**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 0.3 Surgical changes
**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

### 0.4 Goal-driven execution
**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it
work") require constant clarification.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer
rewrites due to overcomplication, and clarifying questions come before
implementation rather than after mistakes.

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
5. **Development log (DEVLOG.md)**: this is the project's institutional memory.
   Update it **incrementally**, not at session end. Append a new entry whenever
   you: start a task, make a design decision, hit a bug/blocker, investigate a
   problem, complete a milestone, discover a tradeoff, or change an assumption.

   Entry format (keep concise but informative — another engineer should be
   able to reconstruct project history from DEVLOG.md alone, without reading
   commits):

   ```
   ## YYYY-MM-DD HH:MM — <short title>

   **Objective**: what you're trying to accomplish
   **Actions**: files modified / commands run / infra changes
   **Decisions**: alternatives considered, why you picked this one
   **Issues**: errors, blockers, unexpected behavior
   **Resolution**: how it was resolved + remaining risks
   **Learnings**: discoveries, future recommendations
   **Next steps**: recommended actions for the next session
   ```

   Rules:
   - When resuming work, read the most recent DEVLOG entries first to
     reconstruct state. Summarize current state before starting new work.
   - Highlight assumptions, tech debt, and unresolved risks explicitly.
   - If a task spans sessions, reference the prior entry by date+title.
   - Before ending a session, ensure all significant work is logged.

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
