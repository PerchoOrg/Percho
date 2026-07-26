I've read the spec, all 21 files, and verified the expo-video/zustand APIs against `node_modules`. Findings below.

---

## Verdict

**Not safe to build task-1 on as-is.** Four things need fixing first, and one of them is a scope gap rather than a bug: the §0.5 **tap-to-flip contract is entirely missing** from the foundation, so task-1 will have to invent it — which is precisely what task-0 existed to prevent ("后续 5 个任务全部只引用这一层,不允许各自重新实现"). Second, the Pan gesture has no `activeOffsetX`/`failOffsetY`, so it claims vertical touches and drags the card vertically; task-1's data-face scroll and tap gesture will fight it. Third, both Zustand stores are AsyncStorage-persisted with no hydration gate, so `funnelStage` reads 0 on cold start and then jumps — task-1's rhythm engine will build a Stage-0 deck and may fire a spurious milestone. Fourth, `SwipeStack`'s keying remounts all three cards on every swipe, which means a fresh `useVideoPlayer` + network fetch per swipe and a one-frame off-screen flash of the incoming top card.

Separately, on process: DEVLOG's own entry says **"Next steps: PENDING-SIM visual checks"** — none of the 7 acceptance criteria in `task-0-foundation.md` were verified on a simulator, yet this was merged to `main`. That violates `_MASTER.md` 交付协议 #2 ("不接受纯文字'已实现'") and CLAUDE.md §2.2 #4. The tokens/typography transcription is genuinely clean and the pure gesture core is well-factored; the problems are all in the RN integration layer, which is exactly the part that was never run.

---

## Blockers

**1. `hooks/use-swipe-card.ts:79-81` — Pan gesture has no directional activation gate.**
```ts
const gesture = Gesture.Pan()
    .enabled(enabled)
    .minDistance(6)
```
Spec §0.5: *"pan 手势限 ±30° 扇区起判横滑,余下交给 ScrollView"*. `minDistance(6)` activates on **any** direction. The sector gate exists only inside `decideSwipe`, which runs in `onEnd` — i.e. after the gesture has already won the touch and dragged the card for the whole pan. A vertical drag visibly drags the card (line 86: `ty.value = e.translationY`) then springs back, and a parent ScrollView never receives the gesture. Task-1's data face and Search sheet both scroll vertically.
**Fix:** `.activeOffsetX([-10, 10]).failOffsetY([-20, 20])` so the pan only claims horizontally-dominant touches, and delete the `ty` follow entirely (§0.5: vertical carries no semantics on the card face, so the card should not translate vertically at all).

**2. Tap-to-flip is missing from the foundation.** `_MASTER.md` hard rule #2 names it explicitly: *"flip = 350ms opacity crossfade,**禁 3D rotateY**"*, and §0.5 row 2 makes tap-to-data-face the second gesture in the contract. `grep -rn "Gesture.Tap" apps/mobile` hits only the pre-v3 `app/feed.tsx:509` — nothing in the new layer. There is also no `Gesture.Simultaneous`/`Exclusive` composition, so task-1 cannot add a Tap alongside the Pan without editing the hook anyway.
**Fix:** add the tap + 350ms opacity crossfade to `useSwipeCard` (or a sibling `use-card-flip.ts`) and return a composed gesture, before task-1 starts.

**3. `state/funnel.ts:36-52` and `state/sound.ts:16-27` — persisted stores with no hydration gate.** `persist` + AsyncStorage rehydrates **asynchronously**. First render returns `stage: 0` regardless of what's on disk. Task-1's promotion engine reads `stage` to build the deck and to decide whether to insert a milestone card — a returning Stage-3 user gets a Stage-0 deck on launch, then the stage snaps to 3. The pre-v3 `app/feed.tsx` explicitly solved this (DEVLOG 2026-07-21: *"Feed renders a 'Loading…' placeholder until hydrated"*); the new stores dropped it.
**Fix:** expose hydration — `useFunnelStore.persist.hasHydrated()` / `onFinishHydration`, or add a `hydrated: boolean` to the state and gate the feed on it.

