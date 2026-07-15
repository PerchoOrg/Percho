# POI Content Pipeline — Design Doc v1

**Status**: Draft · **Owner**: Percho · **Last updated**: 2026-07-15
**Related**: `content-pipeline-v1` (Phase G), Skills: `content-pipeline-design-anchoring.md`, `neighborhood-content` conventions (memory §25).

> **⚠ Phase 79 update (2026-07-15)** — the 4-bucket taxonomy referenced throughout this doc (walkable / daily_drive / lifestyle / commute) was replaced by **14 buyer-persona buckets** in `lib/poi/types.ts`:
>
> `schools · dining · nightlife · shopping · outdoor · fitness · kids · asian_community · daily_errands · faith · work_hubs · healthcare · pets · transit`
>
> Rationale: distance-based buckets modeled *access* ("how do I get there?"). The new taxonomy models *buyer decisions* ("what matters to my life?"). Bucket → Google Places `type[]` mapping lives in `BUCKET_PLACES_TYPES` (`lib/poi/google-places.ts`). Sections below that reference the old 4 buckets are historical — replace mentally with the new taxonomy until this doc is rewritten in Phase 80.

---

## 0. TL;DR

Every listing needs a rich "neighborhood story" that a video pipeline can render into feed clips. Rather than treat Google Places as a photo gallery, we treat **nearby** as a raw signal pool from which the system extracts, ranks, and narrates the assets a buyer cares about — walkability, daily-drive convenience, lifestyle amenities, and commute realities.

**Output shape**: **≤6 videos per listing**, one per buyer question (walkable / daily-drive / lifestyle / commute / community/vibe). Each video is stitched from many approved POIs. **Never one video per POI** — a listing with 200 POIs still ships ≤6 videos. See §1.1 for why.

**End state**: Fully automated. Given a listing address, the system produces approved photo sets + tagged narratives + rendered vertical videos with zero human involvement.

**Current stage**: Human-in-the-loop review. Every human decision is captured as structured training data so the selection / tagging / video-generation models improve monotonically toward auto-approval.

---

## 1. Philosophy

### 1.1 One video per buyer question, not one video per POI

**Fundamental rule**: A listing has hundreds of POIs. We never generate hundreds of videos. Buyers do not want a per-POI ad reel — they want a small number of **question-answering videos**, each one focused on a decision they actually make.

The video output is a **fixed, small set of buyer-question videos per listing**, each stitched from many POIs:

| Video | Buyer question it answers | POIs it consumes |
|---|---|---|
| **"Can I walk anywhere from this house?"** | Walkable life | All approved POIs in the ≤0.5 mi bucket, ranked by tag + rating |
| **"What's my daily life look like here?"** | Daily drive | Grocery + elementary school + gym + urgent care POIs, ≤2–3 mi |
| **"Where do I go for fun on the weekend?"** | Lifestyle | Restaurants + entertainment + shopping in the 3–10 mi ring |
| **"How's the commute?"** | Commute | Highway ramps + MARTA + timed Directions API to metro anchors |
| **"What kind of neighborhood is this?"** | Community/vibe | Subdivision entrance + street-view sweep + parks + community gathering places |

Rule of thumb: **≤6 videos per listing**, regardless of POI count. If we ever have 20 POIs feeding one video, the video is 45s with 20 short clips — not 20 separate 45s videos.

**Why this matters**:
- Buyers scroll a feed. Six per listing is browsable; sixty is spam.
- Each video has a single narrative spine (voiceover / caption arc). Per-POI clips have no spine — just a slideshow.
- The scarce resource is buyer attention, not POI coverage. A video that gets skipped in 2s is worse than no video.

**Implication for the pipeline**: The unit of video generation is a **buyer-question template** (walkable / daily-drive / lifestyle / commute / community), not a POI. `generateVideo` takes a `(listing_id, question_template)` — never a `poi_id`. Approved POI photos are the *inputs* to whichever templates they qualify for; a Publix approved for "daily drive" contributes 2 clips to that video, not its own video.

### 1.2 Narrative, not gallery

`3 miles` and `5 miles` are the wrong axis. Buyer questions are:

