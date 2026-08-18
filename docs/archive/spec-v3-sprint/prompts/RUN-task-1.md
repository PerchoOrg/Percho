# RUN Task 1 — kickoff prompt (paste into a fresh Claude Code session)

> Copy everything below the line into a new session at the Percho repo root.

---

You are working in the Percho repo. Read these files in full, in order, before doing anything:

1. `CLAUDE.md` — all rules. Pay attention to: no false completion claims (quote real SHAs), DEVLOG.md is reverse-chronological (newest at TOP), one branch per phase.
2. `DEVLOG.md` — the top 3 entries (most recent state).
3. `docs/design/spec-v3/prompts/_MASTER.md` — the 8 non-negotiable hard rules + delivery protocol for this spec-v3 implementation program.
4. `docs/design/spec-v3/prompts/task-1-feed.md` — your task.
5. `docs/design/spec-v3/00-overview.md` — full text (global contracts).
6. `docs/design/spec-v3/01-feed.md` — full text (this screen's spec).

## Starting state

Task 0 (foundation layer) is **merged into main** — `origin/main` = `09ca5b7`. Branch from current `main`, name it `phase-ios1/discovery-feed`.

Already delivered by Task 0 in `apps/mobile/` — **reuse all of it, do not build a second version of any of it**:

- `theme/tokens.ts` — the ONLY source of colors / radii / spacing. No hex literals anywhere else.
- `theme/typography.ts` — type scale.
- `lib/haptics.ts` — 4 semantic haptics (note: `pass` is intentionally silent).
- `lib/gesture/decide-swipe.ts` — pure swipe-decision function (+ `decide-swipe.test.ts`, 10 passing contract tests: 35% width threshold, 800pt/s velocity, ±30° sector).
- `hooks/use-swipe-card.ts` — pan handler with ±8° follow rotation and threshold haptic.
- `state/sound.ts`, `state/funnel.ts` — sound pref, funnel stage machine (monotonic advance guard, AsyncStorage-persisted).
- `components/` — 8 core components: `CardVideo` (top-card-only playback, 82% once-latch callback, mute-retry), `SwipeStack` (3-layer 0.94/0.88), `MatchBadge` (only stage 4 and score ≥60), `BottomSheet` (2 detents), `CardFoot`, `KindChip`, `ExploreButton`, `SoundToggle`, `TabBar`.

`apps/mobile/app/(tabs)/feed.tsx` is the **pre-v3 legacy implementation** (25% threshold, hardcoded hex). Task 1 replaces it per spec.

## First deliverable: plan only

Per `_MASTER.md` delivery protocol step 1 — output ONLY an implementation plan first:

- component tree
- state + data flow (including where `state/funnel.ts` plugs in)
- ambiguity list: every place the spec is underspecified, each with the default you propose

**Do not touch any files until I approve the plan.**

## Verification (run in `apps/mobile`)

`pnpm test`, `pnpm typecheck`, `pnpm lint` — all three must be green. New files must contain zero hex color literals (`tokens.ts` is the only exception). Pure logic (feed composition, stage advance) must be extracted into testable functions with unit tests.

Commit to the phase branch. Do not push or merge unless I say so. Update `DEVLOG.md` incrementally (newest entry at TOP).

## Two known traps

1. **No iOS simulator on a Linux box.** If this session is running on Linux, mark every visual acceptance item `PENDING-SIM` and leave it for a manual Expo Go pass on the Mac. If you ARE on the Mac mini, actually run the simulator and produce screenshots per acceptance item.
2. **Atlanta geographic dataset is missing.** Stage 1–2 cards (area / city / zip) need the ~40-unit Atlanta metro editorial set, which is not in the repo. Per hard rule: stop and report the gap — do not invent placeholder data. Raise this in the plan phase so the owner can decide (stub schema first vs. build the data first).