**4. `components/TabBar.tsx:31` + `:64` — safe-area inset eats the bar instead of extending it.**
```ts
<View style={[styles.bar, { paddingBottom: insets.bottom }]}>
...
bar: { flexDirection: "row", height: BAR_HEIGHT, ... }   // BAR_HEIGHT = 62
```
`paddingBottom` inside a fixed `height: 62` does not grow the bar — it shrinks the content box. On a notched iPhone (`insets.bottom` = 34) the tab items get 28pt, so icon + label are crammed and clipped. Spec §0.6 #6 is *"62pt + home indicator"* — 62 **plus** the indicator, not 62 including it.
**Fix:** `height: BAR_HEIGHT + insets.bottom` on the container (keep `paddingBottom` so children lay out above the indicator).

**5. `components/SwipeStack.tsx:71-96` — all three cards remount on every swipe.** The three slots are keyed per-item (`keyExtractor(after, activeIndex+2)`, `(next, +1)`, `(top, activeIndex)`). When `activeIndex` advances, each slot's key changes (slot 2 goes `b`→`c`, slot 3 goes `a`→`b`), so React unmounts and remounts every slot rather than promoting item `b`'s existing subtree. Consequences: `CardVideo`'s `useVideoPlayer` is destroyed and re-created per swipe → fresh network fetch for a video that was already buffered, defeating §0.7's *"preload metadata-only"* intent; and `GestureDetector` re-attaches to a brand-new native view every swipe.
**Fix:** render a stable, item-keyed window (map over `items.slice(activeIndex, activeIndex+3)` with the key on the outermost element and role derived from position) so the incoming card's subtree is preserved.

**6. `components/SwipeStack.tsx:55-57` + `hooks/use-swipe-card.ts:109-111` — one-frame off-screen flash per swipe.** `reset()` runs in a `useEffect` on `[activeIndex]`, i.e. after React commits the render in which the new top card appeared. On that commit `tx.value` is still `±cardWidth * 1.6`, so the new top card is drawn off-screen and rotated for at least one frame, then snaps in. The next-card `nextStyle` (line 59-65) simultaneously snaps from scale 1.0 back to 0.94 with no animation.
**Fix:** zero the shared values inside `settle` **before** `onDecision` fires (`use-swipe-card.ts:64-71`) so it lands in the same JS tick as the index advance, and delete the `useEffect` + `reset` from `SwipeStack`.

---

## Warnings

**7. `components/CardVideo.tsx:48-54` — the mute-and-retry block is unreachable.**
```ts
try { player.play(); } catch { player.muted = true; player.play(); }
```
`expo-video`'s `play(): void` (verified in `node_modules/expo-video/build/VideoPlayer.types.d.ts:216`) — it returns nothing and does not throw on playback failure; errors arrive via the `statusChange` event with a `PlayerError` payload. §0.7's *"play() reject → mute-and-retry"* is a web `HTMLMediaElement` concept and is **not implemented**. Either wire `player.addListener('statusChange', ...)` or tell the owner the rule is vacuous on native and delete the try/catch — don't leave code that pretends to satisfy a hard rule.

**8. `components/CardVideo.tsx:70-82` — the 82% poll is rebuilt on every render and crosses the bridge 4×/s per card.** The effect depends on `onNearEnd`; if task-1 passes an inline arrow (the natural call site), `clearInterval`/`setInterval` re-run on every render, so under frequent renders the 250ms tick may never fire. Also `player.currentTime` / `player.duration` are native property reads. `expo-video` has a native `timeUpdate` event with a settable `timeUpdateEventInterval` — use it, or stash `onNearEnd` in a ref and drop it from the deps.

**9. `hooks/use-swipe-card.ts:79-112` — the `Gesture.Pan()` object is rebuilt on every render, unmemoized.** Combined with blocker 5 (view remount per swipe), this is the standard recipe for a dropped touch when a re-render lands mid-drag. Task-1's feed re-renders on every swipe. Wrap in `useMemo` keyed on `[cardWidth, enabled, settle]`.

**10. `hooks/use-swipe-card.ts:88-94` — a fast right-flick gets no threshold haptic.** The latch only tracks `translationX >= cardWidth * 0.35`. `decideSwipe` commits on `|velocityX| > 800` at any distance, so a quick flick commits with **no** `selectionAsync` — spec §0.5 says the tick fires at *"swipe 过阈值瞬间(方向判定)"*, and a velocity commit is a direction decision. Fire it from `onEnd` when the decision came from the velocity path and the latch never tripped.

