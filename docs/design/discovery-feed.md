# Discovery Feed — Design

> Status: Draft (phase 118, 2026-07-19). Derived from 07-19 prototype at
> `/tmp/percho-mechanics/vibe/feed.html`. Reviewed on mobile via cloudflared.
> This doc supersedes ad-hoc discussions in Slack #product-ops. Prototype is
> throwaway; this doc is the durable artifact.

## 0. TL;DR

Percho's buyer-facing consumption surface is a **single vertical swipe feed** —
not a search box, not a category grid. Every card is swipeable (right = yes,
left = no), and cards come in three types interleaved: **ask** (a
buyer-preference question), **listing** (a home video), **community** (a
subdivision video). Ask cards are the funnel — they narrow a 7-layer scope
(intent → region → state → metro → city → culture → style) through swipes, no
tap-picker, no multi-select UI. Scope drives ranking of subsequent listing /
community cards. Positioning vs Homes.com: we don't compete on single-video
quality; we compete on **time-in-feed × subdivision granularity × listing↔nearby
interweaving**.

The #1 non-obvious constraint: **all preference input is one-question-per-card
via swipe.** No pickers, no chip-toggles, no bottom sheets. If a preference
question can't fit on a card, it doesn't ship.

## 1. Philosophy / principles

### 1.1 One question per card. Swipe answers everything.

