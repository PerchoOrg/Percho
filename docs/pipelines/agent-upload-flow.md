# Agent Upload Flow — MLS Photos → Listing Reel Pipeline

**Scope**: how a Percho listing agent (GA-only, selling-only) uploads photos
for one active listing so the auto-compose pipeline (E2 pattern) can emit a
`listing-focused` reel end-to-end without human video editing.

**Non-scope**: MLS API sync (deferred, §9 open Q), video shot by agent
(Percho pitch is "agent doesn't film" — CLAUDE.md §7 alignment, memory
selling-only).

**Anchor docs**: schema.sql (D1), interfaces.md (D2), orchestration.md (D3),
cost-model.md (D4), reel-formats.md (E3), poc-output/mock-listings/ (E1),
listing-reel-v1.mp4 (E2).

---

## 0. TL;DR

| # | Layer | Where | Contract |
|---|-------|-------|----------|
| 1 | Drag-drop UI | Next.js Server Component + `'use client'` uploader | 3-20 files, JPEG/PNG/HEIC, ≤ 20 MB each |
| 2 | Signed upload URL | Next Route Handler (`POST /api/listings/:id/photos`) | zod-validated, returns 20× Supabase `createSignedUploadUrl` |
| 3 | Direct-to-Storage PUT | Browser → Supabase Storage `listing-photos` bucket | private bucket, RLS-scoped by `agent_id` |
| 4 | Storage webhook | Supabase Storage → EDF `photo-ingest` | fires on `object.created`, verifies signature |
| 5 | DB row + tag job | EDF inserts `content_items` (kind=photo) + enqueues rule-tagger | source=`agent_upload`, `neighborhood_id` from listing FK |
| 6 | Pipeline trigger | after N≥5 photos with role coverage, EDF enqueues `render_jobs` | idempotent on `(listing_id, generation)` |
| 7 | Reel ready notification | EC2 render-worker → PG NOTIFY → Realtime channel | agent dashboard shows "reel ready" toast |

**One-liner**: drag → signed URL → private bucket → storage webhook → rule
tagger → coverage check → render_job → reel. Zero synchronous work in the
Route Handler beyond issuing URLs.

---

## 1. UI: the drag-drop widget

**Route**: `app/(dashboard)/listings/[id]/photos/page.tsx` (Server Component)
+ child `PhotoUploader.tsx` (`'use client'`).

**Design goals** (memory: peach/moss/sage, object-contain, no dark):
- Dropzone: `bg-[--peach-50]` dashed border `--moss-300`, hover `--peach-100`.
- Thumbs: `aspect-[4/5] object-contain bg-[--sand-50]` (not `cover` — memory
  rule: photos always contain, never crop).
- Progress: per-file bar `bg-[--sage-500]`, no spinner emoji, no dark modal.
- Failure state: inline `text-[--terracotta-700]`, one retry button per file.

**Interaction spec**:
1. Agent lands on `/listings/:id/photos`. Server component fetches listing
   (RLS scoped to `agent_id = auth.uid()`) and existing `content_items` with
   `source_kind='agent_upload'` for this listing.
2. Empty state shows 5 role slots as ghosts: `exterior_front`,
   `kitchen`, `living_room`, `primary_bedroom`, `backyard` (matches E1
   `photo role enum` and E2 slot mapping — reel-formats.md §2).
3. Agent drops files (accept: `image/jpeg,image/png,image/heic`). Client-side
   pre-check: MIME sniff (not just extension), size ≤ 20 MB, count ≤ 20.
4. For each accepted file, client calls `POST /api/listings/:id/photos` with
   `{ files: [{name, size, mime, sha256_hex}] }`. Server returns array of
   `{ signed_url, path, item_id_placeholder }`.
5. Client `PUT`s the bytes directly to `signed_url` (no proxying through Next
   — cost-model §1.4, saves EC2 bandwidth). On 200, mark done. On any 4xx/5xx,
   surface inline error and enable retry.
6. Role assignment: after upload lands, thumbnail appears in the "unsorted"
   tray. Agent drags each thumb into one of the 5 role slots. This mutates
   `content_items.role` (see §5). Extra photos (beyond 5) go to a "gallery"
   pool with `role=null`.
7. "Generate reel" button lights up when all 5 required roles are filled.
   Click → `POST /api/listings/:id/reels` → enqueues render_job (§6).

**No feature creep**: no cropping tool, no filters, no reorder-within-role in
v1. Role slot is one-photo-per-slot; drop replaces.

