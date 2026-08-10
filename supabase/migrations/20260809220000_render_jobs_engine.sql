-- Which motion engine renders the clips.
--
-- Owner 2026-08-09: after comparing both catalogues, keep Ken Burns and add
-- DepthFlow 2.5D parallax as a selectable alternative rather than replacing
-- one with the other.
--
--   kenburns  -> ffmpeg zoompan (scripts/ken-burns/generate.py, unchanged)
--   depthflow -> DepthFlow parallax over a Depth Anything V2 Small depth map
--
-- NULL = kenburns. Every queued-but-unprocessed row and both agent-facing
-- routes keep behaving exactly as before, same as the `orientations` column
-- added on 2026-08-03.
alter table public.render_jobs
  add column if not exists engine text
    check (engine is null or engine in ('kenburns', 'depthflow'));

comment on column public.render_jobs.engine is
  'Motion engine for the per-photo camera move: kenburns (ffmpeg zoompan) or depthflow (2.5D parallax). NULL = kenburns.';
