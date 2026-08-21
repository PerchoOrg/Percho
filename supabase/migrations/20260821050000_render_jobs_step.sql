-- render_jobs.step — which part of the home tour a job asks the worker for.
--
-- Owner decision (2026-08-20, "1 A"): the planning logic stays in Python.
-- `photo_tagger.py` (Claude vision) and `photo_selector.build_plan` are not
-- being ported to TypeScript, so the web app cannot run those two steps
-- inline the way the community tour runs research and resolve. It enqueues
-- them instead, and the worker dispatches on this column.
--
-- The other three steps need no queue:
--   generate  — writes listing_photo_clips rows; the worker polls that table
--   assemble  — writes listing_tour_assemblies rows; likewise
--   review    — a human
--
-- Default 'render' so every job written before this, and the legacy whole-film
-- button, keeps its exact current meaning. `render` is the monolithic
-- `process_job()` path; it stays the working renderer until the per-photo clip
-- path replaces it.

alter table public.render_jobs
  add column if not exists step text not null default 'render';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'render_jobs_step_chk') then
    alter table public.render_jobs
      add constraint render_jobs_step_chk
      check (step in ('render','tag','plan')) not valid;
    alter table public.render_jobs validate constraint render_jobs_step_chk;
  end if;
end $$;

-- The worker claims by (status, step); the existing status_created index does
-- not carry step, so a tag job and a render job compete in the same scan.
create index if not exists render_jobs_step_status_idx
  on public.render_jobs (step, status, created_at)
  where status = 'queued';

comment on column public.render_jobs.step is
  'What the worker should do: render (legacy whole-film), tag (photo_tagger), or plan (build_plan, no render, no spend). Steps that are pure DB writes are done in the web app and never appear here.';
