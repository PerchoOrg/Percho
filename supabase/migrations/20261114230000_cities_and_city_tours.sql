-- ─── cities + the city film pipeline (phase318) ─────────────────────────────
--
-- Owner 2026-11-14: cards will run country → state → city → community → home;
-- city and community first. A city card is like a community card but general —
-- the place's highlights — while still saying what is unique about it. And:
-- "单独建一套城市表" — cities get their own tables rather than a `kind` column
-- on `communities`.
--
-- The film pipeline is mirrored table-for-table from the community one, the
-- same way listings already mirror it (`listing_tour_runs`, `listing_pois`, …):
--
--   community_tour_runs   → city_tour_runs
--   community_pois        → city_pois
--   community_poi_photos  → city_poi_photos
--   tour_assemblies       → city_tour_assemblies
--
-- `pois`, `poi_photos` and `photo_clips` stay shared: a place, its photos and
-- their rendered clips are the same whichever film uses them.
--
-- RLS is tighter than the community tables' original "any authenticated user"
-- policies (phase306 / phase308.6 had to close those): buyers read an active
-- city and its places; everything else is admin-only, and the pipeline writes
-- with the service role.

begin;

create table if not exists public.cities (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  name               text not null,
  state              text not null default 'GA',
  county             text,
  -- The film's centre: the town centre, not the polygon centroid.
  lat                double precision,
  lng                double precision,
  -- The feed's city unit this card stands for (`city_geo_units.id`, e.g.
  -- 'city:suwanee-ga'), so the app can put the film on the existing card.
  geo_unit_id        text unique,
  website            text,
  description        text,
  -- What a buyer should know at a glance: [{ label, fact }]. Written by the
  -- research step, edited by hand.
  highlights         jsonb not null default '[]',
  cover_storage_path text,
  status             text not null default 'active'
                       check (status in ('active', 'inactive')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.city_tour_runs (
  id           uuid primary key default gen_random_uuid(),
  city_id      uuid not null references public.cities(id) on delete cascade,
  status       text not null default 'researching'
                 check (status in (
                   'researching','resolving','fetching_photos','tagging',
                   'review','generating','assembled','failed'
                 )),
  step_results jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists city_tour_runs_city_idx
  on public.city_tour_runs (city_id, created_at desc);

create table if not exists public.city_pois (
  city_id       uuid not null references public.cities(id) on delete cascade,
  poi_id        uuid not null references public.pois(id) on delete cascade,
  intent_bucket text not null
                  check (intent_bucket in (
                    'amenities',
                    'schools','dining','nightlife','shopping','outdoor','fitness','kids',
                    'asian_community','daily_errands','faith','work_hubs','healthcare',
                    'pets','transit',
                    'civic','waterfront','other'
                  )),
  distance_m    integer,
  status        text not null default 'candidate'
                  check (status in ('candidate','approved','rejected','archived')),
  ai_score      numeric(3,2),
  discovered_at timestamptz not null default now(),
  reviewed_at   timestamptz,
  primary key (city_id, poi_id)
);
create index if not exists city_pois_status_idx on public.city_pois (city_id, status);

create table if not exists public.city_poi_photos (
  city_id      uuid not null references public.cities(id) on delete cascade,
  poi_photo_id uuid not null references public.poi_photos(id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending','approved','rejected')),
  reviewed_at  timestamptz,
  primary key (city_id, poi_photo_id)
);
create index if not exists city_poi_photos_status_idx
  on public.city_poi_photos (city_id, status);

create table if not exists public.city_tour_assemblies (
  id              uuid primary key default gen_random_uuid(),
  city_id         uuid not null references public.cities(id) on delete cascade,
  run_id          uuid not null references public.city_tour_runs(id) on delete cascade,
  status          text not null default 'pending'
                    check (status in ('pending','processing','ready','failed')),
  ordered_clips   jsonb not null default '[]',
  photos_dropped  jsonb not null default '[]',
  narration       jsonb,
  bgm             jsonb,
  cf_stream_uid   text,
  video_url       text,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists city_tour_assemblies_city_idx
  on public.city_tour_assemblies (city_id, created_at desc);

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.cities enable row level security;
alter table public.city_tour_runs enable row level security;
alter table public.city_pois enable row level security;
alter table public.city_poi_photos enable row level security;
alter table public.city_tour_assemblies enable row level security;

create policy "public reads active cities" on public.cities
  for select using (status = 'active');
create policy "admin manages cities" on public.cities
  for all
  using (exists (select 1 from public.agents a where a.user_id = auth.uid() and a.is_admin))
  with check (exists (select 1 from public.agents a where a.user_id = auth.uid() and a.is_admin));

create policy "public reads city_pois of active cities" on public.city_pois
  for select using (
    exists (select 1 from public.cities c where c.id = city_id and c.status = 'active')
  );
create policy "admin manages city_pois" on public.city_pois
  for all
  using (exists (select 1 from public.agents a where a.user_id = auth.uid() and a.is_admin))
  with check (exists (select 1 from public.agents a where a.user_id = auth.uid() and a.is_admin));

create policy "admin manages city_poi_photos" on public.city_poi_photos
  for all
  using (exists (select 1 from public.agents a where a.user_id = auth.uid() and a.is_admin))
  with check (exists (select 1 from public.agents a where a.user_id = auth.uid() and a.is_admin));

create policy "admin reads city_tour_runs" on public.city_tour_runs
  for select
  using (exists (select 1 from public.agents a where a.user_id = auth.uid() and a.is_admin));

create policy "admin reads city_tour_assemblies" on public.city_tour_assemblies
  for select
  using (exists (select 1 from public.agents a where a.user_id = auth.uid() and a.is_admin));

commit;
