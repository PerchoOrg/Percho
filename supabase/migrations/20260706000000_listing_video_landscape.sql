-- dual-orientation rendered videos.
--
-- The render worker produces a portrait 1080x1920 video for the swipe feed
-- (default). When ≥80% of the listing's photos are landscape, it also
-- produces a 1920x1080 landscape video for the fullscreen toggle. The
-- landscape asset is optional — most listings only carry the portrait one.
--
-- We store the landscape Cloudflare Stream uid in a new nullable column
-- rather than a second listing_videos row, so the feed player can decide
-- at render time whether to expose the fullscreen button without a second
-- join. Same partial-unique-index shape as the portrait cf_video_id.

alter table public.listing_videos
  add column if not exists cf_video_id_landscape text;

create unique index if not exists listing_videos_cf_landscape_unique
  on public.listing_videos (cf_video_id_landscape)
  where cf_video_id_landscape is not null;
