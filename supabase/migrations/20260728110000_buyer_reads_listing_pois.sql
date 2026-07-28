-- Buyers can read a listing's nearby-POI links.
--
-- §12 RLS-hole: `listing_pois` only ever had agent-scoped SELECT policies (own
-- listings, via agents.user_id = auth.uid()). The buyer app is anonymous, so the
-- new deep map endpoint (`/api/mobile/listing/<id>/nearby`) read 0 rows through
-- the anon client while the service role saw 161 — the map would have shipped
-- permanently empty with no error anywhere. Verified by diffing anon vs
-- service-role reads before writing this.
--
-- Scope: only `approved` links are buyer-visible. `candidate` rows are
-- un-reviewed discovery output (156 of 182 rows right now) and `rejected` is an
-- explicit no — surfacing either would put un-curated Google Places results on a
-- buyer surface. `pois` itself already has a `public reads pois` policy from the
-- v1 baseline, so no change is needed there.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'listing_pois'
      and policyname = 'public reads approved listing_pois'
  ) then
    create policy "public reads approved listing_pois" on public.listing_pois
      for select to anon, authenticated
      using (status = 'approved');
  end if;
end $$;

-- Same hole one join further out: `pois` reads 0 rows as anon too. The v1
-- baseline had `create policy "public reads pois" ... using (true)`, but
-- 20260714000000_poi_content_pipeline.sql rebuilt the table and only re-added an
-- agent-scoped policy, so the buyer-visible read was silently lost. Without this
-- the nearby endpoint resolves every approved link to a missing poi and returns
-- an empty list — again with no error.
--
-- `using (true)` matches the baseline intent: a POI is public business data from
-- Google Places (name, type, rating, coordinate). Curation of WHICH pois attach
-- to a listing is enforced on `listing_pois.status` above, not here.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pois'
      and policyname = 'public reads pois'
  ) then
    create policy "public reads pois" on public.pois
      for select to anon, authenticated
      using (true);
  end if;
end $$;
