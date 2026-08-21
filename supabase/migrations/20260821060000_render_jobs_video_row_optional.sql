-- render_jobs.video_row_id becomes optional (2026-08-21).
--
-- The column has been `not null references listing_videos(id)` since 2026-07-05,
-- when every job in this table was a whole-film render and therefore had a
-- video row to write into. `step` (previous migration) put two jobs in here
-- that produce no video at all:
--
--   tag   runs photo_tagger over the listing's photos
--   plan  runs build_plan and writes a shot list
--
-- Neither has a listing_videos row to point at, and inventing one so the
-- constraint passes would put a phantom video on the listing's Media tab.
--
-- The FK stays. Only the NOT NULL goes, so a render job still cannot reference
-- a video that does not exist.

alter table public.render_jobs
  alter column video_row_id drop not null;

comment on column public.render_jobs.video_row_id is
  'The listing_videos row a render job writes into. NULL for step=tag and step=plan, which produce no video.';