| Buyer intent | Loose radius | What they actually want to know |
|---|---|---|
| **Walkable life** | ≤0.5 mi (~10 min walk) | Coffee, sidewalks, parks, safe crossings |
| **Daily drive** | ≤2–3 mi | Grocery, elementary school, gym, urgent care |
| **Lifestyle** | 3–10 mi | Mall, main dining scene, entertainment |
| **Commute** | variable | Highway ramp, MARTA, downtown time in traffic |

Radius is a **derived filter**, not a user-facing dial. The user picks intent; the system picks distance.

### 1.3 Human review = training data

The current manual review flow is not the product. It is the **labelling substrate**. Every approve / reject / tag-edit / narrative-edit is written as a structured `review_event` and used to train:

1. POI selection classifier — which POIs to fetch given a listing
2. Photo quality classifier — which photos survive per POI
3. Tag correctness — LLM prompt refinement via before/after diffs
4. Narrative arc — which combinations of POIs render into compelling videos

A review UI that captures only "approved / rejected" without structured reasons is useless. Reasons must be an enum + free text.

### 1.4 Automation ladder

| Stage | Human role | Gate to next |
|---|---|---|
| **v0** — all manual | Every POI + every photo + every tag reviewed | ≥100 listings reviewed, per-model precision benchmarked |
| **v1** — human confirms | Model proposes; human bulk-approves or edits | Auto-approval precision ≥0.90 at recall ≥0.80 for 200 listings |
| **v2** — auto with sampling | System runs; 5–10% sampled for QA | Sampled precision ≥0.95 for 30 days |
| **v3** — full auto | Ad-hoc audit only | — |

**We are at v0.** Everything downstream depends on v0 producing dense, structured labels.

---

## 2. Data sources

| Signal | Source | Endpoint | Cost | Notes |
|---|---|---|---|---|
| POI discovery | Google Places API (New) | `places:searchNearby` / `places:searchText` | $0.032 / 60 POI | Field-masked, no photos in this call |
| POI photos | Google Places API (New) | `/{name}/media` | $0.007 / photo | Max 10 per POI, attribution mandatory |
| Address / POI street view | Google Street View Static | `/streetview` + `/streetview/metadata` | $0.007 / img | Metadata is free; check before fetching image |
| Commute / drive times | Google Directions | `/directions/json` | $0.005 / pair | Supports `departure_time` and `traffic_model` for time-of-day |
| Walkability signals | OpenStreetMap Overpass | `overpass-api.de/api/interpreter` | **free** | Sidewalks (`highway=footway`), crosswalks, parks polygons |
| Foot-traffic / popularity | Google Popular Times (unofficial) | `populartimes` python lib | **free** | Best-effort; not for prod-critical decisions |
| Gated-community interiors | Mapbox Satellite (later) | `styles/mapbox/satellite-v9` | $ per tile | Street View has zero coverage inside gated subdivisions |

**Enabled today**: Places (New), Street View Static, Geocoding. Directions API is not yet enabled — we will enable when Phase B lands.

---

## 3. DB schema

**Design principle**: POI + photo are **global** entities keyed by Google's identifiers. Listing-scoped review state lives in join tables. Same Publix used by 100 listings = 1 row in `pois`, 10 rows in `poi_photos`, N rows in `listing_pois` / `listing_poi_photos`.

**Cost impact**: In a metro with dense listing overlap (Peachtree Corners, Alpharetta), ~40% of POI+photo work is amortized across the first listing that discovers each POI. Claude vision tagging in particular is a one-time cost per photo, not per listing.

All timestamps `timestamptz default now()`.

### 3.1 `pois` — global POI registry

```sql
create table pois (
  id            uuid primary key default gen_random_uuid(),
  google_place_id text not null unique,
  display_name  text not null,
  formatted_address text,
  primary_type  text,
  types         text[],
  rating        numeric(2,1),
  user_ratings_total integer,
  business_status text,
  location      point,                -- (lng, lat)
  raw_place     jsonb,
  ai_tags       jsonb,                -- Claude-generated tags of the POI itself
  ai_summary    text,                 -- one-line Claude summary
  discovered_at timestamptz not null default now(),
  refreshed_at  timestamptz not null default now()
);
create index on pois (google_place_id);
create index on pois (primary_type);
```