**11. `hooks/use-swipe-card.ts:119-124` — ±8° follow-rotation is unreachable in practice.**
```ts
interpolate(tx.value, [-cardWidth, 0, cardWidth], [-8, 0, 8], "clamp")
```
The card commits at 35% of `cardWidth`, so the user never sees more than ~2.8° before it flies out. Spec §0.5 / task-0 acceptance line 28 (*"top 卡跟手 ±8° 旋转"*) means ±8° across the usable drag range. Map the input range to `±cardWidth * SWIPE_THRESHOLD_RATIO`.

**12. `hooks/use-swipe-card.ts:91` — `haptics` object captured into a worklet closure.** `runOnJS(haptics.swipeThreshold)()` inside the workletized `onUpdate` forces Reanimated to serialize the whole `haptics` object (four non-worklet functions) into the UI-thread closure. This generally works in Reanimated 3/4 but is fragile; hoist `const fireThreshold = haptics.swipeThreshold` to module scope and reference that. Everything else in the worklet layer is clean — `tx` is a shared value and `nextStyle`/`topStyle` are `useAnimatedStyle`, so **there are no JS re-renders during a drag**. That part is right.

**13. `theme/typography.ts:13` — the export is named `type`.** Call sites read `import { priceStyle, type } from "../theme/typography"` (`CardFoot.tsx:12`), which collides visually with TypeScript's type-only import syntax (`import { type Foo }`). It parses today but it will confuse every reader and breaks the moment someone writes a re-export. Rename to `textStyles` or `typeScale` before five more tasks import it.

**14. `components/BottomSheet.tsx:49-55` — entry haptic can re-fire.** Deps are `[visible, sheetH, translateY]`; any change to `sheetH` (window dimension change) re-runs the entry animation *and* `haptics.cardSettle()`. Portrait-locked (`app.json:7`) so low risk today. Also the `Modal animationType="fade"` runs concurrently with the custom `translateY` — two animations for one present.

**15. `components/CardFoot.tsx:43` — `key={p}` on pill strings.** Duplicate pill labels produce a duplicate-key warning. Use the index.

**16. `components/MatchBadge.tsx:18` — `stage: number` instead of `FunnelStage`, and it duplicates global state.** The funnel store exists; every card call site now has to thread `stage` through. Either type it `FunnelStage` or read `useFunnelStore` directly.

**17. Root `package.json` has no `mobile:test`.** DEVLOG claims *"pnpm test 10/10 green"*, which is only true from inside `apps/mobile`. Add `"mobile:test": "pnpm --filter @percho/mobile test"` alongside the existing `web:test`.

**18. `apps/mobile/tsconfig.json` sets `strict` but not `noUncheckedIndexedAccess`**, unlike `apps/web/tsconfig.json:8` and `packages/shared/tsconfig.json:8`. CLAUDE.md §4 mandates it. `SwipeStack.tsx:41-43` (`items[activeIndex]`) reads as non-optional today and only works because the `top &&` guards happen to be there.

**19. Scope creep in the same commit: `scripts/claude-env.sh`.** `git show 304464e:scripts/claude-env.sh` — the task-0 commit also added a shell script that greps `ANTHROPIC_API_KEY` out of `.env.local` and execs with it. Nothing to do with `apps/mobile`; CLAUDE.md §0.3 says surgical. It's already `git rm`'d, so no action needed, but the pattern is worth naming.

---

## Delete list

Default is deletion. I've split spec-table transcriptions (keep — `_MASTER.md` #1 requires the full table) from invented extras.

