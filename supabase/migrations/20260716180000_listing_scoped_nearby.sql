-- listing-scoped nearby pipeline.
--
-- Motivation: today the nearby (POI) content pipeline is exclusively
-- community-scoped. Every listing must sit inside a curated community to
-- get nearby videos — coverage is not 100%. Per product decision
-- (2026-07-16 owner call): every listing must show nearby videos regardless
-- of community coverage. POIs and their photos remain GLOBAL (keyed on
-- google_place_id / google_photo_name), so a POI already discovered for
-- a community is reused when a listing anchors discovery against itself.
-- Only the JOIN rows (which POIs belong to which listing/community, with
-- intent_bucket + review status) are duplicated.
--
-- Design:
--   * Reintroduce `listing_pois` + `listing_poi_photos` with the SAME shape
--     as `community_pois` / `community_poi_photos` (14-value intent bucket
--     check, status enum, timestamps). These were dropped this morning in
--     20260716120000; row counts at drop time were dev/seed only, no live
--     consumers. Reusing the names — no *_v2 noise.
--   * Extend `generated_videos_scope_chk` with 'listing_intent_bucket'.
-- `generated_videos_owner_chk` (added ) already requires exactly
--     one of (listing_id, community_id); listing-scoped nearby videos set
--     listing_id and leave community_id null.
--   * RLS: listing_pois / listing_poi_photos are OWNER-SCOPED via the
--     listings→agents chain (unlike communities, which are shared). Server-
--     side discovery uses the service role and bypasses RLS.
--   * poi_photos SELECT: add a listing-owner-scoped policy so agents whose
--     listings reference a poi can read its photos (parallel to the
--     community_pois policy from 20260716120000).
--
-- Concurrent-render / cross-bucket dedup / video-superseding rules all
-- follow the existing community-scoped pattern (community-video-actions.ts,
-- ). Listing-scoped code paths ported in follow-up commits.

------------------------------------------------------------
-- 1. listing_pois — per-listing POI candidates
------------------------------------------------------------
create table if not exists public.listing_pois (
  listing_id    uuid not null references public.listings(id) on delete cascade,
  poi_id        uuid not null references public.pois(id) on delete cascade,
  intent_bucket text not null
                  check (intent_bucket in (
                    'schools','dining','nightlife','shopping','outdoor','fitness','kids',
                    'asian_community','daily_errands','faith','work_hubs','healthcare',
                    'pets','transit'
                  )),
  distance_m    integer,                        -- straight-line from listing lat/lng
  status        text not null default 'candidate'
                  check (status in ('candidate','approved','rejected','archived')),
  ai_score      numeric(3,2),
  discovered_at timestamptz not null default now(),
  reviewed_at   timestamptz,
  primary key (listing_id, poi_id)
);

create index if not exists listing_pois_status_idx
  on public.listing_pois (listing_id, status);
create index if not exists listing_pois_bucket_idx
  on public.listing_pois (listing_id, intent_bucket);

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
-- 2. listing_poi_photos — per-listing photo review state
------------------------------------------------------------
create table if not exists public.listing_poi_photos (
  listing_id   uuid not null references public.listings(id) on delete cascade,
  poi_photo_id uuid not null references public.poi_photos(id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending','approved','rejected')),
  reviewed_at  timestamptz,
  primary key (listing_id, poi_photo_id)
);

create index if not exists listing_poi_photos_status_idx
  on public.listing_poi_photos (listing_id, status);

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
-- 3. poi_photos: extend SELECT policy for listing-scoped references
------------------------------------------------------------
-- The community_pois-scoped SELECT policy (from 20260716120000) covers reads
-- for POIs referenced by any shared community. Add a parallel policy so
-- agents can read photos of POIs referenced by their own listings.
do $$ begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'poi_photos'
       and policyname = 'agent reads poi_photos for referenced listing_pois'
  ) then
    create policy "agent reads poi_photos for referenced listing_pois"
      on public.poi_photos
      for select
      using (
        poi_id in (
          select lp.poi_id from public.listing_pois lp
            join public.listings l on l.id = lp.listing_id
            join public.agents a on a.id = l.agent_id
          where a.user_id = auth.uid()
        )
      );
  end if;
end $$;

------------------------------------------------------------
-- 4. generated_videos: widen scope enum for listing_intent_bucket
------------------------------------------------------------
-- Existing constraint (from 20260715205542) allows
-- ('poi','intent_bucket','listing','community_intent_bucket'). Add
-- 'listing_intent_bucket' — the new scope for POI-anchored videos owned
-- by a listing directly.
--
-- generated_videos_owner_chk still enforces XOR of
-- listing_id / community_id; listing_intent_bucket rows set listing_id
-- and leave community_id null.

alter table public.generated_videos
  drop constraint if exists generated_videos_scope_chk;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'generated_videos_scope_chk') then
    alter table public.generated_videos
      add constraint generated_videos_scope_chk
      check (scope in (
        'poi','intent_bucket','listing',
        'community_intent_bucket','listing_intent_bucket'
      )) not valid;
    alter table public.generated_videos validate constraint generated_videos_scope_chk;
  end if;
end $$;
