-- A community can now come from a county GIS plat layer (phase191).
--
-- `source` was 'agent' | 'nextdoor'. The subdivision backbone comes from
-- county recorded-plat layers (Gwinnett's SUBDIVISIONS, Fulton's
-- LandBase_Subdivisions, …) — public records, fetched over ArcGIS REST by
-- `scripts/admin/import-county-subdivisions.ts`. That is neither of the two,
-- and the distinction matters: a Nextdoor row is a resident's idea of a
-- neighbourhood, a plat row is a legal boundary, and the matcher prefers the
-- plat (migration 20260907200000 orders subdivisions first).
--
-- `boundary_source` already allows 'arcgis', which is what these rows use.
alter table public.communities drop constraint if exists communities_source_chk;
alter table public.communities add constraint communities_source_chk
  check (source in ('agent', 'nextdoor', 'county_gis'));

comment on column public.communities.source is
  'Where the row came from: agent (created in the dashboard), nextdoor (2026-07 seed import), county_gis (recorded-plat polygons from a county GIS service).';
