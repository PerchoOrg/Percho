# MLS go-live — what exists, what is missing, and the path from feed to app

Written 2026-09-04 (Phase F of the store-launch plan). This is the readiness
note the `mls_tables` migration pointed at (`docs/mls-integration/`), which
never got written. It is deliberately a map, not a build: the data channel
is the owner's to secure, and `mls_listings` is empty in production, so any
projection code written today would be untested against real rows.

## 1. Where things stand

| Piece | State | Where |
|---|---|---|
| RESO Web API client (Bridge Interactive) | **Built, never run.** Needs `BRIDGE_SERVER_TOKEN`, `BRIDGE_DATASET_ID`, optional `BRIDGE_BASE_URL`. None are in `.env.example` or Vercel. | `apps/web/lib/mls/bridge-client.ts`, `reso-types.ts` |
| Mirror tables | Migrated, empty. RLS on, zero policies → service-role only. | `supabase/migrations/20260704075823_mls_tables.sql` (`mls_listings`, `mls_media`, `mls_offices`, `mls_members`, `mls_sync_state`) |
| Sync worker (feed → mirror) | **Built, never run.** `--mode=full \| incremental`, `--dry-run`; watermark on `mls_sync_state`. No npm script, no cron. Must not run on Vercel (300 s cap vs ~30k active FMLS rows). | `apps/web/lib/mls/sync-worker.ts` |
| Mirror → `listings` projection | **Does not exist.** Today's 18 FMLS rows came from the one-shot scraper (`scripts/fmls-scrape/`), which is retired — not legal for the public app (phase166). | — |
| Tour render for a new listing | Manual. Admin creates a `listing_tour_runs` row and steps it (tag → review → plan → generate → assemble). Free engines `kenburns` (ffmpeg only) and `depthflow`; `seedance` is the only one that bills. | `apps/web/app/api/admin/listings/[id]/runs/*`, `scripts/render-worker/worker.py`, `apps/web/lib/poi/listing-tour-steps/generate.ts` |
| Feed without a video | **Already handled.** The mobile feed's default pool includes photo-only listings (`videosOnly` defaults to `0`); the card shows the hero photo and a photo carousel instead of a film. | `apps/web/lib/feed/browse-cards.ts` (`mediaKind: 'photo'`), `apps/mobile/components/cards/ListingFace.tsx` |

## 2. Owner-only: the channel

Nothing below can start until one of these is signed:

1. **FMLS IDX/VOW data licence** via a RESO Web API vendor. Bridge Interactive
   is what the client is written against; the dataset id and server token are
   issued per licensed application. Ask for `Property` and `Media` resources
   and the `InternetEntireListingDisplayYN` field — the mirror already stores
   it and the projection below refuses rows where it is `false`.
