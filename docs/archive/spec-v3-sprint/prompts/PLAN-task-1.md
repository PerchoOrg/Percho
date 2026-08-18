# Task 1 — Discovery Feed (spec-v3 `01-feed.md`)

## Context

Task 0 merged the foundation layer (tokens, gesture core, haptics, funnel store, 9
components) at `origin/main` = `26d3f8b`. Task 1 builds the only main consumption
surface: 8 card types, the stage-based funnel rhythm engine, the swipe state
machine, system states, and telemetry.

The screen that exists today (`apps/mobile/app/feed.tsx`, 1515 lines) is the
pre-v3 implementation: 25% swipe threshold, 40+ hardcoded hex literals, 6 card
types, no funnel, a dead hardcoded Cloudflare tunnel as API base. It is replaced,
not migrated.

### Five corrections to the briefing (verified, they change the plan)

1. **`apps/mobile/app/(tabs)/feed.tsx` does not exist.** There is no `(tabs)`
   group. The legacy screen is `apps/mobile/app/feed.tsx`. `TabBar` has zero
   consumers today.
2. **`buyer_scope_events` does not exist.** Zero migrations reference it — only
   spec docs do (`01-feed.md`, `05-tabs.md`, `docs/design/discovery-feed.md`).
   §1.10 has no table to write to.
3. **Task 0's `SwipeStack` / `useSwipeCard` cannot express two required
   behaviors** (milestone rubber-band, challenge 900ms reveal-before-flyout).
   Task 1 must edit those two task-0 files. Details in §1.3.
4. **`apps/web/lib/supabase/database.types.ts` is a stub** (`Tables:
   Record<string, never>`). CLAUDE.md §5's "use `Database['public']['Tables']`"
   is not currently possible; web code hand-types with biome-ignores. Server work
   here hand-types its row shapes and says so.
5. **Only two files import `@percho/shared`**: `apps/web/app/api/mobile/feed/route.ts`
   and `apps/mobile/app/feed.tsx`. Both are rewritten/deleted by this task, so
   the v3 card types carry near-zero legacy blast radius.

---

## 1. Component tree

### 1.1 Pure logic — `apps/mobile/lib/feed/` (new, no React/RN/expo imports)

Located in mobile, not `packages/shared`: shared is an `export *` barrel consumed
by the web bundle and has no test runner at all, while `apps/mobile/vitest.config.ts`
already globs `{lib,state}/**/*.test.ts` — zero config change. The hard constraint
is that this directory imports nothing from react/react-native/expo/zustand, so it
lifts to shared verbatim when server-side `generateDiscoveryFeed` (05 §5.6 item 4)
lands.

| File | Responsibility |
|---|---|
| `card-types.ts` | The v3 discriminated union — 8 kinds (`ask`/`area`/`community`/`listing`/`tradeoff`/`challenge`/`insight`/`milestone`) + `FunnelLayer` (`purpose`/`life`/`area`/`city`/`zip`/`community`/`lifestyle`, §1.2 tag list). Parallel to `packages/shared/src/types.ts`, which stays for the legacy web route. |
| `geo-unit.ts` | `GeoUnit` / `GeoStats` contract (§3 below) + `finestAvailableLevel(pool)`. |
| `behavior.ts` | `cardBehavior(card): CardBehavior` — a **discriminated union**, not a flag bag (§1.4). |
| `ratios.ts` | The five stage mix tables from §1.7 verbatim, as data. |
| `generate-feed.ts` | `generateFeed(stage, state, n): FeedCardV3[]` — pure, deterministic. |
| `stage-advance.ts` | `evaluateStageAdvance(stage, signals): FunnelStage \| null` + `isLayerFatigued(signals, layer)`. |
| `signals.ts` | `applySwipe(signals, card, verdict): SignalState` — the pure reducer. Tease-listing 0.5× weighting lives here. |
| `events.ts` | The §1.10 event union + `buildSwipeEvent(...)` etc. Pure constructors only. |

### 1.2 State — `apps/mobile/state/`

| File | Responsibility |
|---|---|
| `feed-session.ts` (new) | Zustand + AsyncStorage. Holds `signals`, `seenIds`, `answeredAskIds`, `skippedLayers`, `sessionN`, `lastSwipeAt`. `hydrated` gate, same shape as `funnel.ts`. |
| `event-queue.ts` (new) | AsyncStorage-persisted FIFO, hard cap 500 (drop-oldest), injected `transport`. Task-1 sink is a no-op. |
| `funnel.ts` (reuse) | Unchanged. `promoteTo()`'s boolean return is exactly the milestone trigger. Feed gates deck construction on `hydrated`. |
| `sound.ts` (reuse) | Unchanged; read by `CardVideo`. |

