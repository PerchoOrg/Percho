# Listing Explore — Design

> Status: Draft, phase 119 (2026-07-19). Feature-level implementation of
> `docs/design/preference-learning.md` §4 (Listing Detail Experience).
> Owned by the discovery-feed team; consumes video from the POI pipeline.

## 0. TL;DR

Listing Detail is not a property spec sheet. It's a **guided two-phase
experience**: (1) a 3–5 stop AI-directed tour that references the buyer's
profile at every stop, then (2) free explore of all hotspots. Every hotspot
is **actionable** (Why · Compare · Renovate · Save · Ask AI), never just
descriptive text. Entry is the `Explore` action on a Listing Card.

The #1 non-obvious constraint: **every stop and every hotspot must connect
back to the buyer's profile.** Never explain the house — explain why *this*
buyer might care. If we can't personalize a stop, we don't include it in the
tour.

## 1. Philosophy / principles

### 1.1 Personalized guidance, not annotation.

Every stop begins with a WHY that references profile signal. Copy pattern:

```
"You've [evidence]. [Feature] is why this home might fit."
```

Examples:
- "You've saved 4 homes with trail access — this backs onto the same
  greenway system."
- "You've consistently liked open kitchens over formal dining. This one
  puts the island where you cook."

If no profile evidence supports a stop, either (a) find a stop we can
personalize, or (b) demote it out of the guided tour into free explore.

### 1.2 Two phases, one flow.

**Phase 1 — Guided Tour**: 3–5 stops, AI-picked, sequential.
**Phase 2 — Free Explore**: all hotspots unlocked, user roams.

