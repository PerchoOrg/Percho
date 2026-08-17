-- photo_clips: carry the orchestrator's decisions instead of re-deriving them
-- in each worker (2026-08-17).
--
-- Until now the render worker picked a Ken Burns mode itself from a hash of
-- the photo id (worker.py POI_CLIP_MODES) and the seedance worker sent one
-- hardcoded prompt for every clip. Both decisions now belong to the Scheduler
-- and the Guard (apps/web/lib/poi/tour-orchestrator), which are pure and
-- tested; the workers read what was decided.
--
--   move          the camera move. Ken Burns mode, DepthFlow move, or the
--                 Seedance camera token (camera_fixed / drift_in / …).
--   prompt        the assembled Seedance prompt, mandatory clauses included.
--                 NULL for locally rendered clips.
--   ai_generated  per-clip AI-generation disclosure. Written at plan time, not
--                 inferred from `engine` at render time, so a clip that was
--                 downgraded away from Seedance cannot keep a stale label.
--
-- vo_line deliberately does NOT live here: photo_clips is a global per-photo
-- cache reused across communities, and narration belongs to one tour's shot
-- list (tour_assemblies.ordered_clips).

alter table public.photo_clips
  add column if not exists move         text,
  add column if not exists prompt       text,
  add column if not exists ai_generated boolean not null default false;

comment on column public.photo_clips.move is
  'Camera move chosen by the tour Scheduler (Ken Burns mode / DepthFlow move / Seedance camera token).';
comment on column public.photo_clips.prompt is
  'Assembled Seedance prompt including the verbatim mandatory clauses. NULL for kenburns/depthflow.';
comment on column public.photo_clips.ai_generated is
  'Per-clip AI-generation disclosure, set by the Guard at plan time.';