### 3.2 `listing_pois` — per-listing POI view

```sql
create table listing_pois (
  listing_id    uuid not null references listings(id) on delete cascade,
  poi_id        uuid not null references pois(id) on delete cascade,
  intent_bucket text not null,        -- walkable | daily_drive | lifestyle | commute
  distance_m    integer,              -- straight-line
  drive_time_s  integer,              -- populated by Directions later
  status        text not null default 'candidate',
    -- 'candidate' | 'approved' | 'rejected' | 'archived'
  ai_score      numeric(3,2),         -- fitness score for THIS listing
  discovered_at timestamptz not null default now(),
  reviewed_at   timestamptz,
  primary key (listing_id, poi_id)
);
create index on listing_pois (listing_id, status);
create index on listing_pois (listing_id, intent_bucket);
```

### 3.3 `poi_photos` — global photo registry

```sql
create table poi_photos (
  id            uuid primary key default gen_random_uuid(),
  poi_id        uuid not null references pois(id) on delete cascade,
  source        text not null,        -- 'google_places' | 'google_streetview'
  google_photo_name text unique,      -- 'places/xxx/photos/yyy' — dedup key
  storage_path  text not null,        -- Supabase Storage
  width_px      integer,
  height_px     integer,
  bytes         integer,
  attribution   jsonb,                -- required by Google TOS
  ai_tags       jsonb,                -- {scene, mood, subjects[], usable, reason}
  ai_score      numeric(3,2),
  ai_model      text,                 -- 'claude-sonnet-4-5' etc, for versioning
  created_at    timestamptz not null default now(),
  tagged_at     timestamptz
);
create index on poi_photos (poi_id);
```

### 3.4 `listing_poi_photos` — per-listing photo review

```sql
create table listing_poi_photos (
  listing_id    uuid not null references listings(id) on delete cascade,
  poi_photo_id  uuid not null references poi_photos(id) on delete cascade,
  status        text not null default 'pending',
    -- 'pending' | 'approved' | 'rejected'
  reviewed_at   timestamptz,
  primary key (listing_id, poi_photo_id)
);
create index on listing_poi_photos (listing_id, status);
```

### 3.5 `poi_traffic` — per-listing drive-time cache

```sql
create table poi_traffic (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references listings(id) on delete cascade,
  poi_id        uuid references pois(id) on delete cascade,   -- null = commute anchor
  destination_label text,
  time_bucket   text not null,        -- 'morning_peak' | 'midday' | 'evening_peak' | 'weekend_noon'
  duration_free_s integer,
  duration_actual_s integer,
  congestion_ratio numeric(3,2) generated always as (
    duration_actual_s::numeric / nullif(duration_free_s, 0)
  ) stored,
  fetched_at    timestamptz not null default now()
);
create index on poi_traffic (listing_id, time_bucket);
```

### 3.6 `review_events` — training data (the important one)

```sql
create table review_events (
  id            bigserial primary key,
  listing_id    uuid not null references listings(id) on delete cascade,
  entity_type   text not null,        -- 'listing_poi' | 'listing_poi_photo' | 'tag' | 'narrative' | 'video'
  entity_ref    jsonb not null,       -- composite pointer, e.g. {listing_id, poi_id} or {listing_id, poi_photo_id}
  action        text not null,        -- 'approve' | 'reject' | 'edit_tag' | 'edit_narrative' | 'reorder' | 'comment'
  reason_tags   text[],
  human_note    text,
  ai_prediction jsonb,                -- AI decision snapshot at review time
  human_value   jsonb,                -- for edits: what the human set it to
  reviewer_id   uuid,
  created_at    timestamptz not null default now()
);
create index on review_events (listing_id, entity_type, created_at desc);
create index on review_events (entity_type, action);
```

### 3.7 `generated_videos` — unchanged, tied to listing

```sql
create table generated_videos (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references listings(id) on delete cascade,
  scope         text not null,        -- 'poi' | 'intent_bucket' | 'listing'
  scope_id      uuid,                 -- pois.id when scope='poi'
  intent_bucket text,
  cf_stream_uid text,
  duration_s    numeric(5,2),
  aspect_ratio  text default '9:16',
  input_photo_ids uuid[],             -- poi_photos.id array (global)
  narrative     jsonb,
  generator     text,                 -- 'ffmpeg_slideshow' | 'heartmula' | ...
  status        text not null default 'pending',
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz
);
```


