-- POI content pipeline v1 (nearby POI + photo + review).
--
-- Design principle: POIs and their photos are GLOBAL (keyed by Google's
-- place_id / photo_name). Same Publix used by 100 listings = 1 row in `pois`,
-- 10 rows in `poi_photos`, N rows in `listing_pois` / `listing_poi_photos`.
-- This lets us amortize Google Places Photo API cost + Claude vision tagging
-- across every listing that references the same POI. Per-listing review
-- state (approve/reject, intent bucket, drive time) lives in join tables.
--
-- v0 scope: schema + review-event capture. Discovery, photo fetch, tagging,
-- and video generation land in follow-up phases (see docs/poi-content-pipeline.md
-- §7 rollout plan).
--
-- Legacy cleanup: 0001_init created a manual-entry `pois` table
-- (community-scoped, source_url + recorded_by audit fields). Zero rows,
-- zero code references. This migration replaces it with the global
-- google_place_id-keyed design. The dead `poi_id` columns on
-- community_photos / community_videos (also 0 non-null rows) are dropped
-- with the old FKs.
--
-- RLS: reads gated by listing ownership through the agent chain, same pattern
-- as render_jobs. Writes for global `pois`/`poi_photos` come from server-side
-- service-role calls only (never client) — clients never see these rows
-- directly, they see the listing-scoped join tables.

------------------------------------------------------------
-- Legacy cleanup
------------------------------------------------------------
alter table if exists public.community_videos
  drop constraint if exists community_videos_poi_fk;
alter table if exists public.community_photos
  drop constraint if exists community_photos_poi_id_fkey;
alter table if exists public.community_videos drop column if exists poi_id;
alter table if exists public.community_photos drop column if exists poi_id;
drop table if exists public.pois cascade;

------------------------------------------------------------
-- 3.1 pois: global POI registry (one per google_place_id)
------------------------------------------------------------
create table public.pois (
  id                 uuid primary key default gen_random_uuid(),
  google_place_id    text not null unique,
  display_name       text not null,
  formatted_address  text,
  primary_type       text,
  types              text[],
  rating             numeric(2,1),
  user_ratings_total integer,
  business_status    text,
  location           point,                     -- (lng, lat)
  raw_place          jsonb,                     -- full Google response, for re-derivation
  ai_tags            jsonb,                     -- Claude tags of the POI itself
  ai_summary         text,
  ai_model           text,                      -- e.g. 'claude-sonnet-4-5'
  discovered_at      timestamptz not null default now(),
  refreshed_at       timestamptz not null default now(),
  tagged_at          timestamptz
);

create index pois_primary_type_idx on public.pois (primary_type);
create index pois_location_gist_idx on public.pois using gist (location);

alter table public.pois enable row level security;
-- Policies on `pois` are defined after listing_pois exists (they reference it).

------------------------------------------------------------
-- 3.2 listing_pois: per-listing POI view (join + review status)
------------------------------------------------------------
create table public.listing_pois (
  listing_id    uuid not null references public.listings(id) on delete cascade,
  poi_id        uuid not null references public.pois(id) on delete cascade,
  intent_bucket text not null
                  check (intent_bucket in ('walkable','daily_drive','lifestyle','commute')),
  distance_m    integer,                        -- straight-line for now
  drive_time_s  integer,                        -- populated by Directions later
  status        text not null default 'candidate'
                  check (status in ('candidate','approved','rejected','archived')),
  ai_score      numeric(3,2),
  discovered_at timestamptz not null default now(),
  reviewed_at   timestamptz,
  primary key (listing_id, poi_id)
);

create index listing_pois_status_idx on public.listing_pois (listing_id, status);
create index listing_pois_bucket_idx on public.listing_pois (listing_id, intent_bucket);

alter table public.listing_pois enable row level security;

create policy "agent reads own listing_pois" on public.listing_pois
  for select using (
    listing_id in (
      select l.id from public.listings l
        join public.agents a on a.id = l.agent_id
      where a.user_id = auth.uid()
    )
  );

