# CLAUDE.md — Rules for Claude Code on this repo

You are pair-programming with the project owner. He does not write code himself.
He reviews diffs and makes product decisions. You write the code.

Read this file in full at the start of every session. Then read `DEVLOG.md`
(reverse-chronological log) to find the current state and pick up from there.
v1 has shipped — there is no IMPLEMENTATION.md / phase backlog. Work is now
ad-hoc fixes, polish, and feature requests from the owner / first agent.

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

Percho is for **all US homebuyers**. The US homebuyer pool is multilingual —
non-English buyers (Spanish, Chinese, Vietnamese, Korean, …) are part of the
target audience, not a separate Chinese-community spinoff. Concretely:

- UI chrome / agent dashboard / listing schema: **English only** (no `_zh`
  fields, no bilingual UI in the data layer).
- Buyer-facing **marketing copy generators** MAY emit multiple languages
  when the agent opts in — that's how a US listing agent reaches a
  multilingual buyer pool. Platforms popular with those buyers (Rednote /
  小红书, WeChat Moments) are allowed in the social copy panel for the same
  reason. Pivot date: 2026-06-22 (Phase 48), confirmed by owner.
- Variable / Tailwind class names: English. No Chinese identifiers in code.

If any of the above creep beyond marketing copy generation (e.g. into the
schema, dashboard chrome, or buyer-facing UI strings), strip it. Surface it
in the PR description.

---

## 2. Workflow

### 2.1 Three non-negotiable rules

These are mandated by the owner. Breaking any of them ends the session badly:

1. **No false completion claims.** Never say "merged" / "pushed" / "deployed" /
   "done" without first running `git log origin/main --oneline -5` (or the
   relevant remote ref) and quoting the actual commit SHA back to the user.
   Local commits are NOT pushed. A pushed branch is NOT merged. Inventing SHAs
   in conversation is a fireable offense in this codebase.

2. **DEVLOG.md is reverse chronological.** Newest entry at the TOP, not
   appended at the bottom. When you add an entry, insert it directly after the
   header block (above the most recent existing entry). Each entry leads with
   `## YYYY-MM-DD HH:MM UTC — <title>`.

3. **One branch per phase, not per task.** Branch name is `phaseN/<phase-slug>`
   (e.g. `phase1/auth-and-dashboard`, `phase2/video-upload`). All tasks within
   a phase commit to that single branch. Merge to main ONCE at phase end after
   all tasks in the phase are verified. Per-task branches create merge
   complexity and deploy noise — don't.

### 2.2 Standard flow

1. **Always read DEVLOG.md first** at the start of a session — newest entry
   at the top tells you what actually happened most recently. Pick up from
   the last unresolved item or the user's current ask.
2. **Plan before coding.** For each task, post a short plan (3-6 bullets)
   before touching files. Wait for user OK on non-trivial work.
3. **Commit messages**: imperative, prefix with phase + task:
   `phase2.3: add tus uploader`.
4. **Verify before claiming done.** Push branch → wait for Vercel preview →
   verify via browser tools (HTTP-level + UI screenshot) → ask user for any
   cookie-bound or email-flow checks that need their Mac. Only THEN say
   "verified".
5. **Development log (DEVLOG.md)**: this is the project's institutional memory.
   Update it **incrementally**, not at session end. **Insert each new entry at
   the TOP** (reverse chronological — see §2.1 rule 2). Add an entry whenever
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

6. **Release notes (RELEASE.md)**: this is the **non-technical** changelog —
   read by Vivian and other product stakeholders who don't read code.
   - **Newest at the top**, reverse chronological.
   - Update on every push to `main` that has user-visible impact (UI changes,
   new features, bug fixes users would notice). Skip pure refactors or
   internal-only changes.
   - **No code/file/library/SHA names.** Write what a user would say:
   "auto-save in the listing editor", not "added debounced useEffect in
   EditListingForm.tsx".
   - Follow the standard template at the bottom of RELEASE.md (🚀 Features /
   ✨ Improvements / 🐛 Bug Fixes / 🔧 Technical / ⚠️ Known Issues /
   📈 Metrics).
   - Versioning: `v0.x.y` pre-launch. Bump `x` for a meaningful release; bump
   `y` for a same-day follow-up. After public launch → `v1.0.0`.
   - DEVLOG.md (engineer-facing) and RELEASE.md (product-facing) are both
   updated — they are NOT the same document.

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
- [ ] Added a DEVLOG entry for the work (objective, actions, decisions, learnings).

---

## 10. When stuck

- If a piece of work is taking >2x the estimated time, **stop and write a
  status note** in DEVLOG.md describing where you are. Don't keep
  digging silently.
- If you're about to add `any` or disable a lint rule to make something pass,
  **stop**. There's a better path.
- If a migration is going to require backfilling data, **stop and ask** before
  writing the migration. Backfills on production data need a plan.
