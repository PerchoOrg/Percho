-- Adds the 'amenities' intent bucket (phase56).
--
-- The 14 existing buckets are all *surroundings* — what is near the community.
-- A subdivision's own facilities (gate, pool, clubhouse, tennis courts,
-- playground) had nowhere to go, so a community tour could not show the
-- community itself. 'amenities' is that bucket; the Scheduler opens the tour
-- on it, before the neighbourhood context.
--
-- Each table is widened from ITS OWN current vocabulary, which is not the same
-- on all three: community_pois also allows 'civic', 'waterfront' and 'other'
-- (the community-tour pipeline writes those — see lib/ai/community-tour-prompt.ts
-- and the `?? 'other'` fallback in lib/poi/tour-steps/photos.ts), while
-- listing_pois and generated_videos carry the plain 14. Re-adding the 14-value
-- list to community_pois would narrow it and fail on live rows.
--
-- Widening accepts every row the old constraint did, so no backfill.

begin;

alter table public.listing_pois
  drop constraint if exists listing_pois_intent_bucket_check;
alter table public.listing_pois
  add constraint listing_pois_intent_bucket_check
  check (intent_bucket in (
    'amenities',
    'schools','dining','nightlife','shopping','outdoor','fitness','kids',
    'asian_community','daily_errands','faith','work_hubs','healthcare',
    'pets','transit'
  ));

alter table public.generated_videos
  drop constraint if exists generated_videos_intent_bucket_check;
alter table public.generated_videos
  add constraint generated_videos_intent_bucket_check
  check (
    intent_bucket is null or intent_bucket in (
      'amenities',
      'schools','dining','nightlife','shopping','outdoor','fitness','kids',
      'asian_community','daily_errands','faith','work_hubs','healthcare',
      'pets','transit'
    )
  );

alter table public.community_pois
  drop constraint if exists community_pois_intent_bucket_check;
alter table public.community_pois
  add constraint community_pois_intent_bucket_check
  check (intent_bucket in (
    'amenities',
    'schools','dining','nightlife','shopping','outdoor','fitness','kids',
    'asian_community','daily_errands','faith','work_hubs','healthcare',
    'pets','transit',
    'civic','waterfront','other'
  ));

commit;
