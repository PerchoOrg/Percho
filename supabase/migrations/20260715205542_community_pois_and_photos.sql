-- Phase 92 (2026-07-15) — community-owned POI/photo/video pipeline.
--
-- Phase 91 moved video ownership onto communities. Phase 92 does the same for
-- POI discovery + photo review. New tables mirror the listing_pois /
-- listing_poi_photos shape but key on community_id instead of listing_id.
--
-- Old listing-level tables (`listing_pois`, `listing_poi_photos`) stay in
-- place for Phase 92 — the UI for reviewing photos still lives in the
-- listing dashboard, and we cut it over to community_* in Phase 93 once
-- the community dashboard has the review UI wired. Backend server actions
-- switch to community_* immediately in this phase.
--
-- Data disposition (per owner 07-15):
--   * No listing_pois / listing_poi_photos rows are migrated forward. The
--     agent will re-run POI discovery at the community level. Existing rows
--     stay in their tables (dashboard still reads them for backward compat
--     during Phase 92 → 93 transition) but new content flows to community_*.
--   * pois table itself is community-agnostic (globally shared by google_place_id),
--     no change needed there.
--
-- What this migration does NOT do:
--   * Drop listing_pois / listing_poi_photos.
--   * Cut over the review UI.
--   * Delete legacy `community_videos.category` / `kind` columns.

------------------------------------------------------------
-- 1. community_pois — per-community POI candidates
------------------------------------------------------------
create table if not exists public.community_pois (
  community_id  uuid not null references public.communities(id) on delete cascade,
  poi_id        uuid not null references public.pois(id) on delete cascade,
  intent_bucket text not null
                  check (intent_bucket in (
                    'schools','dining','nightlife','shopping','outdoor','fitness','kids',
                    'asian_community','daily_errands','faith','work_hubs','healthcare',
                    'pets','transit'
                  )),
  distance_m    integer,                        -- straight-line from community anchor
  status        text not null default 'candidate'
                  check (status in ('candidate','approved','rejected','archived')),
  ai_score      numeric(3,2),
  discovered_at timestamptz not null default now(),
  reviewed_at   timestamptz,
  primary key (community_id, poi_id)
);

create index if not exists community_pois_status_idx
  on public.community_pois (community_id, status);
create index if not exists community_pois_bucket_idx
  on public.community_pois (community_id, intent_bucket);

alter table public.community_pois enable row level security;

-- Authenticated agents can read/update community_pois for any community
-- (communities are shared, per 0013's ownership model — any agent can edit).
create policy "agents read community_pois"
  on public.community_pois for select
  using (auth.role() = 'authenticated');
create policy "agents write community_pois"
  on public.community_pois for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

------------------------------------------------------------
-- 2. community_poi_photos — per-community photo review state
------------------------------------------------------------
create table if not exists public.community_poi_photos (
  community_id uuid not null references public.communities(id) on delete cascade,
  poi_photo_id uuid not null references public.poi_photos(id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending','approved','rejected')),
  reviewed_at  timestamptz,
  primary key (community_id, poi_photo_id)
);

create index if not exists community_poi_photos_status_idx
  on public.community_poi_photos (community_id, status);

alter table public.community_poi_photos enable row level security;

create policy "agents read community_poi_photos"
  on public.community_poi_photos for select
  using (auth.role() = 'authenticated');
create policy "agents write community_poi_photos"
  on public.community_poi_photos for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

------------------------------------------------------------
-- 3. generated_videos — extend scope enum for community-level jobs
------------------------------------------------------------
--
-- Phase 91 added `community_id` + XOR check. But `scope` still enforces
-- (poi | intent_bucket | listing) — none of those match "community-owned
-- intent_bucket video". Widen the enum to include 'community_intent_bucket'.
-- Old scope values stay valid so any lingering rows survive.

alter table public.generated_videos
  drop constraint if exists generated_videos_scope_check;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'generated_videos_scope_chk') then
    alter table public.generated_videos
      add constraint generated_videos_scope_chk
      check (scope in ('poi','intent_bucket','listing','community_intent_bucket')) not valid;
    alter table public.generated_videos validate constraint generated_videos_scope_chk;
  end if;
end $$;
