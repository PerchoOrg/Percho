-- phase169 (store-launch phase D): public schools from free official data.
--
-- `k12_schools` was seeded with 15 GreatSchools rows around Norcross, which
-- is neither coverage nor a rating we may show in a store app. The import
-- script `scripts/admin/import-ga-schools.ts` fills the table statewide from
-- NCES CCD (directory) + NCES EDGE (coordinates) + GA DOE Milestones
-- (proficiency), all public-domain. This migration:
--   1. allows `source = 'nces'`;
--   2. adds the lookup the listing page reads — nearest OPEN, NON-CHARTER
--      public school per level within a radius, with the fields the card
--      shows. `get_k12_school_pipeline` (gs_rating only) is left as is.
--
-- "Nearest" is NOT "assigned": `k12_attendance_zones` is empty, so
-- `in_zone` is false everywhere today and the app labels the block
-- accordingly. Zone polygons, when seeded, flip it without a code change.

alter table public.k12_schools drop constraint if exists k12_schools_source_chk;
alter table public.k12_schools
  add constraint k12_schools_source_chk
  check (source in ('greatschools','niche','gcps','fulton','forsyth','cobb','cherokee','manual','nces'));

create or replace function public.get_k12_nearest_schools(
  p_lat double precision,
  p_lng double precision,
  p_max_km double precision default 10
)
returns table (
  level text,
  school_id uuid,
  name text,
  district text,
  grade_range text,
  distance_km numeric,
  in_zone boolean,
  test_scores jsonb,
  enrollment int
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
      s.district,
      s.grade_range,
      round((st_distance(s.geom, pt) / 1000.0)::numeric, 2) as distance_km,
      exists (
        select 1 from public.k12_attendance_zones z
        where z.school_id = s.id and z.level = s.level and st_covers(z.geometry, pt)
      ) as in_zone,
      s.test_scores,
      s.enrollment,
      row_number() over (
        partition by s.level
        order by
          case when exists (
            select 1 from public.k12_attendance_zones z
            where z.school_id = s.id and z.level = s.level and st_covers(z.geometry, pt)
          ) then 0 else 1 end,
          s.geom <-> pt
      ) as rn
    from public.k12_schools s
    where s.level in ('elementary','middle','high')
      and s.geom is not null
      and s.school_type = 'public'
      and st_dwithin(s.geom, pt, p_max_km * 1000.0)
  )
  select p.level, p.id, p.name, p.district, p.grade_range, p.distance_km, p.in_zone, p.test_scores, p.enrollment
  from per_level p
  where p.rn = 1
  order by case p.level when 'elementary' then 1 when 'middle' then 2 when 'high' then 3 end;
end $$;

grant execute on function public.get_k12_nearest_schools(double precision, double precision, double precision) to anon, authenticated;

comment on function public.get_k12_nearest_schools is
  'Nearest open non-charter public school per level within p_max_km of a coordinate. Zone match first when zones exist. Not an assignment — verify with the district.';
