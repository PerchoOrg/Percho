-- A city's community count means "communities you can look at" (phase191.1).
--
-- The count and the three sample names in `city_geo_units` are buyer-facing:
-- the feed's city picker reads "Duluth · 310 communities" and lists three of
-- them by name. Both were `count(*)` / `array_agg` over every active community
-- in the city, which was the same thing as "communities with a photo" only
-- because all 8,678 Nextdoor seeds happen to have a cover.
--
-- phase191 breaks that: the county plat import adds thousands of subdivisions
-- per county that carry a boundary and nothing else — no photo, no
-- description. They exist so a listing can be matched to the right polygon,
-- not to be browsed. Counting them would take Lawrenceville from 293 to ~1,300
-- and put photoless names in the picker (owner's call, 2026-09-07).
--
-- Everything else in the view is unchanged, including the centroid, which
-- deliberately still averages ALL the coordinates in the city — more points
-- make a better centre, whether or not each has a picture.
create or replace view public.city_geo_units
with (security_invoker = true) as
with community_units as (
  select
    c.city,
    c.state,
    count(*) filter (where c.cover_storage_path is not null)   as community_count,
    avg(c.lat) filter (where c.lat is not null and c.lng is not null) as centroid_lat,
    avg(c.lng) filter (where c.lat is not null and c.lng is not null) as centroid_lng,
    -- Deterministic across requests: the client engine ranks and dedupes on
    -- these, so an unordered agg would reshuffle the feed between pages.
    (array_agg(c.name order by c.name)
       filter (where c.cover_storage_path is not null))[1:3]    as sample_community_names,
    (array_agg(c.cover_storage_path order by c.name)
       filter (where c.cover_storage_path is not null))[1]     as hero_storage_path
  from public.communities c
  where c.status = 'active'
    and c.city is not null
    and c.state is not null
  group by c.city, c.state
  -- A unit with no coordinates has no map thumb and no distance math; a unit
  -- with nothing to look at is not a place the picker can offer.
  having count(*) filter (where c.lat is not null and c.lng is not null) > 0
     and count(*) filter (where c.cover_storage_path is not null) > 0
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
  'City-level geo units for the v3 discovery feed, derived by grouping active communities on (city, state). security_invoker=true so the callers RLS still applies. boundary is deliberately NOT selected — ~8k dense multipolygons cause PostgREST statement_timeout (57014). community_count and sample_community_names count only communities WITH a cover photo, so the plat-imported subdivisions (boundary only, no content) stay out of a buyer-facing number. median_list_price/median_sample_size are NULL below an 8-listing sample (no fabricated medians); a city with no community coordinates, or none with a photo, is dropped rather than emitted at (0,0). Read by apps/web/lib/feed/geo-units.ts.';

grant select on public.city_geo_units to anon, authenticated;
