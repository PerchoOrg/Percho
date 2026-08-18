You are continuing Task 1 in the Percho repo (`~/Percho`). Steps 1–4 of the plan are
DONE and committed. You are picking up at **step 5**.

## Read these IN FULL before touching anything

1. `CLAUDE.md` — all rules. Especially §2.1: no false completion claims (quote real SHAs
   from `git log`), DEVLOG.md reverse-chronological (newest at TOP), one branch per phase.
2. `DEVLOG.md` — top 4 entries (they describe steps 1–4 exactly as built).
3. `docs/design/spec-v3/prompts/PLAN-task-1.md` — the approved plan. §7 is the work list.
4. `docs/design/spec-v3/prompts/RUN-task-1-approved.md` — owner rulings on that plan.
   Where memo and plan disagree, the memo wins.
5. `docs/design/spec-v3/01-feed.md` and `00-overview.md` — full text.
6. The code that already exists in `apps/mobile/lib/feed/` — read every file there before
   writing anything new. Steps 5–10 must build on the APIs already committed, not on the
   plan's prose where the two differ. The committed code is ground truth.

## Starting state — verified by the owner just now, do not re-derive

- Branch `phase-ios1/discovery-feed`, tip = `1184a08`. Working tree CLEAN.
- Gate GREEN: `apps/mobile` → `pnpm test` **137/137**, `pnpm typecheck` 0, `pnpm lint` clean.
- Steps 1–4 committed:
  - `8b4d407` step 1 — type layer (8-kind card union, geo contract, behavior, stage mixes)
  - `0ad9c47` step 2 — signal reducer + §1.7 promotion gates (50 boundary tests)
  - `fed9efd` step 3 — §1.7 composition engine + §0.2 listing hard gate
  - `1184a08` step 4 — task-0 flip bug fixed (back face gated on rendered result)

## IMPORTANT — why the tree was cleaned

Two agents were accidentally launched on this branch in parallel and both wrote step-5
files. Those four foreign files (`lib/feed/events.ts`, `events.test.ts`,
`state/event-queue.ts`, `state/feed-session.ts`) were MOVED OUT to
`/tmp/task1-collision-salvage/` and are NOT part of the branch. They are dead — one of
them had a type error against the committed `AskChoice`. **Do not read them, do not adopt
them.** Write step 5 fresh against the committed types.

You are the ONLY agent on this branch now. There is no contention. Do not stop to ask
about worktree protocol — the owner has designated `~/Percho` as your write target for
this run.

## Execute steps 5 → 10

| # | Step |
|---|---|
| 5 | `feed-session.ts`, `event-queue.ts` + tests |
| 6 | Server: geo-unit aggregation (`city_geo_units` view) + `/api/mobile/feed` pool contract + zod |
| 7 | API base config (`app.json` extra + expo-constants) |
| 8 | Card faces ×9 + chrome/system-state components |
| 9 | `(tabs)` group, new `feed.tsx`, delete legacy `app/feed.tsx` + `app/place/[slug].tsx` |
| 10 | Write `docs/design/spec-v3/VERIFY-task-1-on-mac.md` mirroring the task-0 doc |

Each step: ends green on `pnpm test` / `pnpm typecheck` / `pnpm lint` in `apps/mobile`;
one commit prefixed `phase-ios1.1:`; one DEVLOG entry inserted at the TOP.

**Do not push. Do not merge to main.** Stop and report at the end of step 10.

## Standing constraints

- Bedrock / opus-5 only. Never a personal `sk-ant-*` key.
- No mock/test data in any commit; dev fixtures on gitignored paths only. No video in git.
- No fabricated stat, ever — not even as a placeholder. Missing renders as absent.
- Tokens only; zero hex literals outside `theme/tokens.ts`.
- `city_geo_units` view migration is APPROVED: additive, read-only, `security_invoker = true`,
  no column drops, aggregate in SQL not in-process. Follow the repo's migration workflow.
- Zip reverse-geocode backfill is NOT approved — do not write it, do not spend. Stage 2
  ships on the city fallback; document the degradation in the VERIFY doc.
- `buyer_scope_events` + `/api/mobile/events` are DEFERRED. Ship the client event-queue
  contract with a no-op sink only. Do not widen the agent-facing `events` zod union.
- B5: undo reverts the signal, never the stage; also remove a not-yet-displayed milestone
  card from the deck if the undone swipe was the one that inserted it.
- B6: `pass` is silent all the way through, including settle.
- Step 8 is compile-verifiable only on this Linux box — say so plainly, never claim visual
  verification. Step 9 must pass `expo export --platform ios`.
- The 6 `PENDING-SIM` visual acceptance items go into `VERIFY-task-1-on-mac.md` for the
  owner to run on his Mac mini.

If something genuinely contradicts the plan, stop and report — but prefer the committed
code over the plan's prose, and keep going.