#### 3.6.1 Reason enums

**POI reject reasons**: `too-far`, `wrong-vibe`, `commercial-noise`, `not-representative`, `duplicate-of`, `low-quality`, `wrong-demographic`, `chain-not-local`, `other`

**Photo reject reasons**: `storefront-only`, `empty-parking-lot`, `night-blurry`, `no-people`, `wrong-season`, `logo-heavy`, `duplicate`, `low-resolution`, `stock-looking`, `not-poi-related`, `other`

**Tag edit reasons**: `wrong-scene`, `missing-mood`, `wrong-subject`, `too-generic`, `other`

Reasons enum lives in `lib/poi/review-reasons.ts`, single source of truth for UI + DB validation.


---

## 4. UI — Media tab integration (agent-hub)

Extends `app/dashboard/listings/[id]/edit/MediaPanel.tsx`. Not a new page, not a new route.

### 4.1 Tab structure

The listing edit "Media" area gets a new inner tab bar:

```
┌ Uploads ─┬─ Nearby POI (new) ─┬─ Street View (new) ─┬─ Videos ─┐
│                                                                │
│ (existing PhotoPanel + VideoPanel upload UI)                   │
│                                                                │
│ Nearby POI tab body:                                            │
│ ┌ Discovery status                                          ── │
│ │ 47 POIs discovered · 12 pending review · 8 approved       │
│ │ [Refresh from Google] [Fetch drive times]                 │
│ └────────────────────────────────────────────────────────── │
│                                                              │
│ ┌ Intent buckets (accordion) — each bucket = one buyer-question video │
│ │ ▸ 🚶 Walkable (3 POI · 8 photos approved) [▶ Generate video]│
│ │ ▾ 🚗 Daily drive (18 POI · 32 photos approved) [▶ Generate video]│
│ │    ┌ POI card ────────────────────────────────────────┐   │
│ │    │ Publix at The Forum · 0.6mi · ★4.4 (450)         │   │
│ │    │ [10 photos: 6 approved, 2 rejected, 2 pending]   │   │
│ │    │ Tags: grocery, upscale, plaza                    │   │
│ │    │ [Review photos] [Skip POI]                       │   │
│ │    └──────────────────────────────────────────────────┘   │
│ │ ▸ 🌆 Lifestyle (14 POI · 22 photos approved) [▶ Generate video]│
│ │ ▸ 🛣 Commute (2 anchors) [▶ Generate video]                 │
│ │ ▸ 🏘 Community/vibe (subdivision + parks) [▶ Generate video]│
│ └────────────────────────────────────────────────────────── │
└────────────────────────────────────────────────────────────────┘
```

### 4.2 Photo review drawer

Clicking `[Review photos]` on a POI card opens a right-side drawer (not a modal — modal wastes screen real estate on a grid):

```
Photo grid: 3-col, 240×240 thumbs
Each thumb has an overlay row:
  [✓ Approve] [✗ Reject] [🏷 Edit tags]
Selecting reject → dropdown of reject reasons (multi-select) + optional note

Bulk actions bar at top of drawer:
  [Approve all pending] [Reject all pending] [Mark POI reviewed]
```

Every action fires a `review_events` insert immediately (optimistic UI, server action).

### 4.3 Component layout

```
MediaPanel.tsx                        (existing, gets tab bar)
├─ NearbyPoiPanel.tsx                 (new — client component)
│   ├─ PoiDiscoveryHeader.tsx         (refresh button + stats)
│   ├─ IntentBucketAccordion.tsx      (walkable/daily_drive/lifestyle/commute)
│   │   └─ PoiCard.tsx                (one per POI)
│   └─ PhotoReviewDrawer.tsx          (opens on demand)
├─ StreetViewPanel.tsx                (new — 4 headings + address preview)
└─ VideoPanel.tsx / PhotoPanel.tsx    (existing, unchanged)

Server actions:
lib/poi/actions.ts
  discoverPois(listingId, opts?)       → hits searchNearby, upserts pois + listing_pois
  fetchPoiPhotos(poiId)                → downloads to Supabase Storage, inserts poi_photos
  fetchStreetView(listingId, target)   → 4 headings for address or POI
  fetchDriveTimes(listingId)           → Directions API for all approved POIs
  recordReview(payload)                → insert review_events + update entity status
  generateBucketVideo(listingId, bucket)  → enqueue video job for one buyer-question
                                            bucket ∈ {walkable, daily_drive, lifestyle, commute, community}

Async jobs (Cron via percho-render-worker OR API-triggered):
  tag-poi-photos                       → Claude/Gemini vision batch
  train-selection-model                → periodic; fits classifier from review_events
```

