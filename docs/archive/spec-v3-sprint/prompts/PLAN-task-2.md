# PLAN — task-2 Listing Explore (`phase-ios2/listing`)

Written 2026-07-27 by Hermes (owner: "task-1结束 开始做task-2"). Built by Hermes
directly, **not** delegated to a coding-agent CLI (owner call, same day).

## 0. Data reality — verified against the remote, not assumed

Read from the live Supabase (`listings` / `listing_photos` / `k12_schools`) on
2026-07-27. This is what decides which spec rows can render and which must be
ABSENT. No fabricated stat, not even as a placeholder (`_MASTER.md`).

| field | reality | task-2 consequence |
|---|---|---|
| `listings` | 265 rows, **260 active** | fine |
| `price` + `sqft` | **258** have both | **Price / sqft row is REAL**, incl. city median |
| `year_built` | 254 | usable |
| `hoa` | **10 of 265** (text, not numeric) | row renders only when present; never estimated |
| **days on market** | **NO COLUMN EXISTS** (no `list_date`, no `dom`) | **row cannot ship.** Spec §2.1 asks for it; it is ABSENT, not zero, not "—" with a fake median |
| `lat` / `lng` | **13 of 265** | no distance math for 95% of homes |
| `community_id` | **4 of 265** | subdivision anchoring unavailable → median computed per **city**, and the row is labelled with the city, not a subdivision |
| `k12_schools` | 15 rows total | school POI rows ABSENT for nearly every listing |
| listing-level POI table | **does not exist** (`listing_nearby` 404) | §2.1 POI ×2 rows ABSENT |
| `listing_photos` | 2588 (2388 from `fmls-import`) | media is fine |
| `listing_photos.ai_tags` | **199 tagged, on 10 listings — ZERO on any `fmls-import` photo** | **this is the blocker, see §1** |

**Consequence for the anchor:** spec says the distribution histogram is anchored
on the **subdivision** (Waterside). With 4 of 265 listings carrying a
`community_id`, subdivision anchoring is not available. Falling back to **city**
(Duluth n=50, Suwanee n=50, Sandy Springs n=50, Alpharetta n=52, Johns Creek
n=50) — and the row says which. It is a real median of a real cohort, just a
coarser one, and the label never claims otherwise.

## 1. The one real blocker: hotspots have no data source

§2.3–2.5 (tour stops, free-explore sections, action sheets) are all containers
for **hotspots**. A hotspot needs to know a photo is "the kitchen with the
island". That comes from `listing_photos.ai_tags` (`room_type`, `caption`,
`style_signals`) — which is populated for **10 listings, none of them the 104
`fmls-import` listings that are actually in the feed**.

The tagger exists (`scripts/render-worker/photo_tagger.py`) but reads
`ANTHROPIC_API_KEY`, which is **banned on this host** (CLAUDE.md §2.1 rule 0) and
therefore currently broken. CLAUDE.md already lists porting it to Bedrock as
outstanding work.

**Decision (not deferring the scope):** port the tagger to Bedrock inside this
phase and backfill the fmls listings. That is the unblock for §2.3–2.5, so it is
part of task-2, not a follow-up. Sequenced last (§5) because the pure layer and
the data face don't depend on it.

## 2. Component tree

New, under `apps/mobile/`:

```
app/listing/[id].tsx            route; owns ?focus= deep link + tour/free mode
components/listing/
  ListingDataFace.tsx           §2.1 — replaces DataFaceStub at the call site
  MonthlyRow.tsx                §2.1 #4 + the explore calculator body
  PriceHistogram.tsx            §2.1 #5 — 7 buckets, <5 samples → one line
  TourStop.tsx                  §2.3 — progress, 220pt media, WHY, actions
  TransitionCard.tsx            §2.4 #5
  FreeExplore.tsx               §2.4 — hero, pins, chip nav, sections, CTA
  SectionNav.tsx                §2.4 #2 — scroll-to, not tabs
  HotspotSheet.tsx              §2.5 — composes the task-0 BottomSheet
lib/listing/
  focus-key.ts                  parse/serialise price|market|hoa|monthly|comps|poi:*|school:*
  monthly.ts                    pure amortisation
  histogram.ts                  pure bucketing + degradation
  hotspot.ts                    ai_tags → Hotspot; Stop.evidence non-empty at the TYPE level
  tour.ts                       stop ordering, 3-stop empty-profile fallback
```

Reused, never rebuilt: `BottomSheet`, `CardVideo`, `CardSurface`, `MatchBadge`,
`haptics`, `tokens`, `typography`, `state/funnel`, `state/event-queue`.

## 3. Server

`apps/web/app/api/mobile/listing/[id]/route.ts` → the detail DTO: listing row,
ordered photos with tags, city median cohort, hotspots. Absent fields are
**omitted keys**, never nulls-rendered-as-dashes.

## 4. Tests (pure only; this box has no iOS simulator)

- `monthly.test.ts` — 20% down default, rate 0, boundary at term end.
- `histogram.test.ts` — exactly 7 buckets; n=4 degrades, n=5 does not; subject
  bucket index correct at both edges of the range.
- `focus-key.test.ts` — round-trip for every key incl. `poi:<id>`; unknown key
  rejected rather than silently ignored.
- `hotspot.test.ts` — a stop with empty evidence fails to construct (type + a
  runtime guard, per canon iron law); <3 actions → hotspot not emitted (§2.5).
- `tour.test.ts` — 3–5 stops, empty profile yields the generic 3, no stop
  without evidence ever appears.

## 5. Sequencing

1. Pure layer + tests (`lib/listing/*`).
2. Server detail endpoint.
3. `ListingDataFace` + replace `DataFaceStub` at the feed call site; wire
   `Explore →` and the challenge card's `THE HOME BEHIND THIS` sheet into a real
   `router.push` (inherited open item #1).
4. Free explore + section nav + hotspot sheet.
5. Guided tour + transition card.
6. Port `photo_tagger.py` to Bedrock; backfill fmls listings; hotspots go live.

`PENDING-SIM` (owner's phone only): 350ms crossfade feel, 2s focus highlight,
pin pulse vs. static, sheet detent behaviour, sticky bar over momentum scroll.