### 1.3 Task-0 edits (the only two files touched)

`hooks/use-swipe-card.ts`:
- Replace the single `enabled: boolean` with a per-top-card capability object
  `{ pannable, commits, maxDisplacementRatio, flippable, revealMs? }`. Milestone
  needs pan **enabled** but non-committing — `enabled:false` gives no drag at
  all, which is wrong per §1.5 ("follows the finger, capped at 30%, springs back").
- Clamp `translateX` in the `topStyle` worklet (currently unclamped at
  `use-swipe-card.ts:154-170`); the 30% cap must live there.
- §1.8 flyout is **260ms spring damping 26**; today it is `withTiming` 220ms
  (`:42`, `:131`). Use Reanimated's physics config (`damping: 26` + mass/stiffness)
  — mixing it with `duration` silently drops one family.
- Add an `onCommit` JS callback fired at commit, separate from `onDecision` at
  settle, plus a `revealMs` hold before flyout. §1.6's Challenge reveal cannot be
  layered on: the flyout currently starts inside `onEnd` on the UI thread.
- `settle` resets `flipProgress` synchronously (`:88`) so a flipped card flies out
  data-side-up. Reset after flyout completes.

`components/SwipeStack.tsx`:
- The back layer is gated on `!!renderBack` (the *function*, `:98`) rather than its
  result, so tapping an ask card today crossfades to a blank face — this is the
  §1.1 red-line bug already latent in task-0. Gate on the returned node.
- Accept `capability: (item: T) => CardCapability` (generic; SwipeStack stays
  ignorant of feed semantics per its own header contract).
- Block swipe while a card is flipped (§ acceptance: "翻面态禁 swipe").
- `GestureDetector` wraps the frame, not the card. Milestone's CTA and Ask's
  "Skip this topic" (44pt) are children inside it and will contest the frame tap
  — wire `blocksExternalGesture` / per-kind tap disable.

### 1.4 Card faces — `apps/mobile/components/cards/` (new)

Each face is a component over a **narrowed** card type, so a faceless kind has no
back-face component to write — structurally impossible to null-deref rather than
defensively checked. Zero kind-conditional branches inside any gesture handler;
capability is data resolved before the gesture is constructed.

| File | Composes from task-0 | Notes |
|---|---|---|
| `AskFace.tsx` | `KindChip` | Layer tag, Display-style question, sub, 58×58 map thumb (geo layers only), "Skip this topic" link. No back face. |
| `AreaFace.tsx` | `KindChip`, `CardVideo`, `CardFoot` | Three granularities, one card; chip marks the level. `CardFoot` renders only populated `GeoStats` (§3). |
| `AreaDataFace.tsx` | — | Dark data face; renders only real datapoints; `Flip back` / `See on map →` (the latter a disabled stub until task 4). |
| `ListingFace.tsx` | `KindChip`, `CardVideo`, `CardFoot`, `MatchBadge`, `ExploreButton` | `MatchBadge` already self-gates to stage 4 + score ≥60 — pass `stage` through, add nothing. |
| `CommunityFace.tsx` | same | |
| `DataFaceStub.tsx` | — | listing/community data faces are fully specced in 02/03 (tasks 2–3). Task 1 ships the flip mechanics with a minimal real-fields-only face and no invented content. |
| `MilestoneFace.tsx` | — | Ceremony card: scope chip recap from real confirmed signals, next-stage copy, `Keep going →` CTA, map sub-link. `haptics.milestone()`. |
| `TradeoffFace.tsx` | `KindChip` | 1.5px dashed split; chosen half opacity 1 / discarded 0.4 tracking the drag. Never ✓/✗. |
| `ChallengeFace.tsx` | `KindChip` | 900ms reveal via `onCommit` + its own `revealProgress` (NOT `flipProgress` — conflating answer face with data face is how a card flies out showing the wrong face). |
| `InsightFace.tsx` | `KindChip` | Third "Not sure" outlined pill, ≥44pt. |
| `SwipeLabels.tsx` | — | Direction labels, opacity = displacement ratio, copy from `cardBehavior`. Reads the exported `tx`. |

### 1.5 Chrome + system states — `apps/mobile/components/feed/` (new)

