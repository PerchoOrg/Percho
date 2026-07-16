-- Phase 93.1: Drop listing-scoped POI tables (superseded by community_pois).
--
-- Context: Phase 93 removed all code references to `listing_pois` and
-- `listing_poi_photos`. POI discovery + photo review now lives at the
-- community layer (community_pois / community_poi_photos, migration
-- 20260715205542). This migration drops the dead listing-level tables.
--
-- Cascade blast radius (audited before writing):
--   1) Policy `poi_photos."agent reads poi_photos for referenced pois"`
--      sub-selects `listing_pois`. Cascade drops it. Replaced below with
--      an equivalent community_pois-scoped policy so user-facing reads
--      keep working (server-side callers use service_role and bypass RLS
--      regardless).
--   2) Policy `pois."agent reads pois referenced by own listings"`
--      sub-selects `listing_pois`. Cascade drops it. NOT replaced —
--      migration 0001_init already has `public reads pois using (true)`,
--      which fully covers this read path.
--   3) `poi_photos.poi_id` FKs to `pois`, NOT to `listing_pois`. No
--      photo rows or Storage objects are cascaded away by this drop.
--
-- Row counts at drop time (production, 2026-07-16):
--   listing_pois:        1160  (all dev/seed, no live consumers)
--   listing_poi_photos:   298  (all dev/seed, no live consumers)

------------------------------------------------------------
-- 1. Drop dead tables (cascade takes the two dead policies with them)
------------------------------------------------------------
drop table if exists public.listing_poi_photos cascade;
drop table if exists public.listing_pois cascade;

------------------------------------------------------------
-- 2. Restore user-facing SELECT policy on poi_photos, now community-scoped
------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'poi_photos'
       and policyname = 'agent reads poi_photos for referenced community_pois'
  ) then
    create policy "agent reads poi_photos for referenced community_pois"
      on public.poi_photos
      for select
      using (
        poi_id in (
          select cp.poi_id from public.community_pois cp
        )
      );
  end if;
end $$;
-- Note: community_pois is shared across all authenticated agents (per
-- 20260715120000_communities_share_model), so no per-agent join is needed.
-- Writes to poi_photos remain service-role-only.
