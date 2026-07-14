# Reel Formats: Neighborhood-focused vs Listing-focused

**Scope**: quantitative comparison of the two reel structures produced so far
(PTC / Decatur = neighborhood; listing-reel-v1 = listing), grounded in the
three composition plans under `poc-output/`. Ends with a decision matrix for
which format to auto-compose per funnel stage.

**Sources**:
- `poc-output/composition_plan.json` (Peachtree Corners, 14 clips, 61.0s → 60s cut)
- `poc-output/decatur/composition_plan.json` (Decatur, 14 clips, 61.0s → 60s cut)
- `poc-output/listing_composition_plan.json` (3 listings, 19 clips, 57.0s)

**Memory alignment (checked, not code-changing)**:
- GA-only: all three reels 100% GA subjects (PTC = Gwinnett, Decatur = DeKalb,
  Alpharetta = Fulton). No cross-state material.
- Selling-only: every CTA slot is "See homes → percho.com/*". No rent, no
  agent-brand promo, no lifestyle-only ending.
- No bilingual captions at schema layer: all `caption` fields are English-only
  strings. Multilingual variants belong in a future `caption_by_locale` in the
  marketing/publish layer (per schema.sql §note and interfaces §5), not in the
  Composer plan.

---

## 0. TL;DR

| Dimension                | Neighborhood reel        | Listing reel                    |
| ------------------------ | ------------------------ | ------------------------------- |
| Duration                 | 60 s (target)            | 57 s                            |
| Total clips              | 14                       | 19                              |
| Avg shot duration        | **4.36 s**               | **3.00 s**                      |
| Distinct subjects        | 7 slot types, ~7 places  | 3 listings + 2 broll transitions |
| Longest sustained run    | 15 s (list1, 3 clips)    | 15 s per listing (5 clips)      |
| Caption register         | Vibe / mood phrases      | Hard numbers (price/bd/ba)      |
| Hook framing             | Identity ("Decatur, GA") | Offer ("3 GA homes · Just listed") |
| CTA scope                | Neighborhood-scoped URL  | Top-level `percho.com`          |
| Content dependency       | Auto-fetched only        | **Requires agent photo upload** |
| Funnel stage             | Top (discovery)          | Mid (comparison / shortlist)    |
| Cost per reel (from cost-model §1) | ~$0.038 | ~$0.038 (photos free, no LLM re-tag) |

**Recommendation**: keep both formats first-class. Auto-compose the
neighborhood reel from public sources for every GA neighborhood we cover
(unlocks organic SEO + top-of-funnel), then let agents "graduate" a
listing-focused reel per active MLS pin using their photos + our B-roll pool.
This mirrors the two-tier Composer contract already sketched in
`interfaces.md` §5 (CompositionPlan.slot enum can absorb `listing` alongside
`hook/vibe/list1/list2/park/school/cta/broll`).

---

## 1. Rhythm — cuts per second

Compute from the three plans directly:

| Reel                | Clips | Seconds | Avg s/clip | Cuts/10s |
| ------------------- | ----- | ------- | ---------- | -------- |
| PTC v1              | 14    | 61.0    | 4.36       | 2.30     |
| Decatur v1          | 14    | 61.0    | 4.36       | 2.30     |
| listing-reel v1     | 19    | 57.0    | **3.00**   | **3.33** |

Listing reel is **~45% faster** in cut cadence. Two forces:
1. Photos are static — a 5 s hold on a still exterior reads as *slow* in a
   9:16 feed context, while a 5 s hold on an aerial gateway still reads as
   *establishing*. Photo pace has to compensate.
2. Room-tour sequences carry their own momentum (viewer expects the next room
   in ~2-3 s). Slowing down there feels like buffering.

**Constraint discovered**: the 2 s `broll` transitions in the listing reel are
already at ffmpeg's floor for readable `drawtext` overlays at 52 pt on a 1080×1920
frame (measured in E2 shim). Any faster and captions truncate. So the listing
format is close to its lower bound on shot length.

## 2. Structure — the "acts"

**Neighborhood reel** is a **7-slot vignette**, cross-cutting between
subjects:

```
hook(3s) → vibe×3(12s) → list1×3(15s) → list2×2(10s) → park×2(8s) → school×2(8s) → cta(5s)
   1           3              3               2            2             2         1
```

No slot appears more than once contiguously beyond `list1`. Viewer never sees
the same building twice in a row. The reel *paints an area*.

**Listing reel** is a **3-listing episodic**, one mini-tour per property:

