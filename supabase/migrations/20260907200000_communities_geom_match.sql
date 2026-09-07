-- Community matching moves into Postgres (phase189).
--
-- `lib/geo/find-community.ts` used to pull every community boundary into the
-- Next.js function and ray-cast in JS. At 8,679 Nextdoor seeds that broke in
-- two ways: supabase-js caps an unpaged select at 1,000 rows, so the matcher
-- only ever saw the first 1,000 communities and a listing inside any other
-- polygon silently stayed unlinked; and the full payload is ~140 MB per cold
-- cache, which is not a thing a request handler can do.
--
-- Same pattern as k12_attendance_zones (20260718020000): geography columns
-- kept by trigger, GIST-indexed, and one RPC that prefers a boundary hit and
-- otherwise returns the NEAREST community within 250 m with its distance —
-- so a point just outside a hand-drawn edge still gets its community, the
-- caller can tell a real containment from a fallback, and a point far from
-- everything gets nothing rather than a wrong link. Owner rule 2026-09-07:
-- when a subdivision and a Nextdoor
-- neighbourhood both contain the point, the subdivision wins; among equals
-- the smaller polygon wins (the nested one).

-- ============ geography columns ============
alter table public.communities
  add column if not exists boundary_geom geography(MultiPolygon, 4326),
  add column if not exists anchor_geom   geography(Point, 4326);

comment on column public.communities.boundary_geom is
  'Derived from boundary by trigger. 11 Nextdoor seeds are not valid OGC polygons; st_makevalid + collectionextract(3) keeps their polygonal part.';
comment on column public.communities.anchor_geom is
  'Derived from lat/lng by trigger. KNN key for the nearest-community fallback.';

create or replace function public.communities_set_geom() returns trigger
language plpgsql as $$
begin
  if new.boundary is null then
    new.boundary_geom := null;
  else
    new.boundary_geom := st_multi(st_collectionextract(
      st_makevalid(st_setsrid(st_geomfromgeojson(new.boundary::text), 4326)), 3
    ))::geography;
  end if;
  if new.lat is null or new.lng is null then
    new.anchor_geom := null;
  else
    new.anchor_geom := st_setsrid(st_makepoint(new.lng::float8, new.lat::float8), 4326)::geography;
  end if;
  return new;
end $$;

drop trigger if exists communities_set_geom_trg on public.communities;
create trigger communities_set_geom_trg
  before insert or update of boundary, lat, lng on public.communities
  for each row execute function public.communities_set_geom();

-- Backfill without going through the trigger (so touch_updated_at does not
-- rewrite updated_at on 8,680 rows).
update public.communities set
  boundary_geom = case when boundary is null then null else st_multi(st_collectionextract(
    st_makevalid(st_setsrid(st_geomfromgeojson(boundary::text), 4326)), 3))::geography end,
  anchor_geom = case when lat is null or lng is null then null
    else st_setsrid(st_makepoint(lng::float8, lat::float8), 4326)::geography end;

create index if not exists communities_boundary_geom_gist on public.communities using gist (boundary_geom);
create index if not exists communities_anchor_geom_gist   on public.communities using gist (anchor_geom);

-- ============ match_community(lat, lng) RPC ============
-- At most one row: the containing community if there is one (subdivision >
-- neighbourhood, then smallest polygon), else the nearest active community
-- by boundary edge IF it is within 250 m, with the distance in metres. Past
-- 250 m the point is not in any community and no row comes back — owner
-- rule 2026-09-07: an uncapped nearest link is wrong data. 250 m covers the
-- slivers between hand-drawn Nextdoor polygons (the two unlinked listings
-- today sit 1 m and 13 m outside an edge), not a house in open country.
-- The nearest pass shortlists 25 by anchor KNN (index-backed) before paying
-- for edge distances.
create or replace function public.match_community(p_lat double precision, p_lng double precision)
returns table (
  community_id uuid,
  slug text,
  name text,
  city text,
  state text,
  kind text,
  match text,
  distance_m integer
)
language sql
stable
as $$
  with pt as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g
  ),
  hit as (
    select c.id, c.slug, c.name, c.city, c.state, c.kind, 'boundary'::text as match, 0 as distance_m
    from public.communities c, pt
    where c.status = 'active'
      and c.boundary_geom is not null
      and st_covers(c.boundary_geom, pt.g)
    order by (c.kind = 'subdivision') desc, st_area(c.boundary_geom) asc
    limit 1
  ),
  shortlist as (
    select c.*
    from public.communities c, pt
    where c.status = 'active' and c.anchor_geom is not null
    order by c.anchor_geom <-> pt.g
    limit 25
  ),
  near as (
    select c.id, c.slug, c.name, c.city, c.state, c.kind, 'nearest'::text as match,
      st_distance(coalesce(c.boundary_geom, c.anchor_geom), pt.g)::integer as distance_m
    from shortlist c, pt
    where st_dwithin(coalesce(c.boundary_geom, c.anchor_geom), pt.g, 250)
    order by st_distance(coalesce(c.boundary_geom, c.anchor_geom), pt.g)
    limit 1
  )
  select * from hit
  union all
  select * from near where not exists (select 1 from hit)
  limit 1;
$$;

grant execute on function public.match_community(double precision, double precision) to anon, authenticated;

-- ============ listings: remember how the link was made ============
-- A 'nearest' link is a fallback, not a containment; the UI needs to be able
-- to tell them apart. 'manual' is the agent's dropdown pick and is left alone
-- by the relink script.
alter table public.listings
  add column if not exists community_match text
    check (community_match in ('boundary', 'nearest', 'manual')),
  add column if not exists community_distance_m integer
    check (community_distance_m >= 0);

comment on column public.listings.community_match is
  'How community_id was set: boundary (point inside polygon), nearest (fallback, see community_distance_m), manual (agent pick). Null when community_id is null.';