### 4.4 What NOT to build in v0

- **No live-poll UI for POI discovery**. Discovery is fast enough (≤5s) to await inline.
- **No auto-video-on-approve**. Video generation stays behind a manual button until we know approved photos are actually good.
- **No radius slider**. Radius is derived from intent bucket, not user-set. If we're wrong, we fix the bucket → radius map in code, not the UI.

---

## 5. Ranking & filtering (v0)

Everything below is **initial heuristics** that we override with the learned model once `review_events` has enough labels.

### 5.1 POI selection

Fetch from Google in each intent bucket:

| Bucket | Types | Radius | Hard filters | Rank |
|---|---|---|---|---|
| walkable | park, cafe, restaurant, grocery, gym | 800m | rating≥4.0, reviews≥30 | rating × log(reviews) |
| daily_drive | school (elementary/middle), grocery, gym, urgent_care, pharmacy | 4800m | rating≥4.0 (schools: ≥3.5), reviews≥30 (schools: ≥10) | rating × log(reviews) / distance |
| lifestyle | shopping_mall, restaurant, entertainment | 12000m | rating≥4.3, reviews≥100 | rating × log(reviews) |
| commute | manual anchor list per metro (Atlanta: Downtown, Midtown, MARTA stations, 285/400 ramps) | — | — | — |

Rating ≥4.0 is the initial cut; if any bucket has <3 candidates we drop to 3.8 for that listing. Log the drop as a `system_event` so we can spot patterns (e.g., rural listings systematically below the bar).

### 5.2 Photo selection

Google returns up to 10 per POI. Auto-annotate all 10 with vision LLM:

```json
{
  "scene": "storefront" | "interior" | "exterior_wide" | "food" | "people" | "landscape",
  "mood": ["upscale","walkable","family","quiet","vibrant"],
  "subjects": ["signage","building","landscaping","seating","crowd"],
  "usable_for_neighborhood_narrative": true/false,
  "reason": "short human-readable explanation"
}
```

Present in review UI ranked by `usable=true` first, then `mood match to listing profile`, then `subjects diversity`.

### 5.3 Street View selection

- Address itself: 4 headings, unconditional.
- Each **walkable** POI: 1 image at heading pointing at the POI (compute bearing from lat/lng).
- Skip Street View for POIs with `no-coverage` metadata.

---

## 6. Cost model

Per listing at first fetch (worst case, all buckets populated):

| Item | Volume | Unit | Cost |
|---|---|---|---|
| Nearby Search (searchNearby) | 4 buckets × 1 page | $0.032 | $0.13 |
| POI Photos | 25 POI × 10 photos | $0.007 | $1.75 |
| Street View (4 headings + ~10 POI × 1) | 14 imgs | $0.007 | $0.10 |
| Directions (25 POI × 3 time buckets + 4 commute anchors × 3) | 87 pairs | $0.005 | $0.44 |
| Vision LLM (Claude Sonnet 4.5) | ~250 photos × ~$0.008 | — | $2.00 |
| **Total (worst case, cold cache)** | | | **~$4.42** |
| **Total (warm cache, 40% shared)** | | | **~$2.65** |

First 10k calls/month/SKU are free (Google), so first ~40 listings/month are ~free on Places+Street View. Directions has separate 40k/mo free.

**Hard cap**: $3.00 / listing / rolling 30d. Enforced in a `poi_spend_budget` table with per-SKU counters; exceeding blocks further fetches with a UI warning.

---

## 7. Rollout plan

