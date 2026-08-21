-- listing_tour_runs — the home tour's pipeline run record (2026-08-21).
--
-- The community tour has had one of these since 2026-08-15
-- (`community_tour_runs`); the home tour had nothing. Its entire pipeline was
-- one Python function, `worker.py:process_job()`, which fetched the listing,
-- tagged the photos, planned the shots, rendered the film, uploaded it and
-- attached it — and recorded a single `render_jobs.error` string if any of
-- that failed. You could not tell tagging from encoding from upload, and a
-- re-run meant re-doing all of it.
--
-- Same shape as community_tour_runs on purpose: the admin surface reads
-- `step_results.<step>` and renders whatever is there, so one set of
-- components (TourStepStrip, PhotoTable) serves both pipelines.
--
-- Owner flow (2026-08-20):
--   1. tag       — Claude vision per photo, cached by listing_photos.tagged_at
--   2. review    — HUMAN. approve/reject in the table. Nothing runs itself past here.
--   3. plan      — build_plan over the surviving photos. NO render, no spend.
--   4. generate  — one clip PER PHOTO (listing_photo_clips), photo = the unit
--   5. assemble  — concat the ready clips per surface -> listing_videos
--
-- `render_jobs` is NOT dropped here. The legacy whole-film path stays the
-- working renderer until the per-photo clip path replaces it; this migration
-- only gives it a run to report into.

create table if not exists public.listing_tour_runs (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings(id) on delete cascade,
  status       text not null default 'tagging'
                 check (status in (
                   'tagging','review','planning','generating',
                   'assembling','ready','failed'
                 )),
  -- Raw per-step outputs, keyed by step name. Persisted so the admin page
  -- renders history instead of re-running steps.
  step_results jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists listing_tour_runs_listing_idx
  on public.listing_tour_runs (listing_id, created_at desc);

create trigger listing_tour_runs_touch before update on public.listing_tour_runs
  for each row execute function public.touch_updated_at();

alter table public.listing_tour_runs enable row level security;

-- Admin read only. Deliberately NARROWER than render_jobs, which lets the
-- owning agent insert its own jobs: a run drives generation that costs money,
-- and the whole surface is admin-only (owner 2026-08-20, decision 3).
-- Writes are service-role, from the step route and the render worker.
drop policy if exists "admin reads listing_tour_runs" on public.listing_tour_runs;
create policy "admin reads listing_tour_runs" on public.listing_tour_runs
  for select
  using (exists (select 1 from public.agents a where a.user_id = auth.uid() and a.is_admin = true));

-- ─── render_jobs.run_id ───────────────────────────────────────────────────
-- Nullable with no backfill: every job written before this has no run, which
-- the admin surface reads as "legacy render, no step detail" rather than as a
-- broken row. `on delete set null` because a job outliving its run is a
-- reporting gap, not a reason to delete render history.
alter table public.render_jobs
  add column if not exists run_id uuid references public.listing_tour_runs(id) on delete set null;

create index if not exists render_jobs_run_idx
  on public.render_jobs (run_id)
  where run_id is not null;

comment on column public.render_jobs.run_id is
  'The listing_tour_runs row this job reports its step_results into. NULL for jobs written before 2026-08-21.';
