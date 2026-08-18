# Percho · Vision Doc

> This is the product vision. If you are here to work on the code, start with
> [`ARCHITECTURE.md`](ARCHITECTURE.md) — what every folder is for — and then
> [`CLAUDE.md`](CLAUDE.md) for the working rules.

> **Live there before you move there.**

---

## 1. Vision

Percho is a video-first, immersive platform for experiencing places to live.

We believe that where you live is one of the most consequential decisions of your life — it shapes your commute, your neighbors, your kids' schools, what your weekends look like, and ultimately who you become. Yet the way people make this decision is stuck in a previous era: scrolling listing databases, squinting at floor plans and staged photos, flying in for a rushed weekend of showings — then betting years of their life on a gut feeling.

Percho changes this. Through video, we let people experience what it actually feels like to live in different countries, regions, cities, and neighborhoods — the morning light on a street, the park at dusk, the Saturday farmers market, the commute — all without leaving their couch. As they explore, we continuously learn their preferences and help them narrow down, step by step, to the neighborhood and the home where they want to live long-term or try short-term.

In one line: **from browsing listings to experiencing life; from searching to being understood.**

The name comes from "perch": before a bird settles, it flies over many places, lands somewhere high to see the whole landscape, and only then chooses where to nest. Percho wants to be that vantage point — and those wings — for everyone searching for their place in the world.

---

## 2. The Problem

**1. People buy a way of life; platforms sell listings.**
Zillow, Redfin, and Airbnb all treat the "listing" as the atomic unit of information. But nobody is really buying four walls — they're buying the feel of a street, the character of a community, a particular shape of weekend. The granularity of today's products is mismatched with the granularity of the actual decision.

**2. The information that matters most is exactly what listings leave out.**
Listing photos show you the kitchen. They don't tell you what the street feels like at night, who your neighbors would be, or how far you'd live from the things you care about. Today, that information can only be gathered by physically walking the area — which is effectively impossible for cross-country and cross-border movers.

**3. Search-based interfaces assume you already know what you want.**
Most people don't. They have vague feelings — "somewhere quieter," "a place with real street life," "near the water." Filters and forms cannot capture these preferences; they need to be observed and inferred, not typed into a box.

**4. The cost of getting it wrong is measured in years.**
Relocating to the wrong city or buying into the wrong neighborhood means a correction cycle of one to five years and six figures in transaction costs. Few consumer decisions carry higher error costs — and few are served by more primitive decision tools.

---

## 3. Why Now

- **Video is now the default way people consume information.** TikTok trained an entire generation to understand the world through full-screen vertical video. The "immersive short video + interest-based recommendation" paradigm is fully proven — it just hasn't been seriously applied to the decision of where to live.
- **AI makes "a video for every home and every neighborhood" economically viable for the first time.** MLS ingestion → AI video generation → automated distribution can run as a fully automated pipeline, collapsing content cost from hundreds of dollars per human-shot video to near-zero marginal cost.
- **Recommendation systems are mature.** Preferences can be learned and inferred from natural behavior — swipes, dwell time, saves — with no questionnaires.
- **Remote work has decoupled where you live from where you work.** "Where to live" has shifted from a passive outcome to an active choice, creating entirely new decision journeys: relocation, digital nomadism, "rent first, then decide to stay."
- **A structural window post-NAR settlement.** With buyer-agent commission structures loosening, buyers now have a self-directed exploration phase before committing to an agent — exactly where a buyer-side platform can enter.

---

## 4. What We're Building

### Core experience
An immersive discovery feed built on full-screen vertical video — **but for places to live**. When people open Percho, they aren't "house hunting"; they're wandering the world. As they wander, the system figures out where they belong.

We deliberately do not lock down the exact interaction form at the vision level — it will keep evolving with what we learn. The direction we're currently exploring is a **swipe-card model**: the feed is not a single content stream but a conversation, composed of several card types mixed together —

- **Content cards (Listing / Community):** carry the immersive video. Swipe right to like, left to pass, long-press to peek, tap to open Explore.
- **Learning cards (Preference / Trade-off / Insight):** use the same swipe gesture to ask, lightly. Binary preference cards reveal taste; trade-off cards force a choice between two competing dimensions, revealing priorities; Insight cards surface the AI's read on the user, who can agree or push back — and pushback is itself high-value signal.
- **Engagement cards (Challenge):** guess-the-price and market trivia that make wandering playful while quietly doing market education.

The form can change; two invariants cannot: **the experience must be immersive** (video is the best medium for understanding a place through a screen), and **the learning must be frictionless** (every preference signal comes from the same natural gesture and never interrupts the experience).

### Three content layers (validated in prototypes)
| Layer | Content | Question it answers |
|---|---|---|
| **Home** | The home itself | What space would I live in? |
| **Street** | The street and immediate surroundings | What do I see when I step outside? |
| **Community** | Neighborhood, schools, commerce, people | What life would I live, and who are my neighbors? |

Users can move seamlessly between the three layers on the same property — like a camera pulling in and out — to understand a *place*, not just a house.

### The four-level geographic funnel
**Country → City → Neighborhood → Home.**
Users can enter at any level (some start with "I want to move to Portugal," others with "this house is gorgeous"). The system learns from behavioral signals and narrows level by level, converging on a specific area to live in and specific homes within it.

### Preference Engine
Preference signal arrives through two channels — both inside the same swipe gesture:

