# task-0.1 — foundation layer fixes (post-review)

You are on branch `phase-ios0.1/foundation-fixes`. Working dir `apps/mobile`.

Task-0 (the spec-v3 foundation layer) was merged to main at `09ca5b7` WITHOUT
simulator verification. An opus-5 code review found 6 blockers. Your job is to
fix them, plus the high-severity warnings and test gaps listed below. Do NOT
start task-1. Do NOT touch `apps/web` or `scripts/render-worker`.

## Required reading (in this order)
1. `CLAUDE.md` — §0 behavioral guidelines, §2.1 four non-negotiable rules
2. `docs/design/spec-v3/_MASTER.md` — hard rules, 交付协议
3. `docs/design/spec-v3/task-0-foundation.md` — original scope + 7 acceptance criteria
4. `docs/design/review-task0-opus5.md` — the full review. THIS IS YOUR WORK ORDER.

## Scope: fix all 6 blockers

1. **Pan directional gate** (`hooks/use-swipe-card.ts:79-81`). Add
   `.activeOffsetX([-10, 10]).failOffsetY([-20, 20])`. Delete the `ty` shared
   value and its `translateY` in `topStyle` entirely — vertical carries no
   semantics on the card face (§0.5), the card must not translate vertically.
   Remove `ty` from the hook's return type.

2. **Tap-to-flip is missing.** `_MASTER` hard rule #2: flip = 350ms opacity
   crossfade, **禁 3D rotateY**. §0.5 row 2 makes tap-to-data-face the second
   gesture in the contract. Implement it in the foundation so task-1 only
   consumes it: add a `Gesture.Tap` composed with the pan via
   `Gesture.Exclusive` (pan wins; tap only fires when the pan never activates),
   and expose a `flipProgress` shared value (0 = video face, 1 = data face)
   driven by `withTiming(..., { duration: 350 })`, plus `frontStyle`/`backStyle`
   animated styles doing an opacity crossfade. No rotateY anywhere.
   `SwipeStack` must accept a `renderBack` prop and render both faces stacked.

3. **Hydration gate** (`state/funnel.ts`, `state/sound.ts`). Both stores are
   `persist`ed to AsyncStorage and rehydrate async, so first render reads
   `stage: 0`. Add a `hydrated: boolean` to each store, set via
   `onRehydrateStorage`, and export it so the feed can gate on it.

4. **TabBar safe area** (`components/TabBar.tsx:31,64`). `height: BAR_HEIGHT +
   insets.bottom` on the container, keep `paddingBottom: insets.bottom` so
   children lay out above the home indicator. Spec §0.6 #6 is 62pt **plus**
   the indicator.

5. **SwipeStack remounts all 3 cards per swipe** (`components/SwipeStack.tsx:71-96`).
   Keys are `keyExtractor(item, activeIndex+N)`, so every slot's key changes when
   activeIndex advances → full unmount/remount → `useVideoPlayer` destroyed and
   re-created, fresh network fetch per swipe. Render a stable item-keyed window:
   map over `items.slice(activeIndex, activeIndex + 3)`, key on the outermost
   element by item identity only (`keyExtractor(item, activeIndex + i)` is fine
   as long as the key does not change when the item is promoted — derive the key
   from the item, not the slot), and derive `role` from position.

6. **One-frame off-screen flash** (`SwipeStack.tsx:55-57` + `use-swipe-card.ts:109-111`).
   `reset()` runs in a `useEffect` on `[activeIndex]`, i.e. after the commit in
   which the new top card appears — so it draws off-screen for a frame. Zero the
   shared values inside `settle` BEFORE `onDecision` fires, and delete the
   `useEffect` + `reset` from SwipeStack and from the hook's return.

## Also fix (high severity)

7. **`CardVideo.tsx:48-54` mute-and-retry is unreachable.** `expo-video`'s
   `play()` returns `void` and never throws; errors arrive via `statusChange`
   with a `PlayerError`. Implement it properly: `player.addListener('statusChange',
   ...)` and on error set `player.muted = true` and retry once. Do not leave a
   try/catch that pretends to satisfy a hard rule.

8. **`CardVideo.tsx:70-82` 82% poll.** Rebuilt every render (dep on `onNearEnd`)
   and reads native props 4×/s. Stash `onNearEnd` in a ref and drop it from deps,
   or use expo-video's native `timeUpdate` event with `timeUpdateEventInterval`.
   Prefer the native event.

9. **Memoize the gesture** (`use-swipe-card.ts:79`). `Gesture.Pan()` is rebuilt
   every render. Wrap the composed gesture in `useMemo`.

10. **Velocity-commit haptic** (`use-swipe-card.ts:88-94`). A >800pt/s right flick
    commits with no `selectionAsync`. §0.5 fires the tick at 方向判定. Fire it
    from `onEnd` when the decision is `right`, came from the velocity path, and
    the distance latch never tripped.

11. **±8° rotation range** (`use-swipe-card.ts:119-124`). Interpolated over
    `±cardWidth` but commits at 35%, so max ~2.8° is ever visible. Map the input
    range to `±cardWidth * SWIPE_THRESHOLD_RATIO`.