```
hook(3s)
├─ Listing A: 5 photos × 3s = 15s   (exterior → kitchen → living → bedroom → backyard)
├─ broll(2s)                        (transition, borrowed from PTC pool)
├─ Listing B: 5 × 3s = 15s
├─ broll(2s)
├─ Listing C: 5 × 3s = 15s
└─ cta(5s)
```

Each listing is a **self-contained 15 s unit**. Viewer's attention is *held on
one subject* longer than any single moment in the neighborhood reel, then
released via a 2 s neighborhood B-roll ("palette cleanser") before the next
listing.

This maps cleanly to a new `Composer` slot enum value `listing`
(fs=52, y=h-280) sitting **between** `hook` (fs=78, top) and `broll` (fs=44,
bottom), which is already what E2's shim ships. Formalizing that enum in
`interfaces.ts` is a ~4-line change and does not require re-designing the
plan-jsonb shape in `schema.sql`.

## 3. Caption register — where the value lives

Sampled from the plans:

| Reel            | Sample captions                                                        |
| --------------- | ---------------------------------------------------------------------- |
| PTC             | "Peachtree Corners" / "Where Atlanta lives quietly" / "The Forum · walkable retail" |
| Decatur         | "Decatur, GA" / "Walkable downtown, real neighbors" / "MARTA-connected · Atlanta in 20 min" |
| Listing         | "Alpharetta · $875K · 4bd/3.5ba" / "Fulton County" / "See homes → percho.com" |

Neighborhood captions are **mood + amenity** phrases. They come from the
`caption_pool` in the Composer (per slot type) and don't need the underlying
`content_item` to carry data. This is why the Wikimedia pipeline works with
zero metadata beyond the source URL.

Listing captions are **structured facts** — price, beds, baths, town. They
must be assembled from the `listings` mock JSON (mock-listings/listings.json),
which means the listing-reel Composer needs a `ListingBrief` input joined to
each `listing`-slot clip. That's a new contract:

```ts
// interfaces.ts addendum (draft, not yet in interfaces.md §5)
interface ListingSlotContext {
  address_town: string;    // "Alpharetta"
  price_usd: number;       // 875000  → format as $875K
  beds: number;
  baths: number;           // half-baths in .5 increments
}
```

The Ranker signals "this is a listing reel, wire ListingSlotContext for each
listing-photo run" via a new `RankingPlan.mode: 'neighborhood' | 'listing'`
discriminator. Both modes still fit in one CompositionPlan schema.

## 4. Hook framing — identity vs offer

Both reels use the same first frame (Gateway to Peachtree Corners still), but
the caption is doing very different jobs:

- **Neighborhood hook** — "Peachtree Corners" / "Decatur, GA". Names the
  place. The frame *is* the pitch: come see where.
- **Listing hook** — "3 GA homes · Just listed". Announces an offer count.
  The frame is decorative; the caption is the pitch.