---

## 2. API: `POST /api/listings/:id/photos`

**Handler**: `app/api/listings/[id]/photos/route.ts`.

**Auth**: `createRouteHandlerClient` (anon key + user JWT from cookie). RLS
policy on `listings` scopes SELECT to `agent_id = auth.uid()`. 404 (not 403)
if listing not owned — don't leak existence.

**Zod input** (`lib/zod/photo-upload.ts`):
```ts
export const PhotoUploadRequest = z.object({
  files: z.array(z.object({
    name:       z.string().min(1).max(255),
    size:       z.number().int().positive().max(20 * 1024 * 1024),
    mime:       z.enum(['image/jpeg', 'image/png', 'image/heic']),
    sha256_hex: z.string().regex(/^[a-f0-9]{64}$/),
  })).min(1).max(20),
});
```

**Flow**:
1. Validate zod. On failure return 400 with issue list.
2. Look up listing by id + `agent_id = auth.uid()` (single query, RLS
   enforced). Miss → 404.
3. Check dedupe: for each `sha256_hex`, if `content_items.sha256` already
   exists for this `listing_id`, return the existing `id` + `path` (idempotent
   — schema.sql UNIQUE sha256, D1 §alignment). Same requirement as E2
   Fetcher contract (interfaces §3).
4. For each new file, generate object path:
   `listing-photos/{agent_id}/{listing_id}/{content_item_id}.{ext}` where
   `content_item_id` is a fresh uuid v4 pre-inserted into `content_items`
   with `status='pending_upload'`. This is the reservation.
5. Call `supabase.storage.from('listing-photos').createSignedUploadUrl(path)`.
   TTL default 2 hours. Return `{ signed_url, path, item_id }`.
6. Do NOT run tagger or render here. Route Handler stays under 200 ms.

**Rate limit**: 60 requests / agent / minute via `upstash/ratelimit` on
`agent_id`. Rejects at 429. Prevents runaway retry loops from a buggy client.

**Error surface**:
- 400 zod / MIME / size
- 404 listing not owned
- 409 too many pending uploads (>50 open reservations older than 10 min)
- 429 rate limit
- 500 Supabase Storage upstream

---

## 3. Storage bucket layout & RLS

**Bucket**: `listing-photos` (private, not public — memory: no exposed URLs
until the reel ships, minimizes accidental listing leak).

**Path scheme**: `{agent_id}/{listing_id}/{content_item_id}.{ext}`.
- Includes `agent_id` so RLS policy is a prefix check (no join needed on
  hot path).
- `content_item_id` (uuid) as filename → globally unique, avoids collisions
  and side-channel leaking listing address in filenames.

**RLS policies** (added in migration alongside `content_items`):

```sql
-- SELECT: agent can read own listing photos
create policy "agent_read_own_photos" on storage.objects
  for select using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- INSERT: only via signed URL (bucket-level, no separate policy needed —
-- signed URLs bypass RLS by design, but we scope path server-side in §2.4)

-- DELETE: agent can delete own photos, but only if no ready composition
-- references them (schema.sql: publishes → compositions ON DELETE RESTRICT
-- covers the receipt side; content_items → compositions.clip_ids gin also
-- needs guard at app layer)
create policy "agent_delete_own_photos" on storage.objects
  for delete using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (
      select 1 from compositions c
      where c.status in ('ready','published')
      and c.clip_ids @> array[
        (storage.foldername(name))[3]::uuid  -- content_item_id
      ]
    )
  );
```

**Delivery for the reel pipeline**: EC2 render-worker uses the
`SUPABASE_SERVICE_ROLE_KEY` (allowed caller per CLAUDE.md §3 — worker is a
secured server context, not a browser bundle) to `createSignedUrl` at
render time with 1-hour TTL. It streams bytes into ffmpeg via a temp file.
Never exposes the signed URL to the browser.

---

## 4. Storage → EDF webhook (photo-ingest)

**Trigger**: Supabase Storage `object.created` event on bucket
`listing-photos`.

**Handler**: Supabase Edge Function `photo-ingest` (Deno TS — orchestration
§4 alignment: rule-tagger side lives in EDF, source of truth in Deno TS,
not Python).

**Verify**:
- Signature: HMAC of body with `SUPABASE_WEBHOOK_SECRET` (CLAUDE.md §3 rule 5).
- Path shape: must match `{uuid}/{uuid}/{uuid}.{ext}` — reject anything else.