create policy "agent updates own listing_pois" on public.listing_pois
  for update using (
    listing_id in (
      select l.id from public.listings l
        join public.agents a on a.id = l.agent_id
      where a.user_id = auth.uid()
    )
  );
-- Inserts come from server-side discovery (service role).

------------------------------------------------------------
-- 3.3 poi_photos: global photo registry (dedup by google_photo_name)
------------------------------------------------------------
create table public.poi_photos (
  id                 uuid primary key default gen_random_uuid(),
  poi_id             uuid not null references public.pois(id) on delete cascade,
  source             text not null
                       check (source in ('google_places','google_streetview')),
  google_photo_name  text unique,               -- 'places/xxx/photos/yyy' or streetview pano_id-based
  storage_path       text not null,             -- Supabase Storage, path convention: poi/{poi_id}/{hash}.jpg
  width_px           integer,
  height_px          integer,
  bytes              integer,
  attribution        jsonb,                     -- REQUIRED by Google TOS: {authorAttributions:[...]}
  ai_tags            jsonb,                     -- {scene, mood, subjects[], usable, reason}
  ai_score           numeric(3,2),
  ai_model           text,                      -- 'claude-sonnet-4-5'
  created_at         timestamptz not null default now(),
  tagged_at          timestamptz
);

create index poi_photos_poi_idx on public.poi_photos (poi_id);

alter table public.poi_photos enable row level security;

create policy "agent reads poi_photos for referenced pois" on public.poi_photos
  for select using (
    poi_id in (
      select lp.poi_id from public.listing_pois lp
        join public.listings l on l.id = lp.listing_id
        join public.agents a on a.id = l.agent_id
      where a.user_id = auth.uid()
    )
  );
-- Server-side service-role writes only.