`CardSkeleton.tsx` (breathing `surface2`, no spinner) · `OfflineBar.tsx` ·
`UndoToast.tsx` (3s, listing/community/area only) · `ExhaustedCard.tsx` ·
`SeenBadge.tsx`.

### 1.6 Routing — `apps/mobile/app/`

Create the minimal `(tabs)` group so the spec route and `TabBar` both become
real: `(tabs)/_layout.tsx` + `(tabs)/feed.tsx` (implemented) + `saved.tsx` /
`search.tsx` / `you.tsx` as one-line stubs (satisfying `TabBar`'s exactly-4 tuple
type). Delete `app/feed.tsx` and `app/place/[slug].tsx`; repoint `app/index.tsx`.
Task 5 fills the stubs rather than restructuring.

`(tabs)/feed.tsx` is thin: hydration gate → pool fetch → `generateFeed` →
`SwipeStack` → dispatch swipe into `applySwipe` + `evaluateStageAdvance` +
`event-queue`. All decisions live in the pure modules.

---

## 2. State + data flow

```
API pool ─┐
          ├→ generateFeed(stage, state, N) → FeedCardV3[] → SwipeStack
signals ──┘                                                     │
                                                    onDecision(dir, card)
                                                                │
     ┌──────────────────┬───────────────────┬───────────────────┘
applySwipe          buildSwipeEvent      seenIds.add
     │                   │
evaluateStageAdvance   event-queue (FIFO, drain on reconnect)
     │
promoteTo(next) → true → insert milestone card + haptics.milestone()
```

**Purity.** `generateFeed` and `evaluateStageAdvance` receive everything as
arguments — no fetch, no store reads, no `Date.now()`, no `Math.random()`.
Ordering is deterministic: rank by signal score, tie-break by card id. That is
what makes the ratio and boundary tests meaningful.

**Why client-side.** §1.7 re-evaluates advance after *every* swipe and §1.9
requires the feed to work offline. A round trip per swipe would break the §1.8
flyout→settle window and could not insert a milestone card offline.

**Pagination** (§1.7): first page 12; prefetch when `activeIndex` is 5 from the
end; `seenIds` dedupe across pages; two silent retries then treat as exhausted;
only then allow looping old cards with a `seen` micro-badge.

**Offline signals.** Signals are persisted locally regardless of network —
`evaluateStageAdvance` consumes per-geo-unit counts and layer fatigue, which must
survive a restart. Telemetry is a *derived sink* of the same swipe callback, not a
parallel mechanism. `event-queue` drains via `transport` on reconnect; task-1's
transport is a no-op sink (see §4).

**API base.** `API_BASE` is a hardcoded dead Cloudflare tunnel in the legacy file.
Move it to `app.json` `extra` read via `expo-constants`, defaulting to production
`percho.co`, overridable for LAN dev. This is a prerequisite (05 §5.6 item 3).

---

## 3. The geo-unit contract

```ts
export type GeoLevel = 'area' | 'city' | 'zip';

export interface GeoUnit {
  id: string;                    // "city:decatur-ga" — stable, level-prefixed
  level: GeoLevel;
  name: string;                  // "Decatur"        (communities.city, real)
  state: string;                 // "GA"             (communities.state, real)
  parentId?: string;             // zip → city → area; absent today
  centroid: { lat: number; lng: number };   // mean of member community lat/lng
  heroUrl?: string;              // a member community's real hero_image_url
  videoUrl?: string;             // absent today (community_videos = 4 rows)
  communityCount: number;        // real COUNT
  sampleCommunityNames: string[];// ≤3 real communities.name
  stats: GeoStats;
}

export interface GeoStats {
  medianListPrice?: { value: number; sampleSize: number };
  activeListings?: number;
  // Deliberately ABSENT until a real source exists — not optional-and-faked:
  // schoolRating, commuteMinutes, priceTrend, inventoryTrend, hoaBand
}
```

**Populated today** (from the 8680 real communities + 265 real listings):
`id`, `level:'city'`, `name`, `state`, `centroid`, `heroUrl`, `communityCount`,
`sampleCommunityNames`. Plus `medianListPrice` and `activeListings` for the ~5
cities with ~50 active listings each, gated at `sampleSize >= 8`.

**Renders as absent** for the other ~83 cities and for every unit: median price,
school rating, commute minutes, price trend, inventory, HOA. The card omits the
row; there is no "—", no "N/A", no placeholder number. `AreaDataFace` renders only
the datapoints present, so a thin unit shows a short face.

