-- Square (1:1) listing tour variant for the new feed card.
--
-- Why a third column instead of reusing `cf_video_id`:
--   `cf_video_id`           = 9:16 portrait (never populated in production)
--   `cf_video_id_landscape` = 16:9  (what every production row actually has)
--   `cf_video_id_square`    = 1:1   (NEW — the feed card's inline video block)
--
-- The 2026-07-28 card redesign puts the video in a 1:1 inline block so the
-- source photos (1024x686 from FMLS) land at 1.57x upscale instead of the 2.80x
-- a 1080x1920 portrait canvas forced. The Ken Burns pan is baked into the render
-- (left/right travel only, source height fully preserved), so the client does no
-- cropping and no animation.
--
-- Additive and nullable: rows without a square render keep working and the feed
-- falls back to landscape → portrait.
alter table public.listing_videos
  add column if not exists cf_video_id_square text;

comment on column public.listing_videos.cf_video_id_square is
  '1:1 Cloudflare Stream uid for the feed card''s inline video block (1080x1080, Ken Burns pan baked in). Preferred over cf_video_id_landscape by the mobile feed.';

-- The source-present CHECK predates this column, so a square-only row (every
-- other uid NULL) is rejected with 23514 and the worker's post-render PATCH
-- fails AFTER a successful render + Cloudflare upload — the render is wasted and
-- the row is left status='error'. Exactly the Phase 75 failure re-run: that
-- migration had to extend the same constraint when landscape-only rows appeared.
-- Extend it again so any one of the FOUR source columns satisfies it.
alter table public.listing_videos
  drop constraint if exists listing_videos_source_present_check;

alter table public.listing_videos
  add constraint listing_videos_source_present_check
  check (
    cf_video_id is not null
    or cf_video_id_landscape is not null
    or cf_video_id_square is not null
    or external_url is not null
  );
