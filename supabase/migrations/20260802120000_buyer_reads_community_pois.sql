-- Buyers can read a community's nearby-POI links, so the card can print counts.
--
-- Same RLS hole as 20260728110000_buyer_reads_listing_pois.sql, one table over:
-- `community_pois` only ever had agent-scoped SELECT policies, so the anonymous
-- buyer app reads 0 rows while the service role sees 175. Verified by diffing an
-- anon read against a service-role read before writing this — the card's new
-- "33 restaurants" fact resolved to nothing, silently, with no error anywhere.
--
-- WHY THIS ONE IS NOT RESTRICTED TO `approved`, unlike the listing_pois policy:
--
-- That policy's concern was putting un-curated Google Places output on a buyer
-- surface — names, photos, ratings of places nobody reviewed. It is the right
-- call there, because that endpoint RENDERS each place.
--
-- This surface renders a COUNT. "33 restaurants" is a statement about the
-- geography around a subdivision, and it names nothing: `community_pois` is a
-- join table (community_id, poi_id, intent_bucket, distance_m, status) with no
-- human-readable content of its own. Restricting to `approved` would print
-- "1 restaurant" for a neighbourhood that has 33 within 3km, which is a WORSE
-- statement about reality than the candidate count — it reports our review
-- backlog as if it were the neighbourhood.
--
-- The curation gate therefore stays where it renders places, not where it counts
-- them. Only 3 of 175 rows are `approved` today, all discovery output from
-- 2026-07-15.
--
-- CEILING: this table holds 175 rows and every one belongs to a single
-- community. The count fact reaches ~1 card until a Places backfill runs; see
-- `poiCounts` in apps/web/lib/feed/community-reasons.ts.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'community_pois'
      and policyname = 'public reads community_pois'
  ) then
    create policy "public reads community_pois" on public.community_pois
      for select to anon, authenticated
      using (true);
  end if;
end $$;