Practical implication: the listing reel *does not need* an aerial hero shot,
because the hook's job is offloaded to text. A stock skyline or even a solid
color card would work. That relaxes the fetch requirement for the listing
Composer (no aerial → no dependency on Wikimedia's spotty aerial coverage).

## 5. Content dependency — what the agent must provide

|                       | Neighborhood reel                       | Listing reel                                        |
| --------------------- | --------------------------------------- | --------------------------------------------------- |
| Agent uploads         | **Nothing**                             | 5 photos per listing (exterior + 3 interior + backyard) |
| Public-source clips   | 14 (all)                                | 4 (hook + 2 broll + cta) — borrowed from nbhd pool |
| Tag pass required     | Yes (L1 + L2 on all 14)                 | Only on the 4 borrowed clips (photos are pre-labelled by role) |
| LLM tag tokens (Sonnet 4.5) | ~6.6k in / ~1.1k out (cost-model §1.2) | ~1.9k in / ~0.3k out (~28% of nbhd)                 |
| Content-item rows     | 14 new (or reused across reels)         | 15 mock listing photos + 4 borrowed refs = 19       |

Two structural consequences:

1. **Listing reel is cheaper at scale** if the neighborhood B-roll pool is
   already tagged and cached (which is exactly what the `neighborhoods` table
   in `schema.sql` §2 makes possible: query `content_items` where
   `neighborhood_id = X and layer1 in (...)` and reuse without re-tagging).
   Cost-model §1.2 shows the tagger step dominates ($0.036 of $0.038); cutting
   it by 72% is meaningful at N=1000+.
2. **Listing reel gates on the agent upload flow**. Zero listing reels can be
   auto-produced without photo intake. This is the raison d'être of the E4
   deliverable (`agent-upload-flow.md`).

## 6. CTA scope

- Neighborhood: `percho.com/ptc`, `percho.com/decatur` — deep-link to the
  neighborhood landing page (which per v2 prototype is a browsable listing
  grid filtered to that area).
- Listing: `percho.com` — top-level. There is no natural single-URL fallback
  for "these 3 unrelated listings across 3 metros", so the CTA has to be
  either (a) a saved-search link, (b) a lead-capture form, or (c) the
  homepage. E2 chose (c).

Follow-up decision (open, tag to F3): the listing-reel CTA should probably
route to a **per-agent shortlist URL** (`percho.com/a/<agent-slug>/reel/<id>`)
once the publish layer exists (interfaces §6, publishes table §2 of
schema.sql). That way the reel is a self-contained lead magnet with a unique
UTM-able landing, not a homepage bounce.

## 7. When to auto-compose which

Decision matrix based on the above:

| Trigger                                           | Format         | Rationale                                     |
| ------------------------------------------------- | -------------- | --------------------------------------------- |
| New neighborhood added to `neighborhoods` table   | Neighborhood   | No agent input required; SEO / discovery seed |
| Agent uploads ≥5 photos for a single listing      | Listing (solo) | 30 s mini-tour of that one listing            |
| Agent has 2-4 fresh listings within 7 days        | Listing (multi) | Current format — 15 s each, up to 3          |
| Weekend open-house window                         | Listing (multi) | High intent-to-tour, dated CTA                |
| Neighborhood market update (median price, DOM)    | Neighborhood + data card overlay | Reuse cached broll, swap CTA to /reports/<slug> |
| Buyer saved-search hit (matches 1 new listing)    | Listing (solo) via email + inline reel | Publish target = email, not social |

Corollary: the **solo-listing** variant (single listing, ~30 s, 5 photos × 5-6 s
runs + hook + cta) is *not yet produced*. It's the missing middle between the
current formats and is the natural E2.5 follow-up before E4.

## 8. Three concrete improvements from the comparison

Each with a landing point (which doc/file should absorb the change):

1. **Add `caption_by_context` to CompositionPlan** — the same hook still can
   caption as "Decatur, GA" or "3 GA homes · Just listed" depending on
   `RankingPlan.mode`. Move caption composition out of the plan's static
   `caption` field and into a small resolver that takes `(slot, mode,
   context)`. Landing: `interfaces.md` §5 CompositionPlan extension.

2. **Rate-limit contiguous same-subject runs** — the listing reel's 5 consecutive
   photos of one house work because the *subject* changes (rooms), but the
   Ranker doesn't know that. Codify: in `listing` mode, allow up to 5
   consecutive clips **if `content_items.parent_listing_id` is identical**.
   Otherwise cap at 3 (current neighborhood behavior). Landing:
   `interfaces.md` §4 Ranker contract, add a `RankingRules` field.

3. **Neighborhood B-roll cache as a first-class asset pool** — the listing
   reel already borrows 4 clips from the PTC pool without any explicit
   dependency; make this a documented pattern with a `content_items.role =
   'broll_transition'` flag and a query helper. Landing:
   `schema.sql` (add role enum value) + `architecture-v2.md` §5 (the pool is
   the single biggest asset the auto-compose pipeline has; formalize it).

## 9. Open questions (surface to F3)

- **Q1**: is 57 s (listing) worse than 60 s (neighborhood) for platform
  algorithm reach? IG Reels caps at 90 s; TikTok favors 21-34 s or 60+ s. If
  60 s is the sweet spot everywhere, pad the listing reel's CTA to 8 s or add
  a second broll transition.
- **Q2**: should the listing reel end on a listing image (last property's
  backyard) instead of a borrowed neighborhood shot? Argument for: viewer's
  last-frame retention is the closer they're most likely to remember.
  Argument against: mixes brand+CTA with property, dilutes the callout.
- **Q3**: bilingual overlay burn-in vs platform captions — currently we burn
  English into the video. A Spanish/Chinese buyer sees English text over the
  visuals with a platform-generated auto-caption. The alternative
  (`caption_by_locale` → per-locale mux) triples storage. Defer to
  publish-layer decision, but note that it does *not* affect the format
  comparison in this doc.

---

**Deliverable status**: E3 complete. Feeds E4 (upload flow needs the "5-photo
per listing" contract from §5), and F3 (funnel-stage decision matrix from §7
is a candidate for the 2-week roadmap).