**Zip.** `communities.zip` is 100% NULL — zip units are not derivable. `listings.zip`
covers 262 rows across ~6 cities only, which would make Stage 2 work for a buyer
focused on Alpharetta/Suwanee/Sandy Springs/Johns Creek/Duluth and be empty for
the other 83 cities. **Cheapest honest path, out of task-1 scope:** a one-off
reverse-geocode backfill of `communities.lat/lng` → `communities.zip` (8679 rows,
Google Geocoding with the existing `GOOGLE_PLACES_API_KEY`, ~$40 at list price,
one script under `scripts/admin/`, cached to disk, idempotent). That yields real
zip units for the whole metro. It needs owner sign-off on spend (CLAUDE.md §8).

**Stage-2 degradation until then** (explicit, and unit-tested):
`finestAvailableLevel(pool)` returns the deepest level with inventory. Stage 2's
`zip ×4` slots fall back to unseen sibling *city* units ×2 + `ask(geo)` ×1 +
`tradeoff` +1. `evaluateStageAdvance` for 2→3 counts units at the finest available
level, so "2–4 zips with ≥2 right-swipes each" becomes "2–4 city-level units with
≥2 right-swipes each" — the funnel still advances and Stage 3 (community, 8680
real rows, the best-populated stage) still unlocks. When zip rows appear, the
pool deepens and nothing in the engine changes.

---

## 4. Server plan

**`apps/web/app/api/mobile/feed/route.ts` — becomes a stage-aware *pool*
endpoint, not a composed feed.** The engine is client-side and pure, so the server
supplies eligible inventory and enforces the funnel's data gate:

```
GET /api/mobile/feed?stage=1&offset=0&limit=12
→ { stage, offset, limit, done,
    pool: { geoUnits: GeoUnit[], listings: ListingCardData[], communities: CommunityCardData[] } }
```

- **Listing hard gate enforced server-side too** (§0.2): stage 0–2 returns at most
  `ceil(limit/10)` tease listings, stage 3 returns previews only inside liked
  communities, stage 4 unlocks. Defense in depth — the client gate is not the only
  one.
- Ask/tradeoff/challenge pools stay **client-side static** (no data dependency).
  This matches the route's own existing comment ("Ask-cards are NOT injected here.
  Mobile client owns ask interleaving").
- Keeps `Cache-Control: no-store` + `Access-Control-Allow-Origin: *`. Input
  validated with a zod schema in `apps/web/lib/zod/` per CLAUDE.md §3.4.
- Reuses `fetchBrowseCards` / `fetchBrowseCardsVideosOnly` from
  `apps/web/lib/feed/browse-cards.ts` for the listing/community projections.

**New `apps/web/lib/feed/geo-units.ts`** — `fetchCityGeoUnits()`. Aggregating
8680 rows per request in Node is wasteful, so aggregate in SQL: a migration adding
a read-only view `public.city_geo_units` (`security_invoker = true`, so the
existing public-read RLS on `communities` still governs) grouping by `(city, state)`
and emitting count / centroid / one hero URL / 3 sample names. Wrapped in
`unstable_cache` (1h). Median price joins `listings` by `city` string and is
emitted only at `sampleSize >= 8`. *Additive view, no column drops — but it is a
migration, so I will confirm before writing it (CLAUDE.md §8).* Fallback with no
migration: paged fetch + in-process aggregation behind the same cache.

**Telemetry: no table in this task.** `buyer_scope_events` does not exist, and the
existing `events` table is structurally wrong for it — `events.listing_id` is an
FK to `listings` and `apps/web/app/api/events/route.ts` validates a zod union
requiring exactly one uuid of `listing_id`/`community_id` plus a 3-value
`event_type` enum. Buyer swipes are anonymous (05 §5.1: no signup wall) with
string ids like `ask-purpose-primary`; widening that union would loosen validation
on the agent-facing analytics path and pollute `apps/web/lib/analytics/`
aggregates. Meanwhile §1.10's field sets differ per event type and *nothing reads
them yet*, so the typed-columns-vs-jsonb question isn't decidable. Task-1 ships
the client contract (typed union, capped FIFO, drain-on-reconnect, no-op sink);
the table + `/api/mobile/events` land with their consumer.

---

## 5. Test plan

Vitest, `apps/mobile/lib/feed/*.test.ts` (existing glob, no config change).
Target: task-0's 26 → ~75.

**`generate-feed.test.ts`**
- Each of the 5 stage mixes matches §1.7 per 10 cards.
- **Listing hard gate**: stages 0–2 emit zero listing cards *except* teases; tease
  rate is exactly 1 per 10; stage 0 emits zero listings including teases (§1.7
  table: teases start at stage 1).