2. Display rules come with the licence (attribution line, "listing courtesy
   of" office name, refresh cadence, no-display of certain fields). These
   land in `apps/web/lib/listings/detail.ts` (`listingWebUrl`, sources block)
   and the mobile listing page's footer — keep the copy in one place.

## 3. The path once the channel exists

### 3.1 Mirror (exists)

```
pnpm --filter web exec tsx lib/mls/sync-worker.ts --mode=full --dry-run   # first: count only
pnpm --filter web exec tsx lib/mls/sync-worker.ts --mode=full
pnpm --filter web exec tsx lib/mls/sync-worker.ts --mode=incremental      # cron, every 15–30 min
```

Run on the Mac mini or a small always-on box, never on Vercel. Add the two
npm scripts the worker's header already spells out. First full sync of
~30k rows × 500/page is minutes, not hours.

### 3.2 Projection `mls_listings` → `listings` (to build, ~150 lines)

`scripts/admin/mirror-to-listings.ts`, service role, idempotent, run right
after each incremental sync. Column map:

| `listings` | from `mls_listings` | note |
|---|---|---|
| `source` | `'fmls_bridge'` | distinct from the scraper's `'fmls'`, so the two never collide on `listings_source_uniq` |
| `source_id` | `listing_key` | the RESO `ListingKey`, stable across updates |
| `slug` | `{street}-{listing_key}` (kebab) | same rule the scraper used, so `/v/fmls/<sourceId>` keeps working — extend `listingWebUrl` to accept `fmls_bridge` |
| `address` | `street_number + street_name + street_suffix` | |
| `city`, `state`, `zip` | `city`, `state_or_province`, `postal_code` | |
| `lat`, `lng` | `latitude`, `longitude` | |
| `price` | `list_price` | |
| `beds`, `baths`, `sqft` | `bedrooms_total`, `bathrooms_total_integer`, `living_area` | |
| `year_built`, `lot_size` | `year_built`, `lot_size_acres` (as text) | `detail.ts` already parses `lotSizeRaw` |
| `description` | `[public_remarks]` | array column |
| `external_agent_name`, `external_office` | `list_agent_full_name`, `list_office_name` | required by `listings_owner_chk` when `agent_id` is null |
| `status` | `standard_status = 'Active' → 'active'`, else `'archived'` | Pending/Closed leave the feed on the next run |
| `cover_url` | first `mls_media` row by `display_order` | see photos below |

Then set `mls_listings.our_listing_id` back to the new `listings.id` — the
detail page already joins on it for `daysOnMarket` / `mlsNumber`.

**Photos**: `listing_photos.storage_path` is `not null unique`, i.e. photos
are expected in Supabase Storage, not hot-linked. The licence usually
permits caching; copy each `mls_media.media_url` into
`listing-photos/mls/<listing_key>/<nn>.jpg` (the scraper's
`upload_photos.py` is the shape) and insert rows with `alt_text` from
`mls_media.short_description` when present. Budget: ~25 photos × 30k listings is ~750k objects
— start with the launch ZIPs only (`scripts/admin` should take a `--zips`
list), not the whole feed.

**Deletes**: the sync worker only sees rows whose `ModificationTimestamp`
moved. A listing withdrawn without a final modification stays `active`
forever. Run `--mode=full` nightly and archive any `listings` row whose
`source_id` is no longer in the mirror with an active status.

### 3.3 Render (decision: free engine, human gate stays)

For every projected listing that has photos and no `listing_tour_runs` row,
insert a run and execute the **tag** step (free, local). Stop there. The
**review** step is the owner's editorial pass on which photos carry the film
and that is a product call, not a pipeline one — the same rule the
community-tour pipeline follows. Generation uses `kenburns` (ffmpeg pan/zoom,
no GPU, no bill) unless the admin picks `depthflow`; `seedance` stays a
manual choice per listing because it is the only engine that costs money.

Until the run is assembled the listing rides the feed as a photo card
(§3.4). Nothing in the store build waits on a film.

### 3.4 Feed (decision: photo cards are the default, keep it)

`/api/mobile/feed` already ships photo-only listings unless the client asks
for `videosOnly=1`, and the mobile card renders `heroUrl` + carousel when
there is no `videoUrl`. No change. The `videoFirst` flag reorders films to
the top so the first swipe still lands on a tour when one exists.

## 4. Pre-flight checklist

- [ ] Licence signed; Bridge dataset id + server token in the sync host's env (never in the repo, never in Vercel — the worker does not run there).
- [ ] Attribution / display rules copied into `detail.ts` and the mobile listing footer.
- [ ] `sync-worker --mode=full --dry-run` counts rows; then full; then cron incremental.
- [ ] `mirror-to-listings.ts` built and run with `--zips` for the launch area; spot-check three `/v/fmls/<key>` pages and the same three in the app.
- [ ] `listingWebUrl` accepts `source = 'fmls_bridge'`.
- [ ] Nightly full sync + archive-missing job in place.
- [ ] Tag-step automation for new listings (optional for launch).