The funnel is a Tinder for preferences, not an onboarding survey. Every scope
narrowing (intent, region, state, metro, city, culture, style) is a
**standalone ask card** with a single yes/no proposition and one background
photo. Swipe right = the id is added to `state.scope[type]`. Swipe left = the
id is added to `state.scopeRejected[type]` (so we don't ask again).

This means:

- **No pickers, no chip toggles, no bottom sheets** — those break the swipe
  rhythm and force the user to context-switch into "form mode".
- **Multi-select happens naturally** — the user just says yes to multiple
  cards in the same layer.
- **Skipping a layer is skipping N cards** — no explicit "skip this section"
  button in v1. (Deferred: swipe-up = skip layer; see §8 Q3.)

### 1.2 Feed rhythm: front-load ask, then interleave.

Empirically the pool that works in prototype:

- **First 6 cards**: pure ask (cold-start signal collection).
- **After that**: `i % 3 === 0` → ask; `i % 4 === 0` → community; else listing.

Roughly ⅓ ask, ⅓ community, ⅓ listing once warmed up. Front-loading ask is a
bet: users tolerate a short onboarding-feeling burst if the payoff (relevant
listings 30 seconds in) is immediate.

### 1.3 Scope drives ranking, not filtering.

`state.scope` is a soft ranking signal, **not a hard filter**. A user who said
"yes to Retirement" still sees Chapel Hill listings that don't scream
retirement — Percho ranks retirement-aligned listings higher, but a lifestyle
mismatch is a soft demote, not a hide. Reason: hard filters at swipe pace
produce empty feeds and frustrate exploration.

### 1.4 Subdivision is the community anchor. Not city, not neighborhood.

Community cards anchor at **subdivision** (e.g. Waterside), not city (Chapel
Hill) or neighborhood (Southpoint). POIs are computed within 3 km of the
subdivision entrance, not the city centroid. This is the granularity Homes.com
does not have and is the durable moat.

### 1.5 Homes.com is not the target.

Percho is not a better Homes.com. Homes has better single-video production
value (drone + agent on-camera) and better SEO. Percho competes on:
- **time-in-feed** (swipe > search),
- **subdivision granularity** (per-Waterside, not per-city),
- **listing↔nearby interweaving** (a listing video embeds 3 km POI context).

Head-to-head content quality on any single video is a **fight we lose and
should not enter**. See §9.

### 1.6 Deep-dive lives behind gestures, not tabs.

The feed has 4 escape hatches into deeper content, all gesture-triggered so
they don't clutter the swipe frame:

| Trigger | Reveal |
|---|---|
| Long-press 450ms | "Deep peek" back of card — POI list, price history, comps |
| Tap on data face | Deep-link into `place.html` / listing detail |
| Overflow banner (top after N swipes) | "You've seen 20; jump to map / saved" |
| 82% video progress | Soft CTA — "See all 8 videos of this home" |

None of these are visible chrome by default. All 4 discovered incrementally.

### 1.7 Refuse chrome that competes with the card.

Top strip (scope chips) is capped at ~50px, z-index 50. Chip labels come from
`ASK_POOL[id].chip` (short: "🌅 Retirement"). Each chip is a single tap-x to
remove. No filter bar, no tabs, no search box on the feed surface. If a UI
element isn't a card or a chip, it needs a §1.7 justification.

## 2. Inputs

- **Ask pool**: 32 cards, hand-curated in `_data.js:ASK_POOL`.
  - 5 intent / 4 region / 5 state / 5 metro / 5 city / 8 culture / 0 style.
  - Style layer is intentionally empty in v1 — deferred until we have enough
    listings to differentiate style credibly.
- **Listing pool**: from `listings` + `listing_videos` (ready + published).
- **Community pool**: from `communities` + `community_videos` (is_primary =
  true, per phase 117).
- **User state**: `state.scope`, `state.scopeRejected`, `state.seenIds`.
  Persisted in localStorage under `percho-vibe:state:v1`.

## 3. Pipeline / architecture

```
                        ┌──────────────────────┐
                        │  ASK_POOL (32 cards) │
                        │  hand-curated        │
                        └──────────┬───────────┘
                                   │
    listings ──┐                   │
               ├──▶ generateFeed(state, N) ──▶ [Card, ...]
    community ─┘         │
                         ├── first 6: pure ask
                         └── after: i%3 ask, i%4 community, else listing
                                                          │
                                                          ▼
                                                  ┌───────────────┐
                                                  │ Swipe surface │
                                                  │ (feed.html)   │
                                                  └───┬───────┬───┘
                                                      │       │
                                    right (yes) ──────┘       └────── left (no)
                                    scope[type].push(id)              scopeRejected[type].push(id)
                                                      │
                                                      ▼
                                            updateScopeStrip()
                                            (top chips, 7-layer flatten)
```

The feed generator is stateless — pure function of `(state, N) → Card[]`.
Ranking of listings/communities against scope happens **inside**
`generateFeed`; the surface just renders.

## 4. UI wireframes + server actions

### 4.1 Ask card

```
┌────────────────────────────────┐
│ 🎯 YOUR PURPOSE                │  ← step tag (orange, 12px)
│                                │
│                                │
│    Retiring soon?              │  ← ask-q (40px bold)
│                                │
│    Golf, sunshine, low HOA     │  ← ask-sub (15px)
│                                │
│                                │
│  ← Swipe left      Swipe →     │  ← hint (red/green split)
│    No              Yes         │
└────────────────────────────────┘
```

Background: full-bleed photo, dark gradient overlay. No back face (ask cards
don't flip; long-press is a no-op).

### 4.2 Scope strip (top of feed)

```
┌────────────────────────────────┐
│ 🌅 Retirement ×  🏔 Mountain × │  ← 50px, z-50, horizontal scroll
├────────────────────────────────┤
│ (feed card below)              │
```

Chips render in **hierarchy order** `[intent, region, state, metro, city,
culture, style]`, flattened across each layer's array. Tap × removes that id
from `state.scope[type]`.

### 4.3 Feed card types

| Type | Face | Back (flip) | Long-press |
|---|---|---|---|
| `ask` | Question | none | no-op |
| `listing` | Video/photo | Data (price/beds/DOM) | Deep peek (POIs) |
| `community` | Video | Data (subdivision stats) | Deep peek (POIs) |

### 4.4 Server actions (v1 — proposed signatures)

These do not exist yet. The prototype ran off `_data.js` client-side pools.
When we productionize:

```ts
// lib/discovery/feed.ts
export async function generateDiscoveryFeed(
  userId: string | null,
  scope: ScopeState,
  seenIds: string[],
  n: number = 12
): Promise<FeedCard[]>

// lib/discovery/ask-pool.ts
export function nextAskCards(
  scope: ScopeState,
  rejected: RejectedState,
  count: number
): AskCard[]  // pure, no I/O — reads from static ASK_POOL

// lib/discovery/scope.ts
export type ScopeState = {
  intent: string[]
  region: string[]
  state: string[]
  metro: string[]
  city: string[]
  culture: string[]
  style: string[]
}

export function rankListings(
  candidates: Listing[],
  scope: ScopeState
): Listing[]  // soft ranking, no filter
```

**Signature-level enforcement**: `ScopeState` is `Record<layer, string[]>` (all
arrays, not `string | string[]`). This makes single-select-per-layer
un-typable at the API boundary. If a future dev thinks "intent should be one
value" they have to change the type first, which triggers doc review.

## 5. Data model

Existing tables (unchanged in v1):

| Table | Role |
|---|---|
| `listings` | Ranked candidates for listing cards |
| `listing_videos` | Video assets shown on listing cards |
| `communities` | Subdivision anchor |
| `community_videos` | Community cards (filter `is_primary=true`, phase 117) |

New (v1, TBD):

| Table | Purpose |
|---|---|
| `buyer_scope_events` | Append-only log of every swipe, `(user_id, card_id, layer, verdict, ts)` |

`ASK_POOL` in v1 is a static JSON in `lib/discovery/ask-pool.ts` — not a
table. Table-ify only when we have >50 cards or per-user variants.

## 6. Phased rollout

### Phase A — Prototype validation (current)

**Scope**: `/tmp/percho-mechanics/vibe/feed.html` — client-only, mocked pools,
localStorage state.

**Exit criteria** (must all be true before Phase B starts):
- Owner completes a mobile review pass and greenlights the ask-card + scope
  strip mechanic.
- 5 pending UX questions in §8 are answered.

### Phase B — Behind-the-flag productionization

**Scope**: port prototype mechanics into main app behind `?feed=v2` flag.
`generateDiscoveryFeed` + `nextAskCards` server actions. ASK_POOL as static
JSON. Scope persists to `buyer_scope_events`. Listing/community ranking is
soft-weighted by scope.

**Exit criteria**:
- Feed loads on mobile with real data, 12 cards, correct rhythm.
- Scope chips render in hierarchy order.
- 3 test users complete ≥20 swipes without a bug that requires refresh.
- Listing ranking measurably shifts with scope changes (spot-check: swipe yes
  to Retirement → cap-rate-heavy listings demote).

### Phase C — Deep-dive gestures

**Scope**: long-press deep peek, 82% video CTA, overflow banner. Ask cards
remain inert on long-press.

**Exit criteria**: 3 test users discover ≥2 of the 4 gestures organically
within 40 swipes.

### Phase D — Full replacement

**Scope**: `?feed=v2` becomes default. Old `/browse` feed retired.

**Exit criteria**: crash-free rate parity with old feed; median session length
matches or exceeds old feed baseline.

## 7. Metrics / observability

Log to `buyer_scope_events`:
- swipe direction, layer, card_id
- time-since-previous-swipe (for feed rhythm health)
- scope size at time of swipe

Dashboards:
- **Scope pickup rate**: % of sessions that add ≥1 scope item within first 6
  cards. Alert if <60%.
- **Layer completion**: distribution of layers touched per session (intent /
  region / state / …).
- **Ranking impact**: correlation between scope entries and listing swipe-right
  rate on subsequent listing cards.

## 8. Open questions

1. **First 6 pure-ask cards — too much onboarding?** Alternative: interleave
   real content from card 1, cold-start-boost ask density. Leaning toward
   keeping pure-ask front-load; asking user.
2. **State vs metro vs city — can the user tell them apart?** RTP (metro) vs
   Cary (city) vs NC (state) are semantically distinct but visually similar
   ask cards. Leaning: add a small map thumbnail per layer to disambiguate.
3. **Swipe up = skip layer?** Currently no gesture skips a whole layer; user
   just says no N times. Adds complexity but improves control. Asking user.
4. **Ask card imagery — Unsplash placeholder vs real UGC / drone / street?**
   Prototype uses Unsplash. Real UGC is highest-signal but hardest to
   procure. Leaning: professional street/skyline in v1, UGC layer later.
5. **Adaptive ask termination**: once user says yes to ≥3 cities, should we
   stop asking city-layer questions and switch to city-filtered listings?
   Leaning yes; needs an interaction study.

## 9. Not doing (non-goals)

Ordered by load-bearing weight:

1. **No pickers, no chip-toggles, no multi-select UIs for preference input.**
   All ask input is single-question-per-card swipe. If you can't fit it on a
   card, it doesn't ship. (Codified from qiaoxux 07-19 push-back.)
2. **No competing with Homes.com on single-video production quality.** We
   don't out-shoot them. We out-swipe them.
3. **No hard filters at swipe pace.** Scope is a ranking signal, not a
   filter. Empty feeds kill exploration.
4. **No community anchor above subdivision.** No city-level community cards
   in v1. Subdivision-only.
5. **No traditional search box on the feed surface.** Global nav search
   exists elsewhere; the feed itself is discovery, not lookup.
6. **No style layer in v1.** Ask pool has 0 style cards. Revisit when listing
   inventory can differentiate style credibly.
7. **No swipe-up = skip layer in v1.** Deferred pending §8 Q3 answer.
8. **No ASK_POOL DB table in v1.** Static JSON. Table-ify at >50 cards.
9. **No per-POI video cards in the feed.** POIs render inside listing /
   community cards, not as their own feed items. (Anchors §1.1 of
   `poi-content-pipeline.md`.)

## 10. Related docs

- `docs/pipelines/README.md` — video generation master (upstream: produces
  the listing / community videos that this feed consumes)
- `docs/poi-content-pipeline.md` — POI → buyer-question video pipeline
- `docs/ARCHITECTURE.md` §1 — system diagram (feed is the buyer-facing consumer)

## 11. Prototype reference

- Location: `/tmp/percho-mechanics/vibe/feed.html` (not in git — throwaway)
- Session: 2026-07-19 mobile review, cloudflared tunnel
- Key files: `feed.html` (~61KB), `_data.js` (~24KB, ASK_POOL + generateFeed)
- Known bug fixed in session: `attachSwipe` assumed `.front-actions` on all
  cards; ask cards lack it. Handler threw and lost touch bindings. Fix: null
  check + `isAsk` early-return. (Learning encoded in §1.1 — new card types
  must be reviewed against every DOM-touching handler.)