The transition is a single card ("You've seen the highlights — explore
freely"), not a mode switch. Same URL, same scroll.

### 1.3 Hotspots are actions, not tooltips.

A hotspot is an entry into deeper exploration. Every hotspot exposes 3–5 of:

- **Why this matters** (profile-connected reason)
- **Compare with similar homes** (contextual data)
- **Renovation estimate** (for dated features)
- **Save this feature** (adds signal to profile)
- **Ask AI** (free-form Q about this feature)

A hotspot that only reveals a caption is broken. Cut it or upgrade it.

### 1.4 The Explore surface itself is a signal source.

Every hotspot opened, every "Save this feature" tap, every skipped stop —
these are all profile signals. Time-on-hotspot is a signal. Which of the 4
hotspot actions the user picks is a signal. Explore is not the end of
learning; it's a high-density learning surface.

### 1.5 Fail the 30-Second Rule → cut the feature.

Every element of Listing Explore is tested against `preference-learning.md`
§8. A hotspot action that satisfies none of the four goals is removed. In
practice, the four hotspot actions map cleanly:

| Action | 30-Second goal |
|---|---|
| Why this matters | #4 (AI understands me) |
| Compare with similar homes | #2 (teach the market) + #3 (confidence) |
| Renovation estimate | #3 (confidence in a decision) |
| Save this feature | #1 (learn about buyer) |
| Ask AI | #2 + #3 |

## 2. Inputs

- **Listing**: `listings` + `listing_videos` (ready + published)
- **Community context**: subdivision + 3km POI (from POI pipeline)
- **Buyer profile**: evidence-based observations (§5 of vision v3)
- **Hotspot definitions**: TBD schema — for v1, hand-curated per listing;
  future: extracted from listing photos/video via CV

## 3. Pipeline / architecture

```
Feed Listing Card
      │  user taps Explore
      ▼
generateGuidedTour(listing_id, profile) ──▶ [Stop, Stop, Stop, Stop, Stop]
      │
      │  each Stop = { hotspot, why, evidence, actions[] }
      │
      ▼
Guided Tour surface (sequential)
      │
      │  after last stop
      ▼
Free Explore surface
      │
      │  all hotspots visible
      ▼
Every interaction ──▶ profile signal log ──▶ recommender
```

`generateGuidedTour` is pure: `(listing, profile) → Stop[]`. Personalization
happens here — if profile has no signal, tour falls back to a generic 3-stop
sequence, but this is a code-smell (means we onboarded the user into Explore
too early).

## 4. UI wireframes + server actions

### 4.1 Guided Tour Stop

```
┌────────────────────────────────┐
│ Stop 2 of 4       [X close]    │
│                                │
│      [Video / photo of         │
│       the kitchen island]      │
│                                │
├────────────────────────────────┤
│ You've liked homes designed    │
│ for entertaining, so we        │  ← WHY (§1.1 pattern)
│ wanted to show you this        │
│ island first.                  │
│                                │
│ ┌─ Actions ─────────────────┐  │
│ │ Why this matters          │  │
│ │ Compare with similar homes│  │
│ │ Save this feature         │  │
│ │ Ask AI                    │  │
│ └───────────────────────────┘  │
│                                │
│ ← Prev              Next →     │
└────────────────────────────────┘
```

Prev/Next advance through the tour. `X close` exits into Free Explore
(unlocked, since the user opted out of guided).

### 4.2 Guided → Free Explore transition

Single card between last stop and Free Explore:

```
┌────────────────────────────────┐
│                                │
│    You've seen the highlights. │
│    Explore the rest freely.    │
│                                │
│    ────────────────            │
│    We've learned that you care │  ← reinforce §6 progress
│    about outdoor space and     │
│    open floor plans.           │
│                                │
│         [ Continue ]           │
│                                │
└────────────────────────────────┘
```

### 4.3 Free Explore

```
┌────────────────────────────────┐
│  Full listing hero (video)     │
│  🎯 🎯 🎯   ← hotspot pins     │
├────────────────────────────────┤
│  Overview · Kitchen · Yard ·   │  ← scrolls to sections
│  Community · Schools · Comps   │
├────────────────────────────────┤
│  Kitchen                       │
│  [photo] 🎯                    │
│                                │
│  Actions available:            │
│  Why this matters              │
│  Compare with similar homes    │
│  Save this feature             │
│  Ask AI                        │
├────────────────────────────────┤
│  Yard                          │
│  ...                           │
```

Hotspot pins on hero video open a bottom sheet with actions.

### 4.4 Server actions (proposed signatures)

```ts
// lib/listing-explore/tour.ts
export function generateGuidedTour(
  listing: Listing,
  profile: BuyerProfile,
): Stop[]  // pure, no I/O; length 3–5

export type Stop = {
  hotspot_id: string
  why: string          // required — see §1.1
  evidence: EvidenceRef[]  // profile items justifying this stop
  actions: HotspotAction[] // subset of the 5, min 3
}

// lib/listing-explore/hotspot.ts
export type HotspotAction =
  | { kind: 'why_this_matters', reason: string }
  | { kind: 'compare', metric: string, comparison: ComparisonData }
  | { kind: 'renovation_estimate', low: number, high: number }
  | { kind: 'save_feature', feature: string }
  | { kind: 'ask_ai', prompt_seed: string }

// lib/listing-explore/signals.ts
export async function logExploreSignal(
  user_id: string,
  listing_id: string,
  event: ExploreEvent,
): Promise<void>
```

**Signature-level enforcement**: `Stop.why` is a required string, not
optional. A stop without a WHY doesn't type-check. `Stop.evidence` is a
non-empty array — a stop with no profile evidence to cite is un-typable.

## 5. Data model

New tables:

| Table | Purpose |
|---|---|
| `listing_hotspots` | `(listing_id, hotspot_id, x, y, feature, media_ref)` |
| `listing_explore_events` | Append-only signal log: opens, hotspot_taps, action_taps, saves |
| `saved_features` | `(user_id, feature)` — profile-facing |

Reuses:

| Table | Role |
|---|---|
| `listings`, `listing_videos` | Content |
| `communities`, `community_videos` | Community context for Community hotspot |
| `buyer_scope_events` (from discovery-feed) | Profile input |

## 6. Phased rollout

### Phase A — Prototype (current)

**Scope**: HTML prototype with 1 real listing + hand-curated hotspots + fake
profile. Guided tour has 4 stops. Free Explore lists 6 hotspots. All 5
hotspot actions render on at least one hotspot each.

**Exit criteria**:
- Owner mobile-review greenlights the two-phase flow.
- At least one Stop's WHY copy is judged "connects to profile, not describes
  house" by owner.
- Every hotspot has ≥3 actions.

### Phase B — Behind-the-flag productionization

**Scope**: Real `generateGuidedTour` fed by real profile from
`buyer_scope_events`. Hand-curated hotspots per listing (no CV yet). Signals
logged to `listing_explore_events`.

**Exit criteria**:
- 3 real listings each generate a valid guided tour from a real seeded
  profile.
- Signals appear in log within 500ms of interaction.
- Recommender ranking incorporates saved features (spot-check: save 2
  "large yard" features → next feed's listings tilt toward larger lots).

### Phase C — CV-driven hotspots

**Scope**: Extract candidate hotspots from listing photos via vision model.
Curator approves.

**Exit criteria**: For 10 listings, ≥60% of curator-accepted hotspots come
from CV proposals.

### Phase D — Ask AI live

**Scope**: The "Ask AI" hotspot action becomes a real LLM call scoped to the
listing + profile. Rate limited, moderated.

**Exit criteria**: Per-user daily cap holds; moderation catches injection
attempts in test set.

## 7. Metrics / observability

- **Tour completion rate**: % of Explore opens that finish all guided stops.
- **Personalization landing**: for each Stop, log which evidence items were
  cited. Aggregate to find which profile signals actually get used.
- **Action distribution**: which of the 5 hotspot actions get tapped most?
  Distribution should not concentrate — a >70% share for one action means
  the others fail the 30-Second Rule and should be reconsidered.
- **Post-Explore signal density**: saves + ask-ai interactions per Explore
  session. Higher = healthier.

## 8. Open questions

1. **Tour length**: 3, 4, or 5 stops? Prototype fix at 4; measure completion
   rate.
2. **Hotspot curation authority**: agent-provided (Vivian curates for her
   listings) vs Percho-curated vs CV-proposed? Leaning agent-curated in v1,
   Percho reviews.
3. **What if profile is empty** (fresh user comes in via Explore before
   swiping any feed cards)? Fallback tour: universal 3-stop
   (Hero · Kitchen · Neighborhood) with no personalized WHY. This is a
   §1.1 concession — mark clearly in copy so we don't lie about
   personalization we can't yet do.
4. **"Ask AI" scope**: is it about the listing? the neighborhood? open-ended?
   Leaning "listing + community, not open web".
5. **Renovation estimate accuracy**: partner integration (RenoFi, HomeAdvisor)
   vs rule-of-thumb ranges? Rule of thumb in v1.

## 9. Not doing (non-goals)

Ordered by load-bearing weight.

1. **No stop without a WHY.** Signature enforces this (`Stop.why: string`).
   If profile has no evidence, the stop doesn't ship.
2. **No hotspot that only reveals text.** Every hotspot has ≥3 actions.
3. **No traditional spec-sheet layout.** Beds / baths / sqft is a summary
   line, not the page. The page is the tour + explore.
4. **No "advanced filter" panel inside Explore.** Explore is depth on one
   listing, not another search surface.
5. **No mode toggle between guided and free.** They are sequential phases of
   the same flow, per §1.2.
6. **No feature that fails vision-v3 §8.** The 30-Second Rule applies here
   as everywhere.
7. **No AI training UI.** The user is never told "your answer trained the
   AI". Explore learns silently.

## 10. Related

- `docs/design/preference-learning.md` §4 — the vision this doc implements
- `docs/design/discovery-feed.md` — upstream (Listing Card's Explore action
  triggers this flow)
- `docs/pipelines/poi-content.md` — supplies community context for the
  Community hotspot