| Symbol | File:line | What breaks |
|---|---|---|
| `tokens` aggregate export | `theme/tokens.ts:68` | Nothing. Zero importers; `colors`/`radii`/`fonts` are imported individually everywhere. |
| `fonts.displayTarget` | `theme/tokens.ts:61` | Nothing. Its own doc comment says *"Do not reference directly."* A token that must not be referenced is a comment. |
| `ColorToken` | `theme/tokens.ts:41` | Nothing. Zero consumers. |
| `RadiusToken` | `theme/tokens.ts:52` | Nothing. Zero consumers. |
| `FontToken` | `theme/tokens.ts:66` | Nothing. Zero consumers. |
| `TypeToken` | `theme/typography.ts:61` | Nothing. Zero consumers. |
| `colors.surface2` | `theme/tokens.ts:15` | Nothing today — but it is a §0.3 table row. **Keep** per `_MASTER.md` #1. Same for `pos`/`neg`/`cta`/`radii.tile`/`radii.btn`. |
| `ty` in the hook's return | `hooks/use-swipe-card.ts:50, 129` | Nothing. `SwipeStack:45` destructures only `{gesture, topStyle, tx, reset}`. Goes away entirely with blocker 1's fix. |
| `reset` in the hook's return | `hooks/use-swipe-card.ts:52, 129` | Only `SwipeStack:55-57`, which blocker 6 removes. |
| `SWIPE_VELOCITY_PTS`, `SWIPE_SECTOR_DEG` exports | `lib/gesture/decide-swipe.ts:27-28` | Nothing outside the module — the tests hard-code `799`/`801`/`29`/`31` instead. Either un-export or use them in the tests (prefer the latter; see gaps). |
| `setSoundOn` | `state/sound.ts:13, 20` | Nothing. Only `toggle` is consumed (`SoundToggle.tsx:12`). |
| `ExploreButton`'s `label?` prop + default | `components/ExploreButton.tsx:11, 16` | Nothing. Spec §0.6 #5 names one button, "Explore". No caller overrides it. |
| `TabItem.icon?` + the icon render branch | `components/TabBar.tsx:17, 42-48` | Nothing in-repo (only the gitignored demo screen). Spec never specifies emoji tab icons — this is invented. |
| `cardWidth`/`cardHeight`/`enabled` defaults | `components/SwipeStack.tsx:18, 37-39` | Nothing. Module-scope `Dimensions.get("window")` is a stale-value footgun; task-1 will pass measured sizes. Make them required. |
| `resetTo` | `state/funnel.ts:33, 45` | Nothing today, but §0.2 (*"回退只由用户显式操作触发"*) mandates the interface and task-0 was asked to define it. **Keep** — one line, spec-required. |
| `haptics.pass()` | `lib/haptics.ts:37-39` | **Keep.** Task-0 scope item 4 explicitly demands *"以及显式的 'pass = 无'"*. The empty body is the point. |

---

## Spec divergences

| Spec requirement | What the code does | Severity |
|---|---|---|
| §0.5 *"Tap 卡身 … flip = 350ms opacity crossfade(禁 3D rotateY)"*; `_MASTER` hard rule #2 | Not implemented anywhere in the layer. No `Gesture.Tap`, no crossfade. | **Blocker** |
| §0.5 *"pan 手势限 ±30° 扇区起判横滑,余下交给 ScrollView"* | Sector checked only at `onEnd` (`decide-swipe.ts:38`); the pan activates on any direction and drags the card vertically. | **Blocker** |
| §0.6 #6 *"Tab bar(4 tab)— 62pt + home indicator"* | `height: 62` with `paddingBottom: insets.bottom` inside it → 28pt of content on a notched device. Also accepts any number of tabs, not 4. | **Blocker** |
| §0.7 *"play() reject → mute-and-retry"* | `try/catch` around `player.play()`, which returns `void` and never throws. Unreachable. | High |
| §0.7 *"preload metadata-only"* | No `bufferOptions` / preload control at all. Every mounted `CardVideo` buffers with library defaults. | High |
| §0.5 *"跟手旋转 ±8°"* | Interpolated over `±cardWidth`, so ~2.8° max before commit at 35%. | Medium |
| §0.5 `selectionAsync` at *"swipe 过阈值瞬间(方向判定)"* | Fires only on a distance-threshold crossing to the right; a >800pt/s flick commits silently. | Medium |
| §0.5 `impactAsync(light)` = *"卡片飞出落定"* | Suppressed for left swipes (`use-swipe-card.ts:66-67`) — the left card flies out with no settle impact. Defensible under *"pass 不震"* but it's an unflagged reading of two conflicting rows; `_MASTER` #8 required an ambiguity entry. | Low |
| §0.3 *"`--font-display` New York(serif), fallback Georgia"* | `display: "Georgia"` with New York recorded in an unused, do-not-use token. Owner-approved per DEVLOG. | Low (accepted) |
| §0.6 #8 *"detents: medium(50%)/large(90%)"*; acceptance line 32 *"两档 detent + grabber"* | Detent is a prop, not user-switchable; grabber is a decorative `View` with no gesture. Self-documented as deferred (`BottomSheet.tsx:8`). | Low |
| §0.3/§0.4 token + typography tables | **Fully and correctly transcribed** — all 15 color rows, all 5 radii, all 7 text styles with correct sizes/weights/tracking, and `priceStyle` 25 bold per §0.6 #4. Zero hex outside `tokens.ts`. No findings. | — |
| CLAUDE.md §1 (no Chinese in code) | One Chinese fragment in a comment: `BottomSheet.tsx:5` — `§0.5 "sheet 弹出"`. No `_zh` fields, no Chinese identifiers. Nit. | Nit |
| CLAUDE.md §2.1 rule 2 (DEVLOG reverse-chron) | **Correct** — inserted directly after the header block, above the 2026-07-21 entry. | — |
| CLAUDE.md §6 (RELEASE.md on user-visible change) | Not updated. Arguably correct: no user-visible surface shipped (no pages, no routes). | — |

