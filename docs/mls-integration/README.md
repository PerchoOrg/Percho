# FMLS / Bridge Interactive RESO Web API integration

**Status:** scaffold-only. No credentials yet. Once the broker completes
the Bridge portal + FMLS approval, set the three env vars in
`.env.example` and run the `mls_tables` migration — the address→autofill
API route will start returning real data with no code changes.

## Why Bridge?

Bridge Interactive (bridgedataoutput.com, owned by Zillow) has been
FMLS's official RESO Web API endpoint since 2019. It exposes the FMLS
dataset as an OData v4 API. The alternative — direct RETS — is deprecated
and FMLS is winding it down. Bridge is the only path we should build on.

## Endpoints used

| Endpoint | What we use it for |
|---|---|
| `GET /OData/{datasetId}/Property` | list / search listings (address autofill, full-sync) |
| `GET /OData/{datasetId}/Media`    | photos + virtual tour URLs per listing |
| `GET /OData/{datasetId}/Member`   | agent records (for future agent verification) |
| `GET /OData/{datasetId}/Office`   | brokerage records (for the "Listing courtesy of …" IDX attribution) |

`{datasetId}` is FMLS's Bridge dataset id (assigned by Bridge on
approval — likely `fmls` but confirm; goes in `BRIDGE_DATASET_ID`).

## Auth

Server-token (long-lived). Every request carries:

```
Authorization: Bearer <BRIDGE_SERVER_TOKEN>
```

The token identifies both the caller and the datasets they can read.
It **must never** be exposed to the browser. All Bridge calls originate
from Next.js Route Handlers or from the sync-worker process — never
from a client component.

## OData query patterns

Bridge follows OData v4. Common patterns we use:

```
$filter=StandardStatus eq 'Active' and City eq 'Atlanta'
$filter=ListingKey eq 'FMLS-1234567'
$filter=ResourceRecordKey eq 'FMLS-1234567'    # for /Media
$filter=ModificationTimestamp gt 2026-07-04T00:00:00Z
$top=500&$skip=1000
```

String literals in `$filter` are single-quoted; embedded single quotes
are doubled (`O''Brien`). See `odataEscape()` in `lib/mls/bridge-client.ts`.

## Rate limits & retry

Bridge documents ~200 req/min per token on the standard plan.
`BridgeClient` handles:

- **429**: honors `Retry-After` (seconds) if present, otherwise
  exponential backoff `2^attempt * 500ms`, capped at 30s.
- **5xx**: same backoff schedule.
- **Attempts**: 5 max, then throws `BridgeApiError`.
- **Timeout**: 15s per request via `AbortController`.

The sync-worker fetches media serially per-listing (not in parallel) to
stay well below the per-minute cap during the initial full-sync.

## Data flow

```
                 ┌────────────────────────────┐
   agent UI ───▶ │ POST /api/mls/autofill     │
   (address)     │  (Next.js Route Handler)   │
                 └──────────────┬─────────────┘
                                │
                                ▼
                 ┌────────────────────────────┐
                 │ autofillListingByAddress() │
                 │  guards on env vars        │
                 └──────────────┬─────────────┘
                                │
                                ▼
                 ┌────────────────────────────┐
                 │ BridgeClient               │
                 │  /Property $filter=…       │
                 │  /Media    $filter=…       │
                 └──────────────┬─────────────┘
                                │  (Bearer token)
                                ▼
                 ┌────────────────────────────┐
                 │ api.bridgedataoutput.com   │
                 └────────────────────────────┘

     ─── independent path (batch) ───

  cron / manual  ─▶ tsx lib/mls/sync-worker.ts --mode=incremental
                        │
                        ├─▶ Bridge /Property (paged)
                        ├─▶ Bridge /Media    (per-listing)
                        └─▶ Postgres  mls_listings / mls_media / mls_sync_state
```

## Deployment shape

The **address-autofill route** runs on Vercel — it's a single request
that finishes in <5s under normal conditions.

The **sync worker does NOT run on Vercel.** Vercel serverless functions
cap at 60s (300s on Pro for background functions), which is not enough
to page through FMLS's full active inventory (~30k Active + Pending
listings × ~15 media each on the first run). Deploy the worker as a
long-running process on **Fly.io** or **Railway**, or as a **GitHub
Actions cron** with a 6-hour schedule for incremental sync. The full
sync only runs once (initial backfill); after that everything is
incremental.

Suggested cadence:
- Full sync: manual, once, on first credential provisioning.
- Incremental: every 15 minutes (well within IDX 24-hour freshness rule).

## Media strategy: hotlink, don't mirror (MVP decision)

For MVP we return Bridge CDN URLs directly. Rationale:
- Zero storage cost.
- Bridge CDN handles freshness (deleted media 404s automatically —
  which is what we want for compliance).
- No media processing pipeline to build.

Downsides accepted:
- We depend on Bridge CDN uptime for image display.
- We lose the option to run image transforms.

If either becomes a real problem, add a `mls_media.mirrored_url` column
and a background worker that pushes to Supabase Storage. The DB shape
already supports this without a schema break.

## Judgment calls (owner should review)

1. **Media hotlinking** vs mirroring — see above.
2. **`InternetEntireListingDisplayYN` treatment**: `null` is treated as
   "displayable" (RESO tri-state). Only explicit `false` filters out.
   This matches most Bridge dataset conventions, but confirm with FMLS
   IDX rules on approval.
3. **Address parsing** in `address-autofill.ts` splits on the first
   space-separated numeric token. Works for canonical Google Places
   output; may need fuzzier logic for user-typed addresses. We can add
   libpostal or similar later.
4. **No PostGIS** in the migration — a plain `(latitude, longitude)`
   btree covers current needs. Add PostGIS if we ever need radius
   search on mirrored data.
5. **Sync watermark is a single row per source** — no per-page
   restartability. Cost of a mid-sync failure is one wasted 15-minute
   window's worth of API calls, which is acceptable.

## Files

```
lib/mls/
  bridge-client.ts       # RESO Web API transport (retry, auth, timeout)
  reso-types.ts          # Raw RESO shapes + normalized Percho shape
  address-autofill.ts    # Public entry point for autofill route
  sync-worker.ts         # CLI batch sync (Fly/Railway/cron)

app/api/mls/autofill/route.ts   # POST /api/mls/autofill

supabase/migrations/YYYYMMDDHHMMSS_mls_tables.sql

docs/mls-integration/
  README.md              # this file
  data-model.md
  compliance-checklist.md

__tests__/mls/
  bridge-client.test.ts
  address-autofill.test.ts
```

## Wiring checklist (once creds arrive)

1. Add `BRIDGE_SERVER_TOKEN`, `BRIDGE_DATASET_ID`, `BRIDGE_BASE_URL` in
   Vercel + Fly/Railway env.
2. Run `pnpm db:push` to apply the mls_tables migration.
3. Regenerate types: `pnpm db:types` (removes the `any` casts in
   `sync-worker.ts`).
4. Add npm scripts:
   ```json
   "mls:sync-full":        "tsx lib/mls/sync-worker.ts --mode=full",
   "mls:sync-incremental": "tsx lib/mls/sync-worker.ts --mode=incremental"
   ```
5. On Fly/Railway, schedule `mls:sync-incremental` every 15 minutes.
6. Run `mls:sync-full --dry-run` first to confirm auth + filter are OK,
   then re-run without `--dry-run`.
7. Read `compliance-checklist.md` before shipping any UI that surfaces
   MLS data to end users.