**Flow**:
1. Parse path → `agent_id`, `listing_id`, `content_item_id`.
2. Update `content_items` row: `status='ingested'`,
   `storage_path=<full_path>`, `bytes=<from event>`, `ingested_at=now()`.
3. If MIME is HEIC, enqueue a `convert_heic` job (a separate EC2 side-task —
   ffmpeg + libheif, keeps EDF snappy). Otherwise skip.
4. Enqueue rule-tagger inline (EDF-native, no external queue): call
   `tagger.rule` (Deno port of `tag_rules.py`, orchestration §4) with
   `{ content_item_id, source_kind: 'agent_upload', role_hint: null }`.
   Writes to `tags` table.
5. Emit `photo_ingested` event on `job_events` (orchestration §5) with
   `{ agent_id, listing_id, content_item_id }` — dashboard subscribes via
   Supabase Realtime to update the thumb from "uploading" → "ready".

**Idempotency**: If `content_items.status` is already `>= 'ingested'`, no-op.
Supabase Storage occasionally re-fires webhooks on retry.

**PII**: log `content_item_id` and `listing_id`, never `storage_path`
containing the full agent uuid at info level (CLAUDE.md §3 rule 6).

---

## 5. Role assignment (client-driven, not ML)

v1 rule: **the agent assigns role by drag-drop** into the 5 named slots.
No auto-classification.

Why:
- Cost: an ML classifier per photo adds a Sonnet vision call (~$0.003) that
  the agent already does for free by looking. cost-model.md §1.2 budget is
  tight.
- Precision: getting "primary bedroom" vs "guest bedroom" wrong on a
  listing reel is a hard failure. Human labeling is 100%.
- Simplicity: no model to version, no drift, no eval harness.

**API**: `PATCH /api/listings/:id/photos/:item_id` with
`{ role: 'exterior_front' | 'kitchen' | 'living_room' | 'primary_bedroom' | 'backyard' | null }`.
Updates `content_items.role`. Bumps `updated_at` (schema.sql trigger).

**Constraint**: unique `(listing_id, role)` where role IS NOT NULL. Enforced
at DB level:

```sql
create unique index content_items_listing_role_uniq
  on content_items(listing_id, role)
  where role is not null and source_kind = 'agent_upload';
```

Setting role on photo A when photo B already holds that role → 409 in the
Route Handler (catch unique violation, return "swap or clear first").

---

## 6. Reel trigger: coverage → render_job

**Endpoint**: `POST /api/listings/:id/reels`.

**Preconditions** (checked in Route Handler):
1. Listing status is `active` or `pending` (not `withdrawn` or `sold`).
2. All 5 roles filled with `content_items` where `status='ingested'` AND
   tagger has run (`tagged_at IS NOT NULL`).
3. At most 3 open (`status IN ('queued','rendering')`) `compositions` for
   this listing — prevents runaway on repeated clicks.

**Insert** (single transaction):
```sql
insert into compositions (
  id, listing_id, neighborhood_id, format,
  plan, clip_ids, status, generation, created_at
) values (
  gen_random_uuid(),
  :listing_id,
  (select neighborhood_id from listings where id = :listing_id),
  'listing_reel_57s',
  :plan_jsonb,   -- built server-side from E2 template + this listing's data
  :clip_ids,     -- 5 photo uuids + up to 4 broll uuids from neighborhood pool
  'queued',
  coalesce((select max(generation)+1 from compositions where listing_id=:listing_id), 1),
  now()
);

insert into render_jobs (composition_id, status, priority, created_at)
values (:composition_id, 'queued', 50, now());
```

The EC2 render-worker polls `render_jobs where status='queued'` (existing
systemd — orchestration §4), locks with `for update skip locked`, executes
the E2 pipeline (run_e2.py logic in the worker), writes output to CF Stream,
updates `compositions.status='ready'` and `compositions.stream_uid`.

**Plan construction** (server-side, no LLM): pulls listing fields
`{town, price_usd, beds, baths}` → interpolates into the E2 caption
template (reel-formats §3 `ListingSlotContext`). Broll pulled from
`content_items where neighborhood_id=... and source_kind IN ('wikimedia','openverse')`
using ranker priority `hook>aerial>skyline>motion>landmark_wide>signage`
(interfaces §4). Fully deterministic → byte-identical re-render possible
(interfaces §5 requirement).

**Idempotency**: `unique(listing_id, generation)` on `compositions`. Two
concurrent clicks race but only one row lands; the loser returns the
winner's `composition_id`.

