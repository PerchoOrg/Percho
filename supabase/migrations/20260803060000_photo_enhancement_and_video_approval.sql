-- Photo enhancement pipeline (2026-08-03) + explicit video approval gate.
--
-- WHY THESE COLUMNS AND NOT A NEW TABLE:
--   Enhancement is a 1:1 derived artifact of a photo row — one enhanced JPEG
--   per source photo, same bucket, same lifecycle (delete the photo, the
--   enhanced file is orphaned either way). A side table would need its own RLS,
--   its own join in every render query, and would still be 1:1. Columns on the
--   existing rows keep the render worker's SELECT unchanged apart from the
--   column list.
--
-- The enhanced file is NEVER used implicitly. `enhanced_status` must be
-- 'approved' (owner clicked Approve in /admin) before any render reads it;
-- 'ready' means the file exists and is awaiting review. That is the exit
-- criterion: view original + enhanced, manage, validate, then it takes effect.

-- ── listing photos ──────────────────────────────────────────────────────
alter table public.listing_photos
  add column if not exists enhanced_path    text,
  add column if not exists enhanced_status  text not null default 'none'
    check (enhanced_status in ('none','queued','processing','ready','approved','rejected','failed')),
  add column if not exists enhanced_preset  text,
  add column if not exists enhanced_meta    jsonb,
  add column if not exists enhanced_at      timestamptz,
  add column if not exists enhanced_error   text;

create index if not exists listing_photos_enhanced_status_idx
  on public.listing_photos (enhanced_status)
  where enhanced_status in ('queued','processing');

-- ── POI photos (community tour + nearby source pool) ────────────────────
alter table public.poi_photos
  add column if not exists enhanced_path    text,
  add column if not exists enhanced_status  text not null default 'none'
    check (enhanced_status in ('none','queued','processing','ready','approved','rejected','failed')),
  add column if not exists enhanced_preset  text,
  add column if not exists enhanced_meta    jsonb,
  add column if not exists enhanced_at      timestamptz,
  add column if not exists enhanced_error   text;

create index if not exists poi_photos_enhanced_status_idx
  on public.poi_photos (enhanced_status)
  where enhanced_status in ('queued','processing');

-- ── video approval gate ─────────────────────────────────────────────────
-- `listing_videos.status` is constrained to processing/ready/error, so approval
-- cannot live there without breaking the Cloudflare webhook (which writes
-- 'ready' on encode completion and would clobber an approval). Separate column.
--
-- Backfill: every EXISTING ready row is grandfathered to approved. Without this,
-- turning the gate on would empty the mobile feed of every video that is
-- already live on the owner's phone.
alter table public.listing_videos
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id);

update public.listing_videos
   set approved_at = coalesce(approved_at, now())
 where status = 'ready';

comment on column public.listing_videos.approved_at is
  'Non-null = admin approved this render for the buyer-facing feed. The mobile feed (/api/mobile/feed) serves only approved rows. Backfilled for pre-2026-08-03 ready rows.';

-- `generated_videos.status` already has 'approved' in its CHECK, and
-- `community_videos.status` mirrors listing_videos, so give it the same gate.
alter table public.community_videos
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id);

update public.community_videos
   set approved_at = coalesce(approved_at, now())
 where status = 'ready';