- **Passive signal:** dwell, re-watch, save, skip — you keep lingering on tree-lined streets, you skip every high-rise, you rewatch that one neighborhood at dusk;
- **Active signal:** the learning cards' lightweight questions — binary choices reveal taste; trade-offs reveal priorities (schools vs. commute — which side did you pick?); disagreement with an Insight card tells the engine which inference was wrong and which evidence to demote.

These signals accumulate into a preference profile that drives feed ranking and, ultimately, the match list. **Ask — but only at the cost of a single swipe. Learn — but never send a questionnaire.**

### Explore: where "I love this" becomes "let's act"
Every video is anchored to structured data and real supply: maps, school data, price history, neighborhood stats — and a direct next step: book a showing, book a short-term stay. Video handles the *feeling*; Explore handles the *decision*.

### Supply side: automation is the foundation
- **Volume layer:** MLS (FMLS / Georgia MLS via RESO Web API) → automated Ken Burns generation (ffmpeg), covering the full inventory
- **Premium layer:** AI motion (Kling / Runway) for featured listings and flagship neighborhood content
- **Texture layer:** UGC/PGC from local creators and residents — the lived-in authenticity machines can't generate

---

## 5. Users & Scenarios

1. **Cross-city / cross-border relocating buyers** — the core monetizable scenario: highest transaction value, deepest information hunger
2. **Local families who want a new neighborhood more than a new house** — "I know I'm moving; I don't know where to"
3. **Digital nomads and remote workers** choosing their next base — a natural short-term-rental entry point
4. **Progressive deciders** — rent in a neighborhood for a few months, then decide whether to stay; Percho is the only product that connects those two journeys into one
5. **Armchair explorers** — people with no move planned who simply love wandering other lives; they fuel the content flywheel and form the future conversion pool

---

## 6. Differentiation & Moat

**vs. Zillow / Redfin:** They are listing databases; we are a life-experience engine. They start from a search box; we start from a feeling. They serve users who already know what they want; we serve the upstream of the decision, where minds haven't been made up yet.

**vs. Airbnb:** They answer "where do I stay on this trip"; we answer "should I live here." On Percho, a short-term stay isn't the destination — it's the trial phase of a long-term decision.

**vs. city vlogs on YouTube / TikTok:** Unstructured, unsearchable, unactionable. Every Percho video is bound to real supply and structured data — you can go straight from watching to deciding.

**Where the moat comes from (in the order it gets built):**
1. A **cost-structure advantage** in content production (fully automated pipeline vs. human videography)
2. A **content asset library at the level of places, not just listings** — street and neighborhood content doesn't expire when a listing sells; it compounds as a reusable long-term asset
3. **Preference data** accumulated from behavior — knowing *what kind of person falls in love with what kind of neighborhood* is a data dimension no listing database possesses

---

## 7. Roadmap

**Phase 1 — Close the loop (Now · Atlanta)**
Enter through the Atlanta home-buying scenario (high inventory, slow turnover, buyer-friendly): launch the automated MLS-to-video pipeline plus the three-layer feed, and validate the core hypothesis — that the **immersive video → preference learning → showing conversion** loop actually closes.

**Phase 2 — Sun Belt expansion + short-term rentals**
Replicate to Orlando / Tampa / Jacksonville (shared Stellar MLS, minimal marginal cost); onboard short-term rental supply to complete the "try it before you buy it" journey and open a second revenue line.

**Phase 3 — Fast-market v2 + the global living map**
Ship a distinct product logic for Seattle-type fast markets (low inventory, speed-driven): neighborhood channels, speed-to-publish, demand-side monetization. In parallel, expand cross-border content (the digital-nomad corridor: Lisbon, Chiang Mai, Mexico City…) — evolving from a U.S. home-buying tool into a **global map of living experiences**, the full form of the vision.

---

## 8. Business Model (directional)

- **Buyer-side transaction services:** referral and transaction fees on high-intent buyers (a direct beneficiary of the post-NAR window)
- **Short-term rental booking commissions:** natural monetization of the "trial stay" phase
- **Supply-side SaaS:** AI video generation and distribution tools for agents, developers, and STR operators
- **Long-term:** high-intent monetization built on preference data — mortgage, moving, insurance, and the rest of the residential decision chain

Principle: monetization always happens at **natural nodes in the user's decision journey** — never through experience-breaking ads.

---

## 9. North Star & Key Metrics

**North Star: decisions made** — the number of complete journeys from "first swiped past this neighborhood" to "booked a showing / booked a trial stay / signed."

**Process metrics:**
- Immersion time and return frequency (is the experience working?)
- Preference-confidence velocity (is the engine getting smarter?)
- Funnel progression rate: country → city → neighborhood → home (is narrowing actually happening?)
- Feed → Explore conversion (does the bridge from feeling to decision hold?)
- Showings booked / trial stays booked (does the business loop close?)

---

## 10. Product Principles

1. **Experience over listings** — we sell the feeling of living there; the listing is just the vehicle
2. **Learn through swipes, never through forms** — every swipe is preference signal; we may ask lightly, but we never interrupt the experience or hand the user a form
3. **Automate the supply** — content production must be fully automated; human effort goes only where machines can't
4. **Every video is actionable** — every video must be anchored to real supply and data; no watch-only content
5. **Start narrow, think global** — begin with one funnel in Atlanta, build toward the global map of living experiences

---

*Percho — find your perch.*
