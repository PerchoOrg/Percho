You are resuming Task 1 in the Percho repo (`~/Percho`). A previous session correctly
stopped rather than improvising, because the approved plan was outside your file-access
scope. That is fixed.

## Read these IN FULL, in order, before touching anything

1. `CLAUDE.md` — all rules. Especially §2.1: no false completion claims (quote real
   SHAs from `git log`), DEVLOG.md is reverse-chronological (newest entry at the TOP),
   one branch per phase, never a personal Anthropic key / opus-5 only.
2. `DEVLOG.md` — top 3 entries.
3. `docs/design/spec-v3/prompts/_MASTER.md` — the 8 non-negotiable hard rules.
4. `docs/design/spec-v3/prompts/task-1-feed.md` — the task.
5. **`docs/design/spec-v3/prompts/PLAN-task-1.md` — YOUR OWN APPROVED PLAN.** This is
   the file you could not reach before (it was `~/.claude/plans/you-are-working-in-wise-avalanche.md`).
   It is now tracked in the repo. §7 is the ordered work list. Execute it.
6. `docs/design/spec-v3/prompts/RUN-task-1-approved.md` — the owner's rulings ON that
   plan. Where the memo and the plan disagree, the memo wins.
7. `docs/design/spec-v3/00-overview.md` and `01-feed.md` — full text.
8. `docs/design/spec-v3/prompts/RUN-task-1-live.md` — the original briefing, including
   the measured Supabase data-gap facts (§"Data-gap situation"). Note that PLAN-task-1
   §"Five corrections to the briefing" supersedes parts of it; the corrections are
   accepted as fact.

## Starting state (verified just now — do not re-derive)

- You are on branch `phase-ios1/discovery-feed`, at `26d3f8b`, identical to `origin/main`.
- Working tree: only untracked files are the four `docs/design/spec-v3/prompts/RUN-task-1-*.md`
  / `PLAN-task-1.md` prompt docs. Commit `PLAN-task-1.md` as part of your first step —
  the plan should be a tracked, reviewable artifact.
- Task-0 gate GREEN in `apps/mobile`: `pnpm test` 26/26, `pnpm typecheck` 0, `pnpm lint` clean.

## Execute

Work §7 steps 1→10 in order. Each step:
- ends green on `pnpm test` / `pnpm typecheck` / `pnpm lint` in `apps/mobile`,
- gets its own commit on `phase-ios1/discovery-feed` (`phase-ios1.N: <what>`),
- gets an incremental DEVLOG entry inserted at the TOP of `DEVLOG.md`.

Do NOT push and do NOT merge to main. Stop and report when step 10 is done, or the
moment you hit something that needs an owner decision.

Reminders carried from the approval memo:
- Step 4 fixes the shipped task-0 bug: `SwipeStack.tsx:98` gates the back face on the
  *function* `renderBack` rather than its result. Add a regression test that a card kind
  with no back face cannot enter a flipped state at all. Call it out explicitly in DEVLOG —
  task-0's review missed it.
- `finestAvailableLevel(pool)` is approved. Unit-test both the city-reading and the
  zip-reading of that same rule, so the later zip backfill is provably a no-op on the engine.
- `city_geo_units` view migration is APPROVED — write it. Additive, read-only,
  `security_invoker = true`, no column drops, aggregate in SQL (not in-process).
- Zip reverse-geocode backfill is NOT approved. Do not write the script, do not spend.
  Stage 2 ships on the city fallback; document the degradation.
- `buyer_scope_events` + `/api/mobile/events` are deferred. Ship the client event-queue
  contract with a no-op sink only. Do not widen the agent-facing `events` zod union.
- B2: correct the Stage-0 row of the §1.7 mix table in `01-feed.md` to `ask ×7 · trade-off ×3`
  plus a one-line footnote. Fix the spec, don't work around it.
- B5: undo reverts the signal, never the stage; additionally remove a not-yet-displayed
  milestone card from the deck if the undone swipe was the one that inserted it.
- B6: `pass` is silent all the way through, including settle.
- NO fabricated median / school / commute / price numbers anywhere, not even as
  placeholders. A missing stat renders as absent. Any dev fixture lives on a gitignored path.

If a step is only compile-verifiable on this Linux box (step 8), say so plainly rather
than claiming visual verification. The 6 `PENDING-SIM` items go into
`docs/design/spec-v3/VERIFY-task-1-on-mac.md` for the owner to run on the Mac mini.