- Stage 3 listing previews only from liked communities; `MatchBadge` suppressed.
- `seenIds` never re-emitted before exhaustion; after exhaustion, loop with `seen`.
- First page is 12; determinism — same input, same output, twice.
- Empty-zip-pool Stage 2 falls back to the documented city substitution.
- Fatigued layer emits no `ask`/`area` for that layer.

**`stage-advance.test.ts`** — boundaries, both sides:
- 0→1: intent + budget + 1 life signal → `null`; + 2nd life signal → `1`.
- **1→2 city focus: 2 right-swipes → `null`; 3 → `2`.** Rate gate: 3 right of 6
  (=50%, not >50%) → `null`; 3 of 5 (60%) → `2`.
- 2→3: 1 unit at ≥2 → `null`; 2 units at ≥2 → `3`; 5 units → still `3` (the 2–4
  band is a target, not a ceiling that blocks).
- 3→4: 1 community like → `null`; 2 → `4`. Stage 4 → always `null` (terminal).
- Never returns a stage ≤ current (mirrors `funnel.ts`'s monotonic guard).

**`signals.test.ts`**
- Tease-listing right-swipe = 0.5× weight on both the listing and its geo unit,
  and *does* count toward advance.
- Ask/tradeoff record `(dim_left, dim_right, chosen)`; insight "Not sure" records
  nothing.
- **15-swipe layer fatigue**: 14 swipes zero-positive → not fatigued; 15th →
  fatigued; a single right-swipe anywhere in the window resets the counter.
- Left-swipe on area = soft downweight, never a hard exclusion (§1.7 "软排序,
  非过滤").

**`behavior.test.ts`** — every one of the 8 kinds resolves a behavior; milestone
is non-committing with `capRatio 0.30`; ask/tradeoff/challenge/insight/milestone
are non-undoable; ask/milestone have no data face.

**`event-queue.test.ts`** — FIFO order, 500-item cap drops oldest, drain clears
only what transport acked, failed drain retains.

Plus `pnpm typecheck` 0, `pnpm lint` clean, zero hex literals outside
`tokens.ts` (grep-verified over new files only — the legacy screens that would
pollute that grep are deleted), and `npx expo export --platform ios` as the
closest thing to a device check available on Linux.

---

## 6. Ambiguity list (defaults I propose)

**Decisions I could not get an answer on — these are my defaults, each reversible:**

| # | Question | Proposed default |
|---|---|---|
| A1 | Stage 1–2 have no geo inventory. Degrade or block? | **Don't block.** City units only, denser asks/tradeoffs, documented Stage-2 fallback (§3). Zip via a separate backfill task. |
| A2 | `buyer_scope_events` missing. | **Client queue only**, no-op sink; table + route deferred to its consumer (§4). |
| A3 | Three geo granularities, one derivable. | **Type carries all three from day one**, derivation emits `city` only (§3). I will not name invented metro sub-regions. |
| A4 | Route path / legacy screen. | **Create `(tabs)` with 3 stubs; delete `app/feed.tsx` + `place/[slug].tsx`.** |

**Spec-underspecified points:**

| # | Gap | Default |
|---|---|---|
| B1 | §1.7 "budget band" — how is it captured, given the no-picker iron law? | A dedicated tradeoff-style ask sequence (binary splits: "under $500K ← → over $500K", then narrowing once). Records a band, never a slider. |
| B2 | §1.7 stage-0 mix is ask×6 + trade×3 + challenge×1, but §1.6 says challenge is "Stage 2+". | Contradiction. **Stage 0 emits no challenge**; its slot becomes a 7th ask. Flagging as a real spec conflict. |
| B3 | §1.5 "one milestone per level, never repeated" across sessions? | Persisted `milestonesShown` set — never re-shown after reinstall-free restart. |
| B4 | §1.6 Challenge "correct/incorrect color pulse" duration/curve. | 180ms pulse inside the 900ms hold, `pos`/`neg` tokens. |
| B5 | §1.8 Undo restores the card — does it also revert the signal? | **Yes, fully reverts** signal + seenIds + any stage advance the swipe caused… except a stage advance is *not* reverted (`funnel.ts` is monotonic by design). Undo within 3s of the swipe that advanced a stage therefore reverts the signal but keeps the stage. Flagging: this is a real asymmetry the spec doesn't address. |
| B6 | §0.5 haptics: task-0 fires `impactAsync(light)` on settle for right-swipes only; §0.5 lists it unqualified for "card flies out and settles" but separately says pass = no haptic. | Keep task-0's reading (silent left settle). Defensible, not a bug — but it is an interpretation, so raising it rather than silently changing it. |
| B7 | §1.2 map thumb "静态图高亮当前问题的地理范围". | `communities.boundary` (8679 real GeoJSON) rendered as a simple static SVG path — no map SDK, no Static Maps API spend. |
| B8 | §1.3 area card media = "标志性街景/航拍视频". | Only 4 `community_videos` rows exist. Use the real `hero_image_url` still; §0.7 makes a static photo a first-class state with no missing-media affordance. |
| B9 | §1.10 `session_n` definition. | Increment on cold start or >30min background. |
| B10 | §1.9 offline detection mechanism. | `expo-network` is not installed; use fetch-failure inference (2 consecutive failures → offline bar) rather than adding a dependency. |
| B11 | §1.3 "See on map →" targets task 4's Search tab, which doesn't exist. | Render the button disabled with no navigation. Not a stub screen, not a fake nav. |
| B12 | listing/community data faces are specced in 02/03 (tasks 2–3). | Task 1 ships flip *mechanics* + a real-fields-only minimal face; tasks 2–3 fill them. |
| B13 | §1.7 insight "(条件) ×1" — evidence threshold. | §1.6's "≥6 of 8 same-dim likes", reusing `packages/shared/src/profile.ts`'s `pickInsight` shape where it fits. |
| B14 | Reduce Motion (05 §5.5) — in scope for task 1? | Yes, cheap: `AccessibilityInfo.isReduceMotionEnabled` disables rotation/flyout-spring (crossfade instead), haptics retained. |
| B15 | Milestone insertion point mid-deck. | Inserted at `activeIndex + 1` so it is the very next card after the qualifying swipe, not appended at the end. |

---

## 7. Sequencing

Each step ends green on `pnpm test` / `typecheck` / `lint` in `apps/mobile`, with
an incremental DEVLOG entry at the TOP. All commits to the existing
`phase-ios1/discovery-feed` branch. No push, no merge without your say-so.

| # | Step | Verifiable here (Linux)? |
|---|---|---|
| 1 | `card-types.ts`, `geo-unit.ts`, `behavior.ts`, `ratios.ts` | ✅ typecheck |
| 2 | `signals.ts` + `stage-advance.ts` + tests | ✅ **unit tests — this is where the acceptance boundaries live** |
| 3 | `generate-feed.ts` + tests | ✅ unit tests |
| 4 | Task-0 edits (`use-swipe-card.ts`, `SwipeStack.tsx`) + `decide-swipe` regression re-run | ✅ existing 26 stay green |
| 5 | `feed-session.ts`, `event-queue.ts` + tests | ✅ unit tests |
| 6 | Server: geo-unit aggregation + `/api/mobile/feed` pool contract + zod | ✅ curl against a local `next dev` |
| 7 | API base config (`app.json` extra + expo-constants) | ✅ |
| 8 | Card faces ×9 + chrome/system-state components | ⚠️ compiles only |
| 9 | `(tabs)` group, new `feed.tsx`, delete legacy | ✅ `expo export --platform ios` |
| 10 | Update `docs/design/spec-v3/VERIFY-task-1-on-mac.md` (mirroring the task-0 doc) | ✅ |

**`PENDING-SIM` — needs the Mac mini + Expo Go, cannot be checked on this box**
(all 6 visual acceptance items from `task-1-feed.md`):
- Stage 0→1 walkthrough: ask/tradeoff flow → milestone insert → non-swipeable →
  CTA continues.
- Tradeoff drag: chosen half brightens / discarded half dims, following the finger.
- Challenge: 900ms reveal then flyout.
- Flip: 350ms crossfade on listing/community/area; swipe disabled while flipped;
  ask tap is a no-op.
- Undo toast 3s; ask/tradeoff not undoable.
- `push` to `/listing/[id]` and back preserves `activeIndex`; exhausted terminal
  card + `seen` micro-badge on looped cards.

**Prerequisite for step 6 verification:** `apps/web` needs Supabase env vars,
which are present via the gitignored `.env.local` symlink noted in DEVLOG
2026-07-26.

**Out of scope, flagged for owner decision:** the zip reverse-geocode backfill
(§3, ~$40 Google Geocoding spend, CLAUDE.md §8), the `city_geo_units` migration
(§4, additive view — will confirm before writing), and `buyer_scope_events` +
`/api/mobile/events` (§4).