| Phase | Scope | Exit criteria |
|---|---|---|
| **A. Schema + discovery** | Tables, `discoverPois` action, POI list UI (read-only) | Can discover POIs for 1 listing end-to-end, rows persist |
| **B. Photo fetch + review** | `fetchPoiPhotos`, review drawer, `recordReview` | 3 listings fully reviewed, ≥100 photo review_events |
| **C. Street View + Directions** | `fetchStreetView`, `fetchDriveTimes`, commute anchor config | Traffic panel renders, all 4 intent buckets populated |
| **D. Vision tagging** | Batch Gemini job, ai_tags rendered in review UI | Tags on 500+ photos, tag-edit review_events flowing |
| **E. Buyer-question videos v0** | ffmpeg slideshow per **bucket** (walkable / daily_drive / lifestyle / commute / community), 30–60s vertical, stitched from N approved POIs. **Never per-POI.** | 3 listings each ship ≤6 videos, human approval flow works |
| **F. Learning loop** | Fit selection + photo classifiers weekly; expose `ai_score`, sort UI by it | Precision ≥0.7 at recall ≥0.8 on held-out reviews |
| **G. Semi-auto** | UI defaults to "approve top-N" per POI; human overrides | Median reviewer time / listing <5 min |
| **H. Auto** | Sampling QA only | Sampled precision ≥0.95 for 30d |

---

## 8. Open questions

1. Vision model choice — **Claude Sonnet 4.5 vision for all tagging** (user directive, keep the stack single-vendor for v0). Revisit Gemini Flash as a cost lever only if per-listing spend blows through the $3 cap.
2. Commute anchors — hand-curated per metro or auto-detected from population centroids? Default: hand-curated, small YAML (`lib/poi/commute-anchors/atlanta.yaml`).
3. Video engine choice for E: `ffmpeg` slideshow is the cheapest path. `heartmula` skill exists for song-driven. Keep both in generator column, default ffmpeg first.
4. `PhotoPanel` currently owns the Supabase upload pipeline. Do we **reuse** its storage abstraction for POI photos, or fork? Default: reuse the bucket, but path convention `poi/{poi_id}/{google_photo_name_hash}.jpg` (global, not listing-scoped, to match schema §3).
5. When a POI gets rejected, do we hide it forever or resurface it if the listing address changes? Default: soft-reject (`status='rejected'`), always re-consider on refresh but pre-check the rejected box in UI.

---

## 9. Not doing (explicit non-goals)

- **No per-POI video output.** POIs are inputs. Videos are per buyer-question (bucket). One listing ships ≤6 videos total, no matter how many POIs get approved. See §1.1.
- **No radius input.** Ever. If we're wrong, fix the intent-bucket→radius map in code.
- **No blanket auto-fetch on listing create.** Manual trigger only until cost model is stable in prod.
- **No video generation before photos are approved.** Videos consume approved photos, they do not produce their own.
- **No cross-listing photo sharing** in v0. Same POI shared by 3 listings = 3 rows in poi_photos. We can dedupe later; premature normalization risks losing per-listing review context.
- **No public POI API.** These endpoints are agent-hub / server-side only. No `/api/public/pois`.

---

## 10. Files touched (design; not yet implemented)

- **New**: `docs/poi-content-pipeline.md` (this file)
- **New tables**: 5 migrations under `supabase/migrations/`
- **New components**: `app/dashboard/listings/[id]/edit/NearbyPoiPanel.tsx`, `PoiCard.tsx`, `IntentBucketAccordion.tsx`, `PhotoReviewDrawer.tsx`, `StreetViewPanel.tsx`
- **New lib**: `lib/poi/{actions.ts,discovery.ts,photos.ts,streetview.ts,directions.ts,review-reasons.ts,intent-buckets.ts,scoring.ts}`
- **New scripts** (already exist as prototypes): `scripts/poi-photos.py`, `scripts/streetview.py` — will be ported to TS server actions
- **Modified**: `MediaPanel.tsx` (adds inner tab bar), `EditListingForm.tsx` (wires new panel)

---

*End of design doc. Any changes to §1 (Philosophy), §2 (Data sources), §3 (Schema), or §9 (Non-goals) require re-review before implementation.*
