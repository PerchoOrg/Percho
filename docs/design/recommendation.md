# Recommendation — Design

> Status: **Proposed, 2026-11-28 (phase421). Nothing here is built.** The owner
> approved the direction ("这个方向可以") and asked for the whole system
> designed; five decisions in §11 are still his. The owner-facing version, in
> Chinese with a playable simulator, is `/demos/recommendation-v1`
> (`apps/web/public/demos/recommendation-v1/index.html`) — the simulator's
> script is a working sketch of §4–§6 over the 28 live films.
>
> Implements `preference-learning.md` §1 (the loop) and §3.4 (trade-offs), and
> `discovery-feed.md` §1.3 (scope ranks, never filters) and §1.8 (asking is the
> cold-start half of the recommender). Where those describe a product that has
> since changed — a swipe is no longer a verdict (phase414), the build has no
> listings (phase308) — this doc follows the product.

## 0. The problem

Owner, 2026-11-28: 「如果有10000个视频 用户最感兴趣的是第10000个怎么办 永远刷不到」.

It is a real hole, and it has already bitten once. Today:

- `/api/mobile/feed` pages a fixed order (`offset`/`limit`, films first, then
  by name). The route's own comment records the August case: the one filmed
  community sat ~280th alphabetically and never reached the phone.
- Ranking happens on the phone (`generateFeed`, `rerankTail`), over the cards
  it has already downloaded. It cannot rank what it was never sent.
- A like moves its city's tally and nothing else. Dwell scales that tally
  (`swipeWeight`, 0.5–2×) but a film watched to the end with no tap says
  nothing. Opening Explore, `Communities ›`, Map, a figure, or sharing says
  nothing.
- Trade-off cards are out of the communities-only mix (`COMMUNITY_ONLY_MIX`,
  `CITY_FILM_MIX`).

With 28 films none of this shows. With a listing feed it decides the product.

## 1. What it optimises

Not time in feed. A buyer is here to find where to live, so the measure is how
few cards it takes to reach three or four places that fit — likes, saves and
compares per card, not minutes.

Three rules carried over unchanged:

1. **Reorder, never remove.** An inferred preference moves a card up or down.
   Only the buyer's own thumbs-down removes one.
2. **No training chores.** No form, no progress meter, no unlocks.
3. **Every card can say why.** The score is a sum of named parts.

## 2. Items

Three levels — city, community, home — and a preference flows down them: a
liked city lifts its communities, a liked community lifts its homes. This is
what makes a large catalogue tractable: three likes score every home.

Each film has a feature row, all from stored facts — no model looks at the
film:

| Feature | Source | Today |
|---|---|---|
| city, county, lat/lng | `communities`, city geo units | yes |
| price | the card's own figure (`glance.cells`) | yes |
| school grade, highway minutes | the card's own figures | yes |
| safety / potential facts | `communities.profile` | yes |
| place tags: walkable, quiet, trails-and-water, dining, new-build, club | `dims`, `signals`, the price cell's label | 14 of 20 filmed communities; 6 have none |
| home: price, beds, sqft, year, lot | FMLS fields | with listings |
| film: completion rate, like rate | `mobile_events` | logged; too few users to use |

The `family` dim and every word about who lives somewhere stay out (§9).

## 3. Signals

A signal has a weight `w`. It updates the buyer's profile: a per-city tally, a
price centre (weighted mean of log price over positive signals), per-tag
tallies, and the level links (liked city → its communities, liked community →
its homes).

| Signal | `w` | Today |
|---|---|---|
| **Stated** — "What matters to you" (five, 0–3 each) | sets the weights inside the `stated` part of the score | orders Compare rows only |
| **Stated** — a question card answered | +2 chosen side, −1 the other | off in this build |
| Heart | +3 | city tally only |
| Share, add to Compare | +2 | nothing |
| Open Explore / `Communities ›` / Map / tap a figure | +1.5; a tapped figure also names its topic | nothing |
| Thumbs-down | −3, and hidden for good | hides the one card |
| Watched ≥ 75 % of the film, or replayed | +1 | nothing |
| City film: jumped to a chapter | +0.5 to that topic | nothing |
| Left within 2 s | −0.5 | nothing |
| Ordinary swipe past | 0 — 「滑走不一定不喜欢」 | same |

