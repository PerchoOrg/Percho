# Percho — Preference Learning (Product Vision)

> Status: Canonical product vision, 2026-07-19. Written by Tianrou Wang.
> Supersedes any prior positioning docs at the vision layer. Feature-level
> designs (discovery-feed, listing-explore, POI pipeline) live in this
> `design/` folder and must trace back to a principle in this doc.

## 0. TL;DR

Percho is not another listing website. We are building an AI that continuously
learns what "home" means to each buyer. The goal is not to show more listings
— it is to help buyers make better decisions by understanding their
preferences over time.

**North Star**: Every interaction should make the AI understand the buyer
better. Not every interaction needs to teach the user something. But every
interaction should improve personalization.

**Product Principle**: Don't optimize for showing more listings. Optimize for
understanding the buyer after every interaction.

**Feel**: The product should never feel like the user is training an AI.
Instead, it should feel like the AI is constantly trying to understand the
buyer, and every recommendation becomes more personal because of it.

## 1. Core Product Loop

```
       Preference Learning
              ↓
       Personal Profile
              ↓
       Personalized Recommendations
              ↓
       Guided Listing Experience
              ↓
       More User Signals
              ↓
       Better Understanding
              ↓
              ↺  (repeat)
```

There is no "learning mode" and "recommendation mode." The AI continuously
learns. Every screen in the app is simultaneously a learning surface and a
recommendation surface.

## 2. Feed Philosophy

The feed is **not** a listing feed. It is a living conversation between the AI
and the buyer. Users should feel like they are naturally discovering homes.
The AI quietly learns from every interaction.

### 2.1 Universal Card System

Everything inside Percho is represented as a **Card**. Cards are the universal
interaction model. Different card types have different interactions, but all
belong to one continuous feed.

Six card types in v1:

1. **Preference** — learn buyer preferences
2. **Listing** — recommend homes (each with a WHY)
3. **Community** — recommend neighborhoods (each with a WHY)
4. **Trade-off** ★ — force real priority decisions
5. **Challenge** — occasional surprise / fun
6. **Insight** — AI observations about the buyer

See §3 for detail on each.

### 2.2 Feed Rhythm

Avoid showing only listings. Target rhythm:

```
Listing → Community → Preference → Listing → Trade-off →
Listing → Insight → Challenge → Listing → …
```

Listings are the anchor (~40% of cards), but interleaved so the feed feels
dynamic and conversational, not a scroll of properties.

## 3. Card Types

### 3.1 Preference Card

**Purpose**: Learn buyer preferences.

**Examples**:
- Modern or classic?
- Backyard or walkability?
- Quiet or vibrant?
- Investment or forever home?

**Interaction**: Usually swipe left/right. Sometimes left/right represents two
different choices instead of Like / Pass — the card should visually make clear
which mode is in play (label the two sides with the choice, not with ✓ / ✗).

### 3.2 Listing Card

**Purpose**: Recommend homes. **Every listing must explain WHY it was
recommended.**

Example WHY: *"Because you've consistently chosen homes with outdoor
entertaining spaces."*

**Actions**: Like · Pass · Save · Explore.

Explore is the entry point into the Listing Detail Experience (§4).

### 3.3 Community Card

**Purpose**: Recommend neighborhoods. **Don't describe the neighborhood —
explain why it matches the user's behavior.**

Example WHY: *"You've repeatedly preferred neighborhoods with trails and
slower traffic."*

Anchor: subdivision (Waterside), not city. POI radius 3 km from subdivision
entrance. (Anchors `pipelines/poi-content.md`.)

### 3.4 Trade-off Card ★

**Purpose**: Help buyers make real buying decisions while teaching the AI
their priorities. This is a **core mechanic** — trade-offs reveal what buyers
truly value in a way that single-attribute preference cards cannot.

**Examples**:

| Left | vs | Right |
|---|---|---|
| Better schools | vs | Shorter commute |
| Large backyard | vs | Updated kitchen |
| Smaller home | vs | Better neighborhood |
| Move-in ready | vs | Room to grow |
| Walkable area | vs | Private yard |

**Signal captured**: `(dim_A, dim_B, chosen)` tuple stored in profile. Multiple
trade-offs over time build a **priority ordering** across dimensions, which
drives listing ranking.

### 3.5 Challenge Card

**Purpose**: Occasional surprise and fun. **NOT** the core product.

**Examples**:
- Guess the listing price
- Guess which neighborhood is more expensive
- Which kitchen would you choose?

Challenge Cards appear occasionally (target ≤10% of feed density). They
improve engagement without becoming the primary interaction. Every Challenge
Card must also satisfy the 30-Second Rule (§8) — usually via signals #2
(teach the buyer about the market) and #1 (learn buyer preference).

### 3.6 Insight Card

**Purpose**: AI-generated observations that make the buyer feel understood.

**Examples**:
- "We've noticed something."
- "You consistently choose tree-lined neighborhoods."
- "You rarely prioritize nightlife."
- "You usually pay more for outdoor space."

**Rules**:
- Insights are **evidence-based**, never personality labels (see §5).
- Insights should surface only when the underlying evidence is real (N ≥ some
  threshold of signal). A wrong insight destroys trust immediately.
- User can react to an insight (agree / disagree / not sure). Reactions
  themselves are signals.

### 3.7 Additional card types (v2+ candidates — not shipping v1)

Documented here so future feature ideas map to existing types instead of
proliferating one-offs:

- **Comparison Card** — "Which of these two homes feels more like you?" side-
  by-side. Similar to Trade-off but on whole listings.
- **Recap Card** — "Here's what you told us this week." Weekly summary.
- **Question Card** — free-form AI question surfaced when profile has a gap.
- **Market Card** — "Homes in Waterside sold 8% above ask this quarter."
  Contextual education. Only ships when it beats the 30-Second Rule (§8).
