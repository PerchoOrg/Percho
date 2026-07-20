-- Phase 60 — Schools data pipeline
-- Model:
--   schools           : one row per K-12 school (external-sourced, no owner)
--   school_reviews    : GreatSchools parent reviews (verbatim, star + text)
--   school_photos     : mined photos (Bing→patch/townnews/gcps + Google Places)
--                       stored as bucket-relative keys in Supabase Storage
--   attendance_zones  : GA county GeoJSON polygons — house→zoned school lookup
--   get_school_pipeline(lat,lng) → 3 schools (elem/mid/high) for a coordinate
--
-- Provenance:
--   source = 'greatschools' | 'niche' | 'gcps' | 'manual'
--   All rows have source_id (NCES 8-digit ID preferred) → cross-source join key.
--   §11 external-provenance pattern: no owner_id, admin-only writes via RLS.
--   §12 buyer-facing SELECT: anon read policy on schools/photos/reviews.
--   §9  photos store bucket-relative keys ('gs-school-id/hash.jpg'), resolver
--       prepends 'school-photos/' from constant.

-- Enable PostGIS for attendance zone polygons (§10.3 pattern for point-in-poly)
create extension if not exists postgis;

-- ============ schools ============
create table if not exists public.k12_schools (
  id                    uuid primary key default gen_random_uuid(),
  nces_id               text,                              -- 8-digit federal ID (join key)
  gs_school_id          text,                              -- GreatSchools numeric id
  niche_id              text,
  name                  text not null,
  address               text,
  city                  text,
  state                 text default 'GA',
  zip                   text,
  county                text,
  district              text,
  lat                   double precision,
  lng                   double precision,
  geom                  geography(Point, 4326),            -- indexed for KNN queries
  school_type           text,                              -- public|charter|magnet|private
  grade_range           text,                              -- 'PK-5' | '6-8' | '9-12'
  level                 text,                              -- 'elementary'|'middle'|'high'
  phone                 text,
  website               text,
  enrollment            int,
  student_teacher_ratio int,
  gs_rating             smallint check (gs_rating between 1 and 10),
  parent_rating         numeric(3,2),
  review_count          int default 0,
  test_scores           jsonb default '{}'::jsonb,
  awards                jsonb default '[]'::jsonb,          -- Blue Ribbon, state champs
  mascot                text,
  colors                text[],
  source                text not null,
  source_url            text,
  raw                   jsonb default '{}'::jsonb,          -- keep original payload for re-parse
  scraped_at            timestamptz default now(),
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- Uniqueness (real constraints, not partial indexes — PostgREST on_conflict compat, §3)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'k12_schools_gs_id_key') then
    alter table public.k12_schools add constraint k12_schools_gs_id_key unique (gs_school_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'k12_schools_nces_id_key') then
    alter table public.k12_schools add constraint k12_schools_nces_id_key unique (nces_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'k12_schools_source_chk') then
    alter table public.k12_schools
      add constraint k12_schools_source_chk
      check (source in ('greatschools','niche','gcps','fulton','forsyth','cobb','cherokee','manual'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'k12_schools_level_chk') then
    alter table public.k12_schools
      add constraint k12_schools_level_chk
      check (level is null or level in ('elementary','middle','high','k8','other'));
  end if;
end $$;

-- Indexes for the "nearest 3 schools by level" pipeline
create index if not exists k12_schools_geom_gist on public.k12_schools using gist (geom);
create index if not exists k12_schools_level_idx on public.k12_schools (level, gs_rating desc);
create index if not exists k12_schools_city_idx  on public.k12_schools (state, city);
create index if not exists k12_schools_district_idx on public.k12_schools (district);

-- Auto-populate geom when lat/lng set
create or replace function public.k12_schools_set_geom() returns trigger language plpgsql as $$
begin
  if new.lat is not null and new.lng is not null then
    new.geom := st_setsrid(st_makepoint(new.lng, new.lat), 4326)::geography;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists k12_schools_set_geom_trg on public.k12_schools;
create trigger k12_schools_set_geom_trg
  before insert or update on public.k12_schools
  for each row execute function public.k12_schools_set_geom();

-- ============ school_reviews ============
create table if not exists public.k12_school_reviews (
  id             uuid primary key default gen_random_uuid(),
  gs_review_id   text,                              -- GS review guid, unique if present
  school_id      uuid not null references public.k12_schools(id) on delete cascade,
  reviewer_type  text,                              -- 'parent'|'student'|'teacher'
  star_rating    smallint check (star_rating between 1 and 5),
  review_date    date,
  review_text    text,
  topical_ratings jsonb default '{}'::jsonb,        -- {teachers:5, safety:4, ...}
  would_recommend boolean,
  school_response text,
  source          text not null default 'greatschools',
  scraped_at      timestamptz default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'k12_school_reviews_gs_id_key') then
    alter table public.k12_school_reviews add constraint k12_school_reviews_gs_id_key unique (gs_review_id);
  end if;
end $$;

create index if not exists k12_school_reviews_school_idx on public.k12_school_reviews (school_id, star_rating desc);

-- ============ school_photos ============
-- Storage: bucket 'school-photos', object key = '<gs_school_id>/<hash>.jpg'
-- DB stores only the object key relative to the bucket (§9.1).
create table if not exists public.k12_school_photos (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.k12_schools(id) on delete cascade,
  source         text not null,                     -- 'bing:patch','bing:townnews','gcps','google_places','maxpreps'
  source_url     text,                              -- original hosted URL (attribution)
  storage_path   text not null,                     -- 'gs-4877/a1b2c3.jpg' (bucket-relative)
  content_hash   text,                              -- sha256(bytes) for dedupe
  width          int,
  height         int,
  ai_score       numeric(3,2),                      -- 0.00-10.00 vision score
  ai_tags        jsonb default '{}'::jsonb,         -- {category, subjects, mood, ...}
  applicable_buckets text[] not null default '{}',  -- narrative slots: 'academics','sports','community','facility'
  attribution    text,                              -- required for display
  status         text not null default 'pending',   -- 'pending'|'approved'|'rejected'
  is_primary     boolean not null default false,    -- one primary per school for hero rendering
  order_idx      int default 0,
  scraped_at     timestamptz default now(),
  created_at     timestamptz default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'k12_school_photos_status_chk') then
    alter table public.k12_school_photos
      add constraint k12_school_photos_status_chk check (status in ('pending','approved','rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'k12_school_photos_hash_unique') then
    alter table public.k12_school_photos
      add constraint k12_school_photos_hash_unique unique (school_id, content_hash);
  end if;
end $$;

create index if not exists k12_school_photos_school_idx on public.k12_school_photos (school_id, status, ai_score desc);
create index if not exists k12_school_photos_buckets_gin on public.k12_school_photos using gin (applicable_buckets);
create unique index if not exists k12_school_photos_primary_uidx
  on public.k12_school_photos (school_id) where is_primary = true;

-- ============ attendance_zones ============
create table if not exists public.k12_attendance_zones (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.k12_schools(id) on delete cascade,
  level         text not null,                     -- 'elementary'|'middle'|'high'
  geometry      geography(MultiPolygon, 4326) not null,
  county        text,
  source        text,                              -- 'fulton','gwinnett','forsyth', etc.
  effective_year int,
  created_at    timestamptz default now()
);

create index if not exists k12_attendance_zones_geom_gist on public.k12_attendance_zones using gist (geometry);
create index if not exists k12_attendance_zones_school_idx on public.k12_attendance_zones (school_id);

-- ============ get_school_pipeline(lat, lng) RPC ============
-- Returns 3 schools (elem/mid/high) for a coordinate. In demo mode, uses nearest
-- by level. Once attendance_zones are seeded per-county, prefers zone match then
-- falls back to nearest.
create or replace function public.get_k12_school_pipeline(p_lat double precision, p_lng double precision)
returns table (
  level text,
  school_id uuid,
  name text,
  gs_rating smallint,
  distance_km numeric,
  in_zone boolean
)
language plpgsql
stable
as $$
declare
  pt geography := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
begin
  return query
  with per_level as (
    select
      s.level,
      s.id,
      s.name,
      s.gs_rating,
      round((st_distance(s.geom, pt) / 1000.0)::numeric, 2) as distance_km,
      exists (
        select 1 from public.k12_attendance_zones z
        where z.school_id = s.id
          and z.level = s.level
          and st_covers(z.geometry, pt)
      ) as in_zone,
      row_number() over (
        partition by s.level
        order by
          -- zone match ranks first
          case when exists (
            select 1 from public.k12_attendance_zones z
            where z.school_id = s.id and z.level = s.level and st_covers(z.geometry, pt)
          ) then 0 else 1 end,
          s.geom <-> pt
      ) as rn
    from public.k12_schools s
    where s.level in ('elementary','middle','high')
      and s.geom is not null
  )
  select p.level, p.id, p.name, p.gs_rating, p.distance_km, p.in_zone
  from per_level p
  where p.rn = 1
  order by case p.level when 'elementary' then 1 when 'middle' then 2 when 'high' then 3 end;
end $$;

grant execute on function public.get_k12_school_pipeline(double precision, double precision) to anon, authenticated;

-- ============ RLS ============
alter table public.k12_schools          enable row level security;
alter table public.k12_school_reviews   enable row level security;
alter table public.k12_school_photos    enable row level security;
alter table public.k12_attendance_zones enable row level security;

-- Public read for buyer-facing surfaces (§12 anon SELECT policy)
drop policy if exists "public reads k12_schools"        on public.k12_schools;
create policy "public reads k12_schools"        on public.k12_schools        for select to anon, authenticated using (true);

drop policy if exists "public reads k12_school_reviews" on public.k12_school_reviews;
create policy "public reads k12_school_reviews" on public.k12_school_reviews for select to anon, authenticated using (true);

drop policy if exists "public reads approved k12_school_photos" on public.k12_school_photos;
create policy "public reads approved k12_school_photos" on public.k12_school_photos
  for select to anon, authenticated
  using (status = 'approved');

drop policy if exists "public reads k12_attendance_zones" on public.k12_attendance_zones;
create policy "public reads k12_attendance_zones" on public.k12_attendance_zones
  for select to anon, authenticated using (true);

-- Admin-only writes (§11 external-provenance pattern)
drop policy if exists "admin writes k12_schools" on public.k12_schools;
create policy "admin writes k12_schools" on public.k12_schools
  for all to authenticated
  using (exists (select 1 from public.agents a where a.user_id = auth.uid() and a.is_admin = true))
  with check (exists (select 1 from public.agents a where a.user_id = auth.uid() and a.is_admin = true));

drop policy if exists "admin writes k12_school_reviews" on public.k12_school_reviews;
create policy "admin writes k12_school_reviews" on public.k12_school_reviews
  for all to authenticated
  using (exists (select 1 from public.agents a where a.user_id = auth.uid() and a.is_admin = true))
  with check (exists (select 1 from public.agents a where a.user_id = auth.uid() and a.is_admin = true));

drop policy if exists "admin writes k12_school_photos" on public.k12_school_photos;
create policy "admin writes k12_school_photos" on public.k12_school_photos
  for all to authenticated
  using (exists (select 1 from public.agents a where a.user_id = auth.uid() and a.is_admin = true))
  with check (exists (select 1 from public.agents a where a.user_id = auth.uid() and a.is_admin = true));

drop policy if exists "admin writes k12_attendance_zones" on public.k12_attendance_zones;
create policy "admin writes k12_attendance_zones" on public.k12_attendance_zones
  for all to authenticated
  using (exists (select 1 from public.agents a where a.user_id = auth.uid() and a.is_admin = true))
  with check (exists (select 1 from public.agents a where a.user_id = auth.uid() and a.is_admin = true));

comment on table  public.k12_schools          is 'K-12 schools scraped from GreatSchools/Niche/GCPS. External-provenance (§11), no owner. Anon read, admin write.';
comment on table  public.k12_school_photos    is 'Mined photos. storage_path is bucket-relative (§9.1) — bucket "school-photos". is_primary=true → hero.';
comment on table  public.k12_attendance_zones is 'County-published attendance polygons. seeded from GA open-data GeoJSON per county.';
comment on function public.get_k12_school_pipeline is 'Given a house coordinate, return 3 schools (elem/mid/high). Prefers attendance zone match, falls back to nearest.';
