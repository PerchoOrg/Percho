-- Add 'mixed' to render_jobs.engine and make it the default choice.
--
-- Owner 2026-08-09: "ken burns 和 depthflow 两种可以混合渲染 各取所长". The two
-- engines are good at opposite things and one number decides which is which --
-- how much of a photo the canvas cannot show at once. Ken Burns can travel
-- across a photo the canvas has to crop; DepthFlow gives real parallax but its
-- motion has to stay small, so it goes to the photos with nothing to reveal.
--
--   mixed      -> per-clip choice (scripts/ken-burns/depthflow_modes.pick_engines)
--   kenburns   -> ffmpeg zoompan everywhere
--   depthflow  -> parallax everywhere
--
-- The last two stay for side-by-side comparison. NULL still means kenburns, so
-- rows queued before this migration are unaffected -- the default is applied by
-- the API route for NEW jobs, not by a backfill.
alter table public.render_jobs
  drop constraint if exists render_jobs_engine_check;

alter table public.render_jobs
  add constraint render_jobs_engine_check
    check (engine is null or engine in ('kenburns', 'depthflow', 'mixed'));

comment on column public.render_jobs.engine is
  'Motion engine for the per-photo camera move: mixed (per-clip choice), '
  'kenburns (ffmpeg zoompan) or depthflow (2.5D parallax). NULL = kenburns, '
  'for rows queued before the column existed.';
