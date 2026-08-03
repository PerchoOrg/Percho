-- Persist WHICH photos a listing tour actually used.
--
-- The admin photo table needs a "used in video?" column. For POI photos that
-- data already exists (`generated_videos.input_photo_ids`), but for listing
-- photos the shot plan was written to `shot_plan.json` in the render job's temp
-- workdir and deleted with it — so the column would have been permanently empty
-- on the listing side.
--
-- The worker already holds the plan in memory when it renders, so persisting it
-- is one PATCH. Two columns rather than a bool: the clip ORDER is the useful
-- part when you're asking "why did the tour open on the bathroom".
alter table public.listing_photos
  add column if not exists used_in_video_at timestamptz,
  add column if not exists used_clip_index  integer;

comment on column public.listing_photos.used_in_video_at is
  'When this photo was last selected by the shot planner for a rendered tour. NULL = the planner skipped it (unusable, deduped, or over its room-type quota).';
comment on column public.listing_photos.used_clip_index is
  '0-based position in the rendered tour, NULL when unused. Clip 0 is the opening shot.';
