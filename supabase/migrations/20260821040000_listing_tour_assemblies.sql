-- listing_tour_assemblies — the home tour's final concat, per surface (2026-08-21).
--
-- Mirrors `tour_assemblies` (2026-08-17), with one column the community tour
-- does not need and one it has that the home tour does not.
--
--   + surface     A home tour ships two cuts, iOS and web, from the same shot
--                 list and the same reviewed photos. They fail independently
--                 and they finish at different times, so they are two rows,
--                 not one row with two uids.
--
--   - narration   The community assembly carries a spoken script written by
--                 lib/poi/tour-orchestrator/narration.ts. The listing render
--                 path has never narrated — worker.py:848 picks BGM and
--                 nothing else — so a narration column here would be a
--                 speculative column with no writer.
--
-- `video_row_id` closes the loop back to `listing_videos`, which is what the
-- buyer-facing surfaces actually read. The assembly is the pipeline's record;
-- the listing_videos row is the published artefact.

create table if not exists public.listing_tour_assemblies (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid not null references public.listings(id) on delete cascade,
  run_id         uuid not null references public.listing_tour_runs(id) on delete cascade,
  surface        text not null check (surface in ('ios','web')),
  status         text not null default 'pending'
                   check (status in ('pending','processing','ready','failed')),
  -- The shot list this cut was assembled from, as the plan step wrote it.
  -- Carried rather than re-read: the film belongs to the cut it was approved
  -- against, even if the plan is re-run afterwards.
  ordered_clips  jsonb not null default '[]',
  photos_dropped jsonb not null default '[]',
  bgm            jsonb,
  cf_stream_uid  text,
  video_url      text,
  -- The listing_videos row this assembly published into.
  video_row_id   uuid references public.listing_videos(id) on delete set null,
  error          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists listing_tour_assemblies_listing_idx
  on public.listing_tour_assemblies (listing_id, created_at desc);

create index if not exists listing_tour_assemblies_status_created_idx
  on public.listing_tour_assemblies (status, created_at)
  where status = 'pending';

create trigger listing_tour_assemblies_touch before update on public.listing_tour_assemblies
  for each row execute function public.touch_updated_at();

alter table public.listing_tour_assemblies enable row level security;

drop policy if exists "admin reads listing_tour_assemblies" on public.listing_tour_assemblies;
create policy "admin reads listing_tour_assemblies" on public.listing_tour_assemblies
  for select
  using (exists (select 1 from public.agents a where a.user_id = auth.uid() and a.is_admin = true));

comment on column public.listing_tour_assemblies.surface is
  'ios = 1080x1576 (feed card), web = 1920x1080. One row per surface: they render and fail independently.';