---

## 7. Agent-facing states (dashboard sub-page)

The photos page also shows the reel status for this listing:

| State | Meaning | UI |
|-------|---------|----|
| `no_photos` | 0 uploads | dropzone, no "generate" button |
| `partial` | 1-4 roles filled | dropzone + assignment tray |
| `ready_to_generate` | 5 roles filled | "Generate reel" primary button |
| `queued` | render_job inserted, worker not started | disabled button + "in queue" pill |
| `rendering` | worker locked the row | progress pill "~90s" (cost-model §1.3 wall time) |
| `ready` | composition.status='ready' | preview player (video, object-contain, muted, playsinline) + "Publish" button |
| `failed` | worker set status='failed' | error card + "Retry" (new render_job, same composition or new generation) |

Realtime channel `listings:<listing_id>:compositions` pushes transitions.
Client subscribes on mount, unsubscribes on unmount. Fallback poll every
15 s if socket drops.

---

## 8. Costs & guardrails

Per E2 listing reel, straight from cost-model.md §1:
- 5 photos × 4 MB average = 20 MB storage → $0.0005/mo
- render 90 s CPU on t3.medium → $0.00104
- rule-tag 5 photos (no LLM, orchestration §4) → $0
- broll fetch: reused from neighborhood pool → $0 marginal
- **Marginal per listing reel: ~$0.006** (vs $0.038 for a neighborhood reel
  with LLM tagging).

Listing reels are the cheaper format because photos come pre-labeled by the
agent — no Sonnet call. This aligns with the reel-formats.md §5 insight
that listing reels are cheaper at scale.

**Guardrails** (CLAUDE.md §7):
- 20 MB / file, 20 files / listing hard cap in zod.
- Rate limit 60 req/min/agent on signed-URL endpoint.
- 3 open compositions max per listing.
- Storage lifecycle: photos on withdrawn listings deleted after 90 days
  (cron job, not this doc's scope — flag for F3).

---

## 9. Open questions (for F3)

1. **MLS auto-import**: FMLS/GAMLS API pull vs manual upload — which
   ships first? Manual is Percho's differentiator ("agent controls the
   narrative"), but auto-import is the growth lever. Cost-model impact
   unclear; would replace §1-2 for many listings.
2. **HEIC conversion latency**: iPhone HEIC needs libheif → ffmpeg round
   trip. Adds ~2 s per photo on EC2. Move to browser-side WASM (canvas
   toBlob after decode) to keep ingest cheap? Risk: mobile Safari WASM
   memory.
3. **Multi-generation UX**: agent uploads new photos → new generation of
   composition. Do we auto-expire the old reel's CF Stream copy, or keep
   both for A/B? Cost-model §4 retention creep sensitivity relevant.
4. **Bulk upload for repeat listings**: an agent with 30 active listings
   won't drag-drop each. Deferred to v2, but schema.sql already supports
   it (compositions.generation is per-listing).

---

## 10. Alignment check

- **Memory: GA-only** → listings table has `state='GA'` CHECK (schema.sql).
  API 404s if listing.state ≠ 'GA' (server-side gate, not just UI).
- **Memory: selling-only** → uploader lives in `/listings/[id]/photos`, an
  active-listing sub-page. No "saved home" or buyer-side gallery path.
  Every reel plan uses selling CTA ("See homes → percho.com/...").
- **Memory: no bilingual schema** → captions built from ListingSlotContext
  are English-only in `compositions.plan`. Multilingual variants (per
  memory: multilingual buyer pool) belong to the future
  `caption_by_locale` field on the marketing surface, not this schema.
- **CLAUDE.md §1 conflict**: doc mentions "multilingual buyers" as memory
  context but doesn't emit any non-English fields into `compositions.plan`
  or Storage paths. Logged, no code impact.
- **Visual rule**: dropzone + thumbs use peach/moss/sage tokens, all
  images `object-contain`. No dark modal.
- **CLAUDE.md §3 security**: service-role only on EC2 worker + EDF; browser
  uses anon key + signed upload URLs; RLS on Storage bucket path prefix;
  webhook HMAC verification; no PII logged at info.
- **CLAUDE.md §6 forbidden**: no ORM (raw supabase-js), no barrel files, no
  `any` (zod-first), no inline secrets.
- **Zero app/ changes**: this is a design doc, not code.

---

**Delivery**: `docs/pipelines/agent-upload-flow.md` (this file). No other
files touched.
