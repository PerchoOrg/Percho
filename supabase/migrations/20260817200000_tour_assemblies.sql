-- Community tour final assembly (2026-08-17).
--
-- Owner flow: user approves the final shot list (shown in the TourPipeline
-- Assemble panel), then this row drives the render-worker's concat job.
-- Reusing the generated_videos pattern: pending → worker claims → ready.
--
-- `ordered_clips` is the FINAL shot list (jsonb array), each entry:
--   { photo_id, poi_id, poi_name, category, engine, duration_s,
--     clip_id, clip_storage_path }
-- Only clips with status='ready' are allowed in. `photos_dropped` records
-- why photos were excluded (unusable / no ready clip / over POI cap).

create table if not exists public.tour_assemblies (
  id              uuid primary key default gen_random_uuid(),
  community_id    uuid not null references public.communities(id) on delete cascade,
  run_id          uuid not null references public.community_tour_runs(id) on delete cascade,
  status          text not null default 'pending'
                    check (status in ('pending','processing','ready','failed')),
  ordered_clips   jsonb not null default '[]',
  photos_dropped  jsonb not null default '[]',
  cf_stream_uid   text,
  video_url       text,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists tour_assemblies_community_idx
  on public.tour_assemblies (community_id, created_at desc);

alter table public.tour_assemblies enable row level security;

drop policy if exists "admin reads tour_assemblies" on public.tour_assemblies;
create policy "admin reads tour_assemblies" on public.tour_assemblies
  for select
  using (exists (select 1 from public.agents a where a.user_id = auth.uid() and a.is_admin = true));