---

## Test gaps

`decide-swipe.test.ts` is 129 lines for 10 assertions and it never hits a single actual boundary. The three specific weak tests:

- **`"34% … does not commit"` / `"36% … commits"` (lines 8-28)** — 136pt and 144pt against a 140pt threshold. That's ±4pt away from the boundary, not a boundary test. Task-0 acceptance line 27 says *"35% 阈值边界"*. The contract is `absX >= cardWidth * 0.35`; the assertion that matters is `139.999 → "none"` and `140 → "right"`. Untested.
- **`"799 pt/s does not commit"` / `"801 pt/s commits"` (lines 46-66)** — same shape. The contract is strict `>`, so **exactly 800 must be `"none"`** — the classic off-by-one, and it's the one value not asserted.
- **`"no movement is none"` (lines 119-127)** — `translationX: 0, translationY: 0, velocityX: 0`. Asserts nothing a reader would doubt.
- **`"29°" / "31°"` (lines 84-104)** — brackets but skips exactly 30°. Contract is `angleDeg > 30`, so 30.0° must commit. Untested.

The one genuinely good test is `"a near-vertical drag never commits even with high velocity"` (line 106) — it asserts that the sector gate wins over the velocity path, which is a real cross-rule interaction.

Not covered at all:

- **Threshold met, velocity opposes.** `translationX: +150, velocityX: -1500` (user drags past threshold then yanks back). `decide-swipe.ts:47` picks `translationX`'s sign → `"right"`. That is an unspecified product decision and the single behavior most likely to feel wrong in the hand.
- **Velocity commit whose sign disagrees with translation.** `translationX: -10, velocityX: +900` → returns `"right"`, so a card visually dragged left flies out right.
- **`cardWidth: 0`** (a caller using `onLayout` before measurement): threshold becomes 0, so a 1pt jitter commits. Needs a test and a guard.
- **The constants themselves.** No test asserts `SWIPE_THRESHOLD_RATIO === 0.35` / `SWIPE_VELOCITY_PTS === 800` / `SWIPE_SECTOR_DEG === 30`. A silent retune of any of them keeps all 10 tests green because the tests hard-code `400`/`799`/`801`/`29`/`31` independently.
- **`funnel.promoteTo` monotonicity — the biggest gap.** §0.2 calls *"stage 永不自动回退"* an invariant, task-0 scope item 7 calls it out by name, and `_MASTER` 交付协议 #3 requires pure logic to be unit-tested. It's a 3-line pure reducer and it has zero tests. `vitest.config.ts:8` scopes `include` to `lib/**/*.test.ts`, so `state/` can't be tested without a config change — extend the glob to `{lib,state}/**/*.test.ts` (Zustand needs no RN runtime; only the AsyncStorage import needs a stub).
- **The haptic latch in `use-swipe-card.ts`.** "left swipe fires nothing, right swipe fires exactly once even when the finger crosses the threshold back and forth" is the §0.5 rule most likely to regress and the hardest to catch on a simulator (acceptance line 29 even concedes *"真机或说明 simulator 限制"*). Extract the latch decision into a pure function next to `decideSwipe` and test it.