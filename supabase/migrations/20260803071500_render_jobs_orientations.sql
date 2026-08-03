-- Per-surface render targeting.
--
-- Owner 2026-08-03: "There should be two buttons for generate video, one for web
-- one for iOS". A render job now says WHICH output shapes it wants, so
-- re-rendering the iOS asset does not touch the web one (and vice versa).
--
-- NULL = render every shape the worker's default list carries (square +
-- landscape). That keeps the pre-existing single-button path, the agent-facing
-- /api/listings/[id]/generate-tour route, and any queued-but-unprocessed row
-- behaving exactly as before this migration.
alter table public.render_jobs
  add column if not exists orientations text[];

comment on column public.render_jobs.orientations is
  'Which output shapes to render: subset of {square,landscape,portrait}. square -> cf_video_id_square (iOS feed card), landscape -> cf_video_id_landscape (web). NULL = render the worker default (both).';
