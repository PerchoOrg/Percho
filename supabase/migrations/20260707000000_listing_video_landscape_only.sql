-- Phase 75 (2026-07-07): allow landscape-only listing_videos rows.
--
-- Before phase 75 the render worker always produced a portrait video and
-- optionally a landscape companion. Phase 75 makes it strictly one-or-the-
-- other: landscape-only when photos are ≥80% horizontal, portrait-only
-- otherwise. This means a listing_videos row may now have cf_video_id NULL
-- and cf_video_id_landscape populated — the pre-existing CHECK constraint
-- (added in 20260704120000 as listing_videos_source_present_check) rejects
-- that shape.
--
-- Extend the CHECK so any one of the three source columns is enough.

alter table public.listing_videos
  drop constraint if exists listing_videos_source_present_check;

alter table public.listing_videos
  add constraint listing_videos_source_present_check
  check (
    cf_video_id is not null
    or cf_video_id_landscape is not null
    or external_url is not null
  );
