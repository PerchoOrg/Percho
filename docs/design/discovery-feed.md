# Discovery Feed — Design

> Status: Draft (phase 118, 2026-07-19; updated phase 119 for vision v3 card
> types). Implements `docs/product-vision-v3.md` §2 (Feed Philosophy) and §3
> (Card Types). Prototype at `/tmp/percho-mechanics/vibe/feed.html` is
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

### 1.2 Feed rhythm: 3 pure-ask, then real content with occasional ask.

Resolved 2026-07-19 (owner): front-load is **3 cards**, not 6. The pure-ask
burst has to be short enough that it doesn't feel like a survey.

- **First 3 cards**: pure ask — intent + region + (state or metro), in that
  order. Highest-leverage signals only.
- **After that**: real content (listing / community) dominates. Ask cards
  sprinkled in occasionally (target ~1 in 5, not every third), reaching for
  layers we still know nothing about.
- **As scope narrows**: ask density should drop, not rise. The recommendation
  system takes over. See §1.8.

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

**One exception — the "Skip" affordance on ask cards.** Ask cards render a
small **Skip this topic** button (bottom-center, low-emphasis link style, not
a full button) that dismisses the entire current layer. Rationale: swipe-up
was rejected — too easy to mis-fire as a swipe-right. A visible-but-recessed
button is the right compromise. Listing / community cards do not carry this
button; it only appears on cards with `type === 'ask'`.

### 1.8 Adaptive ask termination — ranking system, not fixed sequence.

The ask pool is not a scripted onboarding. It's the **cold-start half of the
recommendation system**. As `state.scope` accumulates signal, ask cards must
step aside for real content that fits the accumulated scope. Concretely:

- A layer with ≥3 yes-signals is considered "warm" — no more ask cards from
  that layer.
- A layer with 0 signals after 15 total swipes is considered "not interested"
  — deprioritized, not re-asked unless upstream layers narrow into it.
- Once ≥3 layers are warm, ask density drops to ≤1 in 8 cards.
- Terminal state: user sees only listings + community cards from the
  intersected scope. Adding a new layer requires actively tapping a scope
  chip × to re-open.

The recommender picks *what to ask next* by information gain against the
current listing pool — not by hardcoded layer order after the first 3 cards.

## 2. Inputs

- **Ask pool** (Preference cards, `ASK_POOL`): 32+ cards, hand-curated in
  `_data.js:ASK_POOL`.
  - 5 intent / 4 region / 5 state / 5 metro / 5 city / 8 culture / 0 style.
  - Style layer is intentionally empty in v1 — deferred until we have enough
    listings to differentiate style credibly.
- **Trade-off pool** (`TRADEOFF_POOL`): hand-curated pairs of dimensions.
  Each item = `{left, right, dims: [dim_a, dim_b]}`. Target ~20 pairs v1.