12. **`theme/typography.ts:13` export named `type`.** Rename to `textStyles` and
    update all call sites. It visually collides with `import { type Foo }`.

13. **`noUncheckedIndexedAccess`** missing from `apps/mobile/tsconfig.json`.
    CLAUDE.md §4 mandates it; `apps/web` and `packages/shared` both set it. Add
    it and fix the resulting errors.

14. **Root `package.json` has no `mobile:test`.** Add
    `"mobile:test": "pnpm --filter @percho/mobile test"` next to `web:test`.

## Delete list (default is deletion — all confirmed zero-importer)

`tokens` aggregate export, `fonts.displayTarget`, `ColorToken`, `RadiusToken`,
`FontToken`, `TypeToken` (`theme/tokens.ts`, `theme/typography.ts`); `ty` and
`reset` from the hook's return; `setSoundOn` (`state/sound.ts`);
`ExploreButton`'s `label?` prop + default; `TabItem.icon?` + its render branch
(`components/TabBar.tsx` — spec never specifies emoji tab icons, this is
invented); `cardWidth`/`cardHeight`/`enabled` defaults in `SwipeStack` (make
them required props — module-scope `Dimensions.get("window")` is a stale-value
footgun).

**KEEP** (spec-mandated even though unused): `colors.surface2`, `pos`, `neg`,
`cta`, `radii.tile`, `radii.btn` (§0.3 table rows, `_MASTER` #1 requires the
full table); `resetTo` in `state/funnel.ts` (§0.2 requires the interface);
`haptics.pass()` with its empty body (task-0 scope item 4 demands an explicit
"pass = 无").

Also constrain `TabBar` to exactly 4 tabs per §0.6 #6.

## Test work (this is not optional — `_MASTER` 交付协议 #3)

Rewrite `lib/gesture/decide-swipe.test.ts` to hit ACTUAL boundaries. The current
10 assertions never touch one (they test 34%/36% against a 140pt threshold,
799/801 against a strict `> 800`, 29°/31° against `> 30`). Required:

- `139.999 → "none"` and exactly `140 → "right"` (contract is `absX >= w*0.35`)
- exactly `800 → "none"` (contract is strict `>`), `800.001 → commits`
- exactly `30.0° → "right"` (contract is `angleDeg > 30`), `30.001° → "none"`
- assert the constants themselves: `SWIPE_THRESHOLD_RATIO === 0.35`,
  `SWIPE_VELOCITY_PTS === 800`, `SWIPE_SECTOR_DEG === 30`, and USE those
  exported constants in the tests instead of hard-coding 400/799/801/29/31 —
  a silent retune must fail the suite.
- **threshold met but velocity opposes**: `translationX: +150, velocityX: -1500`.
  Current code picks translationX's sign → `"right"`. This is an unspecified
  product decision — implement "velocity wins when it opposes and exceeds the
  velocity threshold" (a yank-back should cancel), add a spec-ambiguity entry to
  the DEVLOG per `_MASTER` #8, and test it.
- **velocity commit whose sign disagrees with translation**: `translationX: -10,
  velocityX: +900` currently returns `"right"` → a card dragged left flies out
  right. Same fix covers it; test it.
- **`cardWidth: 0`** (caller using `onLayout` pre-measurement): threshold becomes
  0 so 1pt of jitter commits. Add a guard (`cardWidth <= 0 → "none"`) and a test.
- Delete the `"no movement is none"` test — it asserts nothing a reader doubts.

Add `state/funnel.test.ts` covering `promoteTo` **monotonicity** — §0.2 calls
"stage 永不自动回退" an invariant and it has zero tests. Extend
`vitest.config.ts` `include` to `{lib,state}/**/*.test.ts` (stub the
AsyncStorage import; Zustand needs no RN runtime).

Extract the haptic latch decision from `use-swipe-card.ts` into a pure function
next to `decideSwipe` and test it: a left swipe fires nothing; a right swipe
fires exactly once even when the finger crosses the threshold back and forth.

## Definition of done

- `pnpm --filter @percho/mobile test` green, and every new boundary test
  demonstrably fails if the corresponding constant is retuned.
- `pnpm --filter @percho/mobile exec tsc --noEmit` clean with
  `noUncheckedIndexedAccess` on.
- `pnpm biome check apps/mobile` clean.
- `grep -rn "rotateY" apps/mobile` → no hits (hard rule #2).
- `grep -rn "Gesture.Tap" apps/mobile/components apps/mobile/hooks` → hits the
  new flip gesture.
- DEVLOG.md updated with a new entry AT THE TOP (reverse chronological,
  CLAUDE.md §2.1 rule 2) covering: what the review found, what you fixed, the
  velocity-opposes-translation ambiguity decision, and what remains
  PENDING-SIM (you cannot run a simulator on this Linux host — say so
  explicitly rather than claiming visual verification).
- Commit with prefix `phase-ios0.1:`. Do NOT merge to main. Do NOT push.

Report at the end: files changed, test count before/after, and anything in the
review you deliberately did not do with a one-line reason.
