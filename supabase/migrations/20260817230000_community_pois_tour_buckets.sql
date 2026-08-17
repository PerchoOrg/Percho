-- community_pois.intent_bucket: accept the buckets the tour pipeline produces
-- (2026-08-17).
--
-- The resolve step classifies POIs with the tour taxonomy (lib/poi/
-- community-tour.ts BUCKET_WEIGHT), which has three values this CHECK never
-- had: 'civic', 'waterfront' and 'other'. The photos step then linked each POI
-- with a hardcoded 'other', so EVERY link insert failed the constraint — and
-- the code did not check the error, so the step reported success while
-- `community_pois` stayed empty.
--
-- That table is where the admin page starts when it looks for a community's
-- photos (lib/poi/admin-nearby-photos.ts), so the photos existed in
-- `poi_photos` and the page showed nothing. Owner 2026-08-17, on Aberdeen:
-- "still not able to view the photos".

alter table public.community_pois
  drop constraint if exists community_pois_intent_bucket_check;

alter table public.community_pois
  add constraint community_pois_intent_bucket_check
  check (intent_bucket in (
    'schools','dining','nightlife','shopping','outdoor','fitness','kids',
    'asian_community','daily_errands','faith','work_hubs','healthcare',
    'pets','transit',
    -- added 2026-08-17, to match the tour taxonomy
    'civic','waterfront','other'
  ));