- **Challenge pool** (`CHALLENGE_POOL`): guess-the-price, which-kitchen,
  etc. Each item names the market-signal it teaches (§30-Second Rule #2).
- **Insight bank** (`INSIGHT_TEMPLATES`): copy templates that fire when
  profile evidence crosses a threshold. Never fires on empty evidence.
- **Listing pool**: from `listings` + `listing_videos` (ready + published).
- **Community pool**: from `communities` + `community_videos` (is_primary =
  true, per phase 117).
- **User state**: `state.scope`, `state.scopeRejected`, `state.profile`
  (evidence-based observations), `state.tradeoffs` (dim ordering),
  `state.seenIds`. Persisted in localStorage under `percho-vibe:state:v1`.

## 2.5 Card types in the feed

Per `product-vision-v3.md` §3. Every card is one of six types, and each has
a defined interaction contract with the swipe layer:

| Type | Purpose | Swipe semantics | Requires WHY? |
|---|---|---|---|
| Preference (ask) | Learn preference | R = yes / L = no  ·  OR  L/R = binary choice | no |
| Listing | Recommend home | R = like · L = pass · long-press = peek · tap = Explore | **yes** |
| Community | Recommend subdivision | R = like · L = pass · long-press = peek · tap = Explore | **yes** |
| Trade-off ★ | Force priority | L = pick left dim · R = pick right dim (never yes/no) | no |
| Challenge | Fun / market ed | context-specific — usually 2 choice or reveal-after-swipe | no |
| Insight | AI observation | R = agree · L = disagree · up-tap = "not sure" | n/a |

**Interaction contract rules:**

- **Preference cards** may repurpose left/right as two named choices (e.g.
  "Modern ← → Classic") when the question is binary rather than yes/no.
  When they do, the card visually labels both sides with the choice, never
  with ✓/✗.
- **Trade-off cards never mean yes/no.** L and R are two competing dims. The
  card visually splits down the middle. Swipe records `(dim_left,
  dim_right, chosen)` — updates `state.tradeoffs`, drives ranking.
- **Insight cards** are the only card type where L is not "pass". L =
  "disagree", which is itself high-value signal (means the AI got it wrong,
  demote that evidence).
- **Challenge cards** occasionally have a reveal-after-swipe pattern (guess
  the price → after swipe the real price appears). This is the only case
  where the card content changes post-swipe.

## 2.6 Feed rhythm (updated)

Per `product-vision-v3.md` §2.2. Target sequence:

```
Listing → Community → Preference → Listing → Trade-off →
Listing → Insight → Challenge → Listing → …
```

Concrete rules for `generateFeed`:
- Listings anchor at ~40% of cards (highest density, but not majority).
- Preference cards taper: 3 pure-ask front-load (per §1.2), then ~1 in 5,
  then ~1 in 8 once ≥3 layers are warm (per §1.8).
- Community: ~1 in 5 once feed is warm.
- Trade-off: ~1 in 6 once ≥3 preference signals exist. Never before
  card 5 (needs some signal to pick meaningful dim pairs).
- Insight: fires only when evidence crosses a threshold, not on a fixed
  rhythm. May be absent for many cards.
- Challenge: ≤10% of feed. Cluster-avoid — no two challenges within 6 cards.

## 3. Pipeline / architecture

```
                        ┌──────────────────────┐
                        │  ASK_POOL (32 cards) │
                        │  TRADEOFF_POOL       │
                        │  CHALLENGE_POOL      │
                        │  INSIGHT_TEMPLATES   │
                        └──────────┬───────────┘
                                   │
    listings ──┐                   │
    community ─┼──▶ generateFeed(state, N) ──▶ [Card, ...]
    profile ───┘         │
                         ├── first 3: pure ask (intent/region/state|metro)
                         ├── then interleave per §2.6 rhythm
                         └── insights fire when evidence threshold crossed
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
│ 🎯 YOUR PURPOSE       [map ▫]  │  ← step tag + tiny map thumb (geo layers)
│                                │
│                                │
│    Retiring soon?              │  ← ask-q (40px bold)
│                                │
│    Golf, sunshine, low HOA     │  ← ask-sub (15px)
│                                │
│                                │
│  ← Swipe left      Swipe →     │  ← hint (red/green split)
│    No              Yes         │
│                                │
│         Skip this topic        │  ← low-emphasis link, layer dismiss
└────────────────────────────────┘
```

Background: full-bleed photo, dark gradient overlay. No back face (ask cards
don't flip; long-press is a no-op).

**Map thumb**: only on `region / state / metro / city` layers. Shows the
geographic scope of the current question so RTP-metro vs Cary-city vs NC-state
are visually distinguishable. Non-geo layers (intent, culture, style) show
no thumb.

**Imagery source ladder** (per §1 principles): v1 uses professional
street / skyline / drone stock (not Unsplash). UGC layer deferred to a later
phase once we have moderation and rights infrastructure.

**Skip this topic**: dismisses all remaining cards in the current layer for
this session. Registered as `state.scopeSkipped[layer] = true`. No effect on
ranking of already-rendered content.

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

_Resolved 2026-07-19 answers moved inline (§1.2, §1.7, §1.8, §4.1, §9)._
_Section retained for future rounds._

1. What does "information gain" actually compute against the listing pool for
   §1.8 recommender? Simple heuristic first (layer coverage) or IG on scope
   entropy? Leaning heuristic in v1.
2. Chip × removal — does it also re-open that layer for future ask cards, or
   is removal permanent for the session? Leaning "re-opens".
3. When a layer is "warm" (≥3 yes) but user swipes × on all chips, does the
   layer reset to cold, or stay warm? Leaning "reset to cold".

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
7. **No swipe-up gestures on the feed.** Vertical gestures collide with
   swipe-right in-fingers; layer-skip is a button (§1.7), not a swipe.
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