- **Milestone Card** — "We've reached high confidence on your style." Emitted
  by the profile system, not scheduled.

Any new type must justify itself against §8 before landing in code.

## 4. Listing Detail Experience

Listing Detail is **not** a traditional property page. It is a personalized
guided experience.

### 4.1 Phase 1 — AI Guided Tour

The AI decides what to show first. Instead of exposing every hotspot up front,
guide the user through 3–5 meaningful highlights.

**Example flow (for a buyer who likes entertaining spaces)**:

```
Kitchen ("You've liked homes designed for entertaining, so we're
         starting with this island first.")
   ↓
Island detail (compare · why it matters · save)
   ↓
Backyard ("You've been picking properties with outdoor gathering space.")
   ↓
Neighborhood ("The trails you've liked in Waterside are 4 minutes from
              this door.")
```

The AI acts as a storyteller and director. The tour is short — buyers
skimming a listing get value in 30 seconds without hunting.

### 4.2 Phase 2 — Free Explore

After the guided tour, unlock the full property. Users freely explore all
hotspots.

### 4.3 Hotspots — actionable, not descriptive

Hotspots must **not** simply reveal text. Every hotspot offers useful actions:

- **Why this matters** — connect the feature to the buyer's profile
- **Compare with similar homes** — how this feature stacks up
- **Renovation estimate** — for features flagged as dated
- **Save this feature** — signals interest for future recommendations
- **Ask AI** — free-form question about this feature

Hotspots are entry points into deeper exploration, not annotations.

### 4.4 Personalized Guidance (writing rules)

Every guided tour reference is **connected back to the buyer**.

Bad: *"This kitchen has a large island."*
Good: *"You've consistently liked homes designed for entertaining, so we
      wanted to show you this island first."*

Bad: *"The lot backs onto trails."*
Good: *"You saved 4 homes with trail access in the past week — this backs
      onto the same greenway system."*

**Explore Philosophy**: Don't explain the house. Explain why THIS buyer might
care.

## 5. Personal Profile

Avoid fixed personality labels.

Bad: *"You're a City Girl."*
Good: *"You've consistently preferred walkable neighborhoods."*
Good: *"You often sacrifice square footage for better locations."*

The profile is a set of **evidence-based observations** that evolve over time.
Every observation should be backed by a countable signal:

```
observation: "You've consistently preferred walkable neighborhoods."
evidence:    12 of 15 liked listings had walk_score > 70
```

If the evidence stops holding, the observation fades. The profile is a live
document, not a persistent label.

## 6. Progress — reward understanding, not swiping

**Do NOT reward swiping.** Avoid:
- Level 5
- 100 Swipes
- Explorer Badge

**Reward understanding.** Prefer:
- "We're becoming more confident in your taste."
- "We now understand what makes a place feel like home for you."
- "Our recommendations for you have improved 3× this week."

The feeling should be: **The AI understands me better.**

## 7. Long-term Vision

Every swipe, every explore, every saved listing, every ignored feature, every
trade-off, every challenge — should improve the buyer profile.

Percho should feel less like Zillow and more like a **conversation with an AI
home advisor that becomes smarter every week.**

## 8. The 30-Second Rule ★ (checklist for every feature)

**Every interaction should satisfy at least one of these four goals:**

1. **Learn something new about the buyer.**
2. **Teach the buyer something valuable about the market.**
3. **Increase the buyer's confidence in a decision.**
4. **Strengthen the buyer's trust that the AI understands them.**

**If a feature doesn't accomplish at least one of these four, it probably
shouldn't exist.**

Every new feature (price-guess, community, map, AI chat, notifications, etc.)
gets asked *"which of the four does this satisfy?"* If the answer is unclear,
the feature adds complexity without value and should be cut.

This rule is load-bearing. It replaces a wide range of ad-hoc design debates
with a single test.

## 9. Non-goals (what we are refusing to build)

Ordered by load-bearing weight.

1. **No listing-only feed.** The feed is a conversation, not a scroll of
   properties. If more than ~40% of consecutive cards are listings, the feed
   is broken.
2. **No feature that fails the 30-Second Rule (§8).** Any feature that can't
   name which of the four goals it satisfies is cut.
3. **No fixed personality labels.** ("City Girl", "Investor Type", "Family
   Buyer".) All profile output is evidence-based, per §5.
4. **No swipe-count / streak / badge rewards.** We reward understanding,
   not activity. Per §6.
5. **No generic listing detail page.** Listing Detail is the guided
   experience (§4), not a spec sheet.
6. **No feature described as "AI training."** The user is never explicitly
   training the AI. The learning is quiet.
7. **No content presented without a WHY.** Every listing, community, insight
   card explains why it was surfaced to *this* buyer.
8. **No pickers / multi-select / bottom-sheet form UIs on the feed.**
   Preference input is always via card. (Anchors `discovery-feed.md` §9 #1.)
9. **No hard filters at swipe pace.** Scope is a ranking signal, not a
   filter. (Anchors `discovery-feed.md` §9 #3.)
10. **No "learning mode" vs "recommendation mode" toggle.** These are the
    same mode.

## 10. Downstream design docs

This vision governs the following feature-level docs. Each must trace back to
a §-numbered principle in this doc:

- `docs/design/discovery-feed.md` — the swipe feed itself (§2, §3.1–3.6)
- `docs/design/listing-explore.md` — Listing Detail Experience (§4)
- `docs/pipelines/README.md` + `pipelines/poi-content.md` — video content
  generation for listing / community cards (§3.2, §3.3)

When any of the above conflicts with this doc, this doc wins.
