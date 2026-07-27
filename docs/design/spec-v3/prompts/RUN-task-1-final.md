You are finishing Task 1 in the Percho repo (`~/Percho`). Your previous session correctly
stopped and reported two real gaps instead of improvising. The owner has ruled. Execute
the ruling.

## Read first

1. `CLAUDE.md` — §2.1: no false completion claims (quote real SHAs from `git log`),
   DEVLOG.md reverse-chronological (newest at TOP), do not push, do not merge.
2. `DEVLOG.md` — top 8 entries.
3. `docs/design/spec-v3/prompts/PLAN-task-1.md` — §1.3 and §7.
4. `docs/design/spec-v3/prompts/RUN-task-1-approved.md` — owner rulings.
5. `docs/design/spec-v3/prompts/RUN-task-1-step9.md` — the step 9/10 brief, still in force.
6. `docs/design/spec-v3/VERIFY-task-0-on-mac.md` — the doc you mirror in step 10.
7. The real code: `apps/mobile/lib/gesture/`, `hooks/use-swipe-card.ts`,
   `components/SwipeStack.tsx`, `components/cards/`, `components/feed/`, `lib/feed/`.
   Committed code is ground truth.

## Owner's ruling on your gap report

**Your option 1 is approved. Do §1.3 capability plumbing FIRST, then steps 9–10.**

You were right that this is approved plan work misfiled under step 4, not scope invention.
Do it as its own commit before step 9. All seven rows of your gap table get closed:

| Requirement | Fix |
|---|---|
| `SwipeStack` takes `capability: (item) => CardCapability` | replace the `enabled: boolean` prop |
| clamp `translateX` at `maxDisplacementRatio` | `use-swipe-card.ts` ~166-183 |
| expose `tx` to the caller | add to `SwipeStackProps` render args — this is the hard blocker for `TradeoffFace` / `SwipeLabels` |
| `onCommit` + `revealMs` hold before flyout | challenge 900ms reveal |
| flyout 260ms spring damping 26 | currently `withTiming` 220ms |
| block swipe while flipped | §1.1 red-line |
| reset `flipProgress` after flyout, not during | currently synchronous at `:101` |

`commits: false` must actually reach the gesture — a milestone card that commits and flies
out is the exact opposite of §1.5. `lib/gesture/capability.ts` must end this step with real
runtime consumers, not just type references.

The existing 26 task-0 gesture tests stay green. Add tests for the new behaviors
(clamping, `commits: false` non-committal, flip-blocks-swipe, reveal-then-flyout ordering).

**On step 6 — the `city_geo_units` migration ruling stands. Write the migration.** You
were right to flag that step 6 shipped the in-process Node aggregation after the owner
explicitly said "APPROVED, write it… Do NOT reach for the in-process aggregation
fallback." Fix it properly:
- Add the migration under `supabase/migrations/` following the repo's migration workflow
  (read `CLAUDE.md` §8 and look at recent migration files for the house style).
- Additive read-only view, `security_invoker = true`, no column drops, aggregate in SQL.
- **Do NOT select `boundary` in the view** — the dense Nextdoor multipolygons cause
  PostgREST `statement_timeout` (PG 57014), as documented in `lib/feed/geo-units.ts` and
  `lib/communities/list.ts`. That trap is real; preserve the lesson.
- Repoint `apps/web/lib/feed/geo-units.ts` at the view. Same output contract, same cache
  key. Keep every "real or absent" rule: no fabricated median / school / commute numbers,
  `stats` is `{}` when nothing real is known.
- Apply it to the linked remote and verify with a real query, then say exactly what you
  ran and what came back. If applying to the remote fails or needs credentials you don't
  have, say so plainly and leave the migration file committed unapplied — do not fake it.
- Correct the misleading `WIP step6 … (checkpoint)` history in the DEVLOG: note that the
  step-6 code was in fact complete and live-verified (23/23 curl checks), and that the
  deviation was the aggregation location, now fixed.

## Then steps 9 and 10 as briefed in RUN-task-1-step9.md

Step 9: `(tabs)` group + 3 stubs consuming `TabBar`, real `app/(tabs)/feed.tsx`, delete
legacy `app/feed.tsx` and the `app/place/` route, reconcile `_layout.tsx` / `index.tsx`.
Verify with `pnpm test` / `typecheck` / `lint` AND `npx expo export --platform ios`.

Step 10: write `docs/design/spec-v3/VERIFY-task-1-on-mac.md` per that brief — all 6 visual
items as numbered PENDING-SIM checks with expected/observed, the exact Mac commands, and
the Stage-2-degrades-to-city section.

## State

Branch `phase-ios1/discovery-feed`. Working tree clean except the untracked
`RUN-task-1-step9.md` / `RUN-task-1-final.md` prompts (commit them alongside your first
commit). Gate GREEN right now: mobile 176/176 tests, typecheck 0, lint clean; web
typecheck 0.

You are the ONLY agent on this branch. No contention. Do not raise worktree protocol —
`~/Percho` is your designated write target.

One commit per logical unit, `phase-ios1.1:` prefix, DEVLOG entry at the TOP each time.
Each commit ends green on `pnpm test` / `pnpm typecheck` / `pnpm lint` in `apps/mobile`.

**Do not push. Do not merge to main.**

Final report: real branch tip SHA from `git log`, the numbers you actually observed, the
`expo export` result, what you ran against the remote for the migration and what came
back, and an honest list of anything still incomplete or shaky.

## Standing constraints

- Bedrock / opus-5 only. No mock/test data in commits; dev fixtures on gitignored paths.
- No fabricated stat anywhere, not even a placeholder. Missing renders as absent.
- Tokens only; zero hex literals outside `theme/tokens.ts`.
- Zip reverse-geocode backfill still NOT approved. Do not write it, do not spend.
- Step 9 is compile/export-verifiable only on this Linux box — never claim visual
  verification.