------------------------------------------------------------
-- 3.4 listing_poi_photos: per-listing photo review state
------------------------------------------------------------
create table public.listing_poi_photos (
  listing_id   uuid not null references public.listings(id) on delete cascade,
  poi_photo_id uuid not null references public.poi_photos(id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending','approved','rejected')),
  reviewed_at  timestamptz,
  primary key (listing_id, poi_photo_id)
);

create index listing_poi_photos_status_idx on public.listing_poi_photos (listing_id, status);

alter table public.listing_poi_photos enable row level security;

create policy "agent reads own listing_poi_photos" on public.listing_poi_photos
  for select using (
    listing_id in (
      select l.id from public.listings l
        join public.agents a on a.id = l.agent_id
      where a.user_id = auth.uid()
    )
  );

create policy "agent writes own listing_poi_photos" on public.listing_poi_photos
  for all using (
    listing_id in (
      select l.id from public.listings l
        join public.agents a on a.id = l.agent_id
      where a.user_id = auth.uid()
    )
  ) with check (
    listing_id in (
      select l.id from public.listings l
        join public.agents a on a.id = l.agent_id
      where a.user_id = auth.uid()
    )
  );

------------------------------------------------------------
-- 3.5 poi_traffic: per-listing drive-time cache
------------------------------------------------------------
create table public.poi_traffic (
  id                uuid primary key default gen_random_uuid(),
  listing_id        uuid not null references public.listings(id) on delete cascade,
  poi_id            uuid references public.pois(id) on delete cascade,    -- null = commute anchor
  destination_label text,                       -- e.g. 'Downtown Atlanta' when poi_id is null
  time_bucket       text not null
                      check (time_bucket in ('morning_peak','midday','evening_peak','weekend_noon')),
  duration_free_s   integer,
  duration_actual_s integer,
  congestion_ratio  numeric(3,2) generated always as (
    duration_actual_s::numeric / nullif(duration_free_s, 0)
  ) stored,
  fetched_at        timestamptz not null default now()
);

create index poi_traffic_listing_idx on public.poi_traffic (listing_id, time_bucket);

alter table public.poi_traffic enable row level security;

create policy "agent reads own poi_traffic" on public.poi_traffic
  for select using (
    listing_id in (
      select l.id from public.listings l
        join public.agents a on a.id = l.agent_id
      where a.user_id = auth.uid()
    )
  );

------------------------------------------------------------
-- 3.6 review_events: training data (the crown jewel)
--
-- Every human review action lands here as a structured event. Downstream:
--   - fits POI selection classifier
--   - fits photo quality classifier
--   - refines Claude vision prompts (before/after tag diffs)
-- Never mutate rows in this table — insert-only audit log.
------------------------------------------------------------
create table public.review_events (
  id            bigserial primary key,
  listing_id    uuid not null references public.listings(id) on delete cascade,
  entity_type   text not null
                  check (entity_type in ('listing_poi','listing_poi_photo','tag','narrative','video')),
  entity_ref    jsonb not null,                 -- composite pointer, e.g. {poi_id} or {poi_photo_id}
  action        text not null
                  check (action in ('approve','reject','edit_tag','edit_narrative','reorder','comment')),
  reason_tags   text[],                         -- enum list, mirrored in lib/poi/review-reasons.ts
  human_note    text,
  ai_prediction jsonb,                          -- snapshot of AI decision at review time (for diffing)
  human_value   jsonb,                          -- what the human set it to (for edits)
  reviewer_id   uuid,                           -- auth.users.id
  created_at    timestamptz not null default now()
);

create index review_events_listing_idx on public.review_events (listing_id, entity_type, created_at desc);
create index review_events_train_idx on public.review_events (entity_type, action);

alter table public.review_events enable row level security;

create policy "agent reads own review events" on public.review_events
  for select using (
    listing_id in (
      select l.id from public.listings l
        join public.agents a on a.id = l.agent_id
      where a.user_id = auth.uid()
    )
  );

create policy "agent inserts own review events" on public.review_events
  for insert with check (
    listing_id in (
      select l.id from public.listings l
        join public.agents a on a.id = l.agent_id
      where a.user_id = auth.uid()
    )
    and reviewer_id = auth.uid()
  );

------------------------------------------------------------
-- 3.7 generated_videos: renderer output, tied to listing
------------------------------------------------------------
create table public.generated_videos (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references public.listings(id) on delete cascade,
  scope           text not null
                    check (scope in ('poi','intent_bucket','listing')),
  scope_id        uuid,                         -- pois.id when scope='poi'
  intent_bucket   text
                    check (intent_bucket is null or intent_bucket in ('walkable','daily_drive','lifestyle','commute')),
  cf_stream_uid   text,                         -- Cloudflare Stream video UID
  duration_s      numeric(5,2),
  aspect_ratio    text default '9:16',
  input_photo_ids uuid[],                       -- poi_photos.id array (provenance)
  narrative       jsonb,                        -- scene beats, transitions, captions
  generator       text,                         -- 'ffmpeg_slideshow' | 'heartmula' | ...
  status          text not null default 'pending'
                    check (status in ('pending','processing','ready','approved','rejected','failed')),
  error           text,
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz
);

create index generated_videos_listing_idx on public.generated_videos (listing_id, status);

alter table public.generated_videos enable row level security;

create policy "agent reads own generated_videos" on public.generated_videos
  for select using (
    listing_id in (
      select l.id from public.listings l
        join public.agents a on a.id = l.agent_id
      where a.user_id = auth.uid()
    )
  );

create policy "agent updates own generated_videos" on public.generated_videos
  for update using (
    listing_id in (
      select l.id from public.listings l
        join public.agents a on a.id = l.agent_id
      where a.user_id = auth.uid()
    )
  );
-- Inserts come from the render worker (service role).

------------------------------------------------------------
-- Deferred policies (require tables from later sections)
------------------------------------------------------------
-- pois: agent can read a POI iff at least one of their listings references it.
create policy "agent reads pois referenced by own listings" on public.pois
  for select using (
    id in (
      select lp.poi_id from public.listing_pois lp
        join public.listings l on l.id = lp.listing_id
        join public.agents a on a.id = l.agent_id
      where a.user_id = auth.uid()
    )
  );
-- No client write policies on pois — server-side service-role only.