Rules:

- **Negatives count half** on everything except the card itself. One
  thumbs-down must not sink a city; two cancel one like.
- **Watch time is a fraction of the film's length**, never seconds — a city
  film runs two minutes, a community film forty seconds.
- **Signals fade.** Half-life 60 days; the current session counts double.
- **Every tally is capped** (±3, as `GEO_CAP` is today).

## 4. Score

Per buyer, per film, 0–100. Starting weights, to be tuned from the log:

| Part | Max | Meaning |
|---|---|---|
| place | 28 | the city's tally; a city within 9 mi of a liked one gets 40 % of its lift |
| price | 22 | within 15 % of the price centre → full; falls off to negative past ~2× away; scaled by evidence; not applied to city films (a city's median is a different measure) |
| stated | 13 | the five stated priorities against the film's own figures |
| tags | 12 | shared place tags |
| answers | 10 | matches the chosen side of answered questions |
| level | 10 | a community of a liked city; a home of a liked community |
| film | 5 | new, or finished by most who start it |
| co-like (later) | up to 15 | "liked by people who liked yours" — §8 phase C |

A hand-written additive table, not a trained model: there is no data to train
on, and the FMLS agreement (§3.7 in the signed text) forbids using Licensed
Data with any AI technology. A sum of stored fields is arithmetic. Replacing it
with a learned ranker over listing fields needs FMLS's written word first.
Behavioural data (`mobile_events`) is Percho's own.

## 5. Composing a batch

- **12 per request**, the next requested with 5 left (`FIRST_PAGE_SIZE`,
  `PREFETCH_DISTANCE` — unchanged).
- **The 2 cards after the one in front are fixed** — their films are loading.
- **From the 3rd on, every signal re-ranks.** The effect of a like must be
  visible within two or three cards, not at the next batch.
- **7 fit + 3 near + 2 explore.** *Fit*: highest score. *Near*: good on price
  and tags, in a city with no evidence yet. *Explore*: the least-shown
  (city × price band) cells, in turn — this is the slot that reaches a film the
  buyer could not have asked for. **6 + 3 + 3** until the profile has about two
  likes' worth of evidence.
- **Diversity.** At most 2 in a row and 5 per batch from one city, and each
  further card from a city counts 15 % less, so two liked cities both show.
- **At most one question card per batch** (§6).
- **No repeats.** A card seen without a reaction may return once after 14
  days; a liked one lives in Saved; a hidden one never returns.
- **An end.** When nothing unseen is left, say so and point at Search, instead
  of looping.
- **The follow rule**, removed in phase404.7 until designed, is this: a like
  does not switch the feed to that place. Its next level gains `level` and
  `place`, so the next batch carries four or five of its communities instead
  of one or two — under the diversity rule above.

**Cold start**: no onboarding form. The first hand is the 12 films furthest
apart on (place, price, kind), so each reaction rules out the most. The 4th
card is the first question.

## 6. Question cards

The Two Doors card, its gesture, its six authoring rules (`content.ts`) and its
record of a choice as a fact (`TradeoffAnswer`) are reused as they are.

Of the bank's 32 questions, 7 are about a place and usable now —
`to-quiet-vs-walkable`, `to-closer-vs-more`, `to-trees-vs-new-streets`,
`to-culdesac-vs-sidewalks`, `to-hoa`, `to-topofbudget-vs-room`,
`to-transit-vs-quiet`. The other 25 are about the inside of a house and wait
for listings: asked now they would reorder nothing (rule 3).

Needed:

- **Five new place questions the data can decide** — budget (adaptive: split
  the remaining pool at its median, then again inside the chosen half),
  highway minutes, new-build vs established, club vs none, trails-and-water vs
  restaurants. Draft wording is on the demo page; **the owner reviews the copy
  before it is committed** (CLAUDE.md §6).
- **Door photos from Percho's own films** — they were listing photos.
- **A slot in the communities-only mix.**

No schools question, now or later: rule 6 of the bank stands. School grade
enters the score only through the buyer's own stated priority.

When to ask: about 1 card in 9 after the first; the question whose two sides
split the remaining candidates most evenly; never one the profile has already
answered from likes; at most one a day once three are answered or five places
are liked; none when no question would change the order.

With 28 films a question reorders little. It is built now so the card, the
record and the ranking are joined before listings arrive.

## 7. Where it runs

Two layers.

- **Server picks the 12 from everything.** A ranking request carries a compact
  profile (tallies, price centre, stated weights, answers, seen and hidden
  ids) and returns cards. Stateless: no per-buyer table, and it works signed
  out. The response is per-buyer, so it leaves the CDN cache the pool response
  uses today; card bodies can stay cacheable by id if that cost shows.
- **Phone re-ranks the 12 at once**, as `rerankTail` already does, with the
  same scoring function — it lives in `packages/shared` so both sides agree.

Ranking on the server also means the table can be tuned without an App Store
release.

At listing scale the server scores a few hundred candidates per request, not
the catalogue: a coarse pass (place and price, indexed) takes the head, plus
the explore cells. The coarse pass is a ranking cut, not a filter — explore
slots draw from outside it.

## 8. Phases

| Phase | Work | Visible to the owner | When |
|---|---|---|---|
| A | The missing signals; the score table; 7 + 3 + 2; place questions back in the mix; in a dev bundle, long-press a card for its score and parts | A like shows in the next two or three cards; an occasional question; small, because 28 films | Now — needs no listings, no migration |
| B | Server ranking over the whole catalogue; an item-feature table; the end-of-pool card | Nothing — this is the road for 10,000 | Before listings go live |
| C | Co-like across places (`/api/mobile/similar` does it for listings today); film completion in the score; tune the table from the log | Places liked by buyers with similar likes | ~1,000 buyers with ≥ 5 likes each. Earlier it is noise |

No new service and no new spend in any phase.

**Is it working?** Too few users for an A/B test. Watch likes per 20 cards,
the share of cards left within 2 s, and cards until the first like. The score
is pure, so the event log can be replayed: were the liked cards ranked above
the skipped ones at the time they were shown? And the dev-bundle score sheet
lets the owner judge on his phone.

## 9. What it will not do

1. **Use or infer who lives somewhere, or who the buyer is.** The Fair Housing
   Act bars steering by protected class. No resident-describing feature; the
   `family` dim is excluded. **App language and device locale never enter
   ranking** — the audience is multilingual and this is where steering would
   creep in. School grade ranks only when the buyer states it. Co-like can
   carry a crowd's habits, so it is capped at 15 and the explore slots keep the
   whole range in front of everyone. This is an engineering reading of the
   repo's existing rules, not legal advice; a fair-housing lawyer should read
   this section before listings launch.
2. **Run FMLS data through AI** (§4).
3. **Let payment change a score.** The owner's own study: 8 of 10 buyers named
   commercial bias as what would stop them trusting such a tool. Proposed:
   agent films and Community Partner places score like any other; a paid
   placement, if ever wanted, is its own labelled slot outside the 12. Owner's
   call — §11.
4. Reward swiping; add a paid service; add a line of text to the card (the
   "why" lives on the You tab).

## 10. Relation to the code

| Today | Becomes |
|---|---|
| `apps/mobile/lib/feed/signals.ts` `applySwipe` | takes every signal in §3, not only a verdict |
| `generate-feed.ts` `rankCommunities` / `rankListings` | one shared score (§4) |
| `ratios.ts` mix tables | slot kinds fit / near / explore / ask (§5) |
| `content.ts` `TRADEOFFS` | + place questions with matchers on place features |
| `/api/mobile/feed` `offset`/`limit` | a ranked request (§7), phase B |
| `/api/mobile/similar` | extended to places, phase C |

## 11. Open — the owner's

1. Question cards: the old card, the 7 old place questions and the 5 new ones
   — and the new copy.
2. After a liked city: four or five of its communities in the next batch, not
   a switch.
3. School grade ranks only when the buyer states it.
4. Paid content earns no score.
5. Start phase A.
