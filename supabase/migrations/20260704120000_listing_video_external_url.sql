-- Phase 70.11 (2026-07-04): allow listing_videos to reference an external
-- mp4 URL instead of a Cloudflare Stream video id. Enables demo/mock
-- listings that ship a pre-rendered slideshow served from /public/demo/
-- (or any external host) without going through the CF Stream pipeline.
--
-- Constraint: at least one source must be present (cf_video_id OR
-- external_url). The old table-level UNIQUE on cf_video_id is replaced
-- with a partial unique index so multiple external-only rows (each with
-- cf_video_id NULL) don't collide on NULL.

alter table public.listing_videos
  alter column cf_video_id drop not null;

alter table public.listing_videos
  add column if not exists external_url text;

-- Drop the auto-named unique constraint from the original CREATE TABLE.
alter table public.listing_videos
  drop constraint if exists listing_videos_cf_video_id_key;

create unique index if not exists listing_videos_cf_video_id_unique
  on public.listing_videos (cf_video_id)
  where cf_video_id is not null;

alter table public.listing_videos
  add constraint listing_videos_source_present_check
  check (cf_video_id is not null or external_url is not null);
