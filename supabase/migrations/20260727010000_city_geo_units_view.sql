-- ─── 20260727010000_city_geo_units ────────────────────────────────
-- Read-only aggregate view backing the v3 discovery feed's Stage 1–2 geo
-- cards (spec-v3 `01-feed.md` §1.3/§1.7, PLAN-task-1 §3/§4).
--
-- WHY A VIEW. There is no geo-unit table: the only real geographic inventory
-- is 8680 `communities` rows, so a "city unit" is derived by grouping them.
-- `apps/web/lib/feed/geo-units.ts` shipped that grouping as a paged scan +
-- in-process reduce — 9 PostgREST round trips of 1000 rows each, per cache
-- miss, to produce ~109 rows. Aggregating in SQL makes it one request.
-- Owner-approved 2026-07-26 (`RUN-task-1-approved.md`).
--
-- ADDITIVE AND REVERSIBLE. Creates one view. No table is altered, no column
-- is dropped, no policy is changed, no data is written. `drop view
-- public.city_geo_units;` fully reverses it.
--
-- ─── security_invoker = true ──────────────────────────────────────
-- A Postgres view runs as its OWNER by default, which would make this a
-- silent RLS bypass on `communities` and `listings`: the view owner is the
-- table owner, and RLS does not apply to a table's owner. `security_invoker`
-- (PG 15+; the remote is 17.6) runs it as the CALLER instead, so the existing
-- "public reads communities" and "public reads active listings" policies still
-- govern every row. The view is a query shortcut, not a privilege escalation.
--
-- ─── `boundary` IS DELIBERATELY NOT SELECTED ──────────────────────
-- The Nextdoor seeds are dense multi-KB GeoJSON multipolygons. Streaming ~8k of
-- them through PostgREST hits `statement_timeout` (PG 57014) and returns
-- NOTHING AT ALL — the trap documented in `apps/web/lib/communities/list.ts`
-- and `apps/web/lib/feed/geo-units.ts`. Do not add it to this view "for
-- convenience": boundary is a per-card concern, fetched one row at a time.
-- Aggregating inside the view does not save you either; the planner still has
-- to read every boundary value to aggregate it.
--
-- ─── REAL OR ABSENT ──────────────────────────────────────────────
-- Every number here is real or NULL; nothing is estimated, defaulted, or
-- placeheld, and the API layer omits a NULL rather than rendering "—"/"N/A".
--   * `median_list_price` is NULL below an 8-listing sample. 265 active
--     listings across ~109 cities means most cities legitimately have no
--     median, and a two-listing "median" is one listing wearing a statistic's
--     clothes. The floor is enforced HERE, in SQL, so no caller can read a
--     low-n median even by accident.
--   * a city where no community has coordinates is dropped entirely rather
--     than emitted at (0,0), which is in the Gulf of Guinea.
--   * `hero_storage_path` is a storage path, not a URL. Bucket/URL shape is
--     the app's concern (`publicCoverImageUrl`), not the database's.
--
-- Listing stats are aggregated in a SEPARATE subquery, not by joining
-- listings to communities. A join would fan out one listing row per community
-- in the same city (Atlanta has 731), inflating both the median sample and the
-- community count by three orders of magnitude.

create or replace view public.city_geo_units
with (security_invoker = true) as
with community_units as (
  select
    c.city,
    c.state,
    count(*)                                                  as community_count,
    avg(c.lat) filter (where c.lat is not null and c.lng is not null) as centroid_lat,
    avg(c.lng) filter (where c.lat is not null and c.lng is not null) as centroid_lng,
    -- Deterministic across requests: the client engine ranks and dedupes on
    -- these, so an unordered agg would reshuffle the feed between pages.
    (array_agg(c.name order by c.name))[1:3]                   as sample_community_names,
    (array_agg(c.cover_storage_path order by c.name)
       filter (where c.cover_storage_path is not null))[1]     as hero_storage_path
  from public.communities c
  where c.status = 'active'
    and c.city is not null
    and c.state is not null
  group by c.city, c.state
  -- A unit with no coordinates has no map thumb and no distance math.
  having count(*) filter (where c.lat is not null and c.lng is not null) > 0
),
listing_stats as (
  select
    l.city,
    l.state,
    count(*)                                                  as active_listings,
    count(l.price) filter (where l.price > 0)                  as price_sample_size,
    percentile_cont(0.5) within group (
      order by l.price
    ) filter (where l.price is not null and l.price > 0)       as median_price
  from public.listings l
  where l.status = 'active'
    and l.city is not null
    and l.state is not null
  group by l.city, l.state
)
select
  -- Stable, level-prefixed id: "city:decatur-ga". Must match the slug the
  -- mobile engine builds, or a right-swipe credits a unit that isn't in the pool.
  'city:' || trim(both '-' from regexp_replace(
    lower(u.city || '-' || u.state), '[^a-z0-9]+', '-', 'g'
  ))                                              as id,
  'city'::text                                    as level,
  u.city                                          as name,
  u.state                                         as state,
  u.centroid_lat,
  u.centroid_lng,
  u.hero_storage_path,
  u.community_count,
  u.sample_community_names,
  -- The 8-listing floor, enforced in SQL. Both columns go NULL together so a
  -- reader can never pair a median with a missing sample size.
  case when s.price_sample_size >= 8 then round(s.median_price) end
                                                  as median_list_price,
  case when s.price_sample_size >= 8 then s.price_sample_size end
                                                  as median_sample_size,
  nullif(s.active_listings, 0)                    as active_listings
from community_units u
left join listing_stats s
  on s.city = u.city and s.state = u.state;

comment on view public.city_geo_units is
  'City-level geo units for the v3 discovery feed, derived by grouping active communities on (city, state). security_invoker=true so the callers RLS still applies. boundary is deliberately NOT selected — ~8k dense multipolygons cause PostgREST statement_timeout (57014). median_list_price/median_sample_size are NULL below an 8-listing sample (no fabricated medians); a city with no community coordinates is dropped rather than emitted at (0,0). Read by apps/web/lib/feed/geo-units.ts.';

-- Buyer-facing and anonymous: the mobile feed hits /api/mobile/feed with the
-- anon key. RLS on the underlying tables still governs which rows aggregate.
grant select on public.city_geo_units to anon, authenticated;
