# API: AI Home Tour Generation (Phase 12 contract)

> **Status: STUB.** Endpoint exists and returns 501. The frontend button is
> disabled with a "Coming soon — Q4 2026" tooltip. This document is the
> contract the real implementation will fulfill.

## Goal

Turn ≥3 listing photos into a short (~30s) AI-generated home tour video,
attached to the listing as a `kind='ai_tour'` row in `listing_videos` (or
`listing_media` post-Phase-10).

We do not yet know which provider we'll use. Candidates: Runway, Luma Dream
Machine, Pika, Stable Video Diffusion via fal.ai, custom ffmpeg + Ken Burns
fallback. The **interface** below is provider-agnostic on purpose.

## Endpoint

```
POST /api/listings/:id/generate-tour
```

### Auth

- Must be signed in (Supabase session).
- Must own the listing — RLS on `listings` enforces this; route returns 404
  (not 403) on miss to avoid leaking listing existence.

### Request

No body. The endpoint pulls everything from the listing record and its
photos.

### Response (V1 stub — current behavior)

`501 Not Implemented`:
```json
{
  "error": "not_implemented",
  "message": "AI-generated home tour videos are coming soon. We are evaluating providers; ETA Q4 2026.",
  "eta": "Q4 2026",
  "listing_id": "<uuid>"
}
```

### Response (future — when implemented)

Synchronous 202 + async webhook pattern:

```json
202 Accepted
{
  "job_id": "<uuid>",
  "listing_id": "<uuid>",
  "status": "queued",
  "estimated_seconds": 90
}
```

Followed by Realtime push on the existing `listing_videos` channel when the
generated video lands.

### Error responses (future)

| Status | error code           | When                                         |
|--------|----------------------|----------------------------------------------|
| 400    | `not_enough_photos`  | Listing has fewer than 3 photos              |
| 401    | `unauthorized`       | No session                                   |
| 404    | `listing_not_found`  | Listing missing or not owned by caller       |
| 409    | `tour_already_queued`| A job is already in flight for this listing  |
| 502    | `provider_failed`    | Upstream generation API errored              |
| 503    | `quota_exhausted`    | Out of monthly credits                       |

## Future implementation outline

When we pick a provider:

1. **Validate**: `photoCount >= 3` (Phase 10 prerequisite).
2. **Enqueue**: write a row in a new `tour_jobs` table (status='queued',
   listing_id, photos[], provider, created_at).
3. **Worker**: a Vercel cron / background function picks up queued jobs,
   calls the provider with the photo URLs, polls for completion.
4. **Ingest**: download the rendered MP4, upload to Cloudflare Stream via
   the existing `createDirectUpload()` flow, insert a `listing_videos` row
   with `kind='ai_tour'`.
5. **Notify**: existing Realtime subscription on `listing_videos` will
   surface the new video to the dashboard automatically.

## Frontend wiring (today)

`app/dashboard/listings/[id]/edit/GenerateTourPanel.tsx` renders a disabled
button with a tooltip. When implementation lands:

- Flip `disabled` based on `photoCount >= 3`.
- On click → `POST /api/listings/:id/generate-tour` → optimistic UI showing
  "Generating…" until the Realtime channel emits the new row.
- Error toast on 4xx/5xx responses.

## Open questions

- **Cost model**: per-tour cost likely $0.50–$2 depending on provider. Free
  for V1; paywall later.
- **Quality bar**: at what point do we ship vs. keep "coming soon"? Manual
  QA on 5–10 real listings before flipping the toggle.
- **Re-generation**: can an agent regenerate? V1 = yes, no rate limit.
  Will probably need one once the cost model lands.
