-- listing_videos: a per-surface uid counts as a source (2026-08-21).
--
-- `listing_videos_source_present_check` has said "cf_video_id is not null or
-- external_url is not null" since 2026-07-04, when those were the only two
-- ways a row could point at a video. Two more arrived afterwards and the
-- constraint was never widened:
--
--   cf_video_id_landscape   2026-07-06, the 16:9 web asset
--   cf_video_id_square      2026-07-28, the asset the iOS feed card plays
--
-- Nothing noticed, because every writer since has been an UPDATE. The API
-- route creates the row with `cf_video_id` set and the render worker patches
-- the surface columns onto it, so a row has never been INSERTed with only a
-- surface uid — until the home tour's assemble step, which publishes one
-- surface at a time and has no portrait render to name.
--
-- Widening only ACCEPTS more rows, so every existing row still satisfies it
-- and the validation pass cannot fail. Re-added `not valid` then validated
-- anyway, to keep the lock short on a table the dashboard reads.

alter table public.listing_videos
  drop constraint if exists listing_videos_source_present_check;

alter table public.listing_videos
  add constraint listing_videos_source_present_check
  check (
    cf_video_id is not null
    or cf_video_id_landscape is not null
    or cf_video_id_square is not null
    or external_url is not null
  ) not valid;

alter table public.listing_videos
  validate constraint listing_videos_source_present_check;
