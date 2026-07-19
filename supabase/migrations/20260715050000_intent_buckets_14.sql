-- expand intent_bucket taxonomy from 4 access-based buckets
-- (walkable/daily_drive/lifestyle/commute) to 14 buyer-persona buckets,
-- ordered by prominence for the UI:
--
--   schools, dining, nightlife, shopping, outdoor, fitness, kids,
--   asian_community, daily_errands, faith, work_hubs, healthcare,
--   pets, transit
--
-- Rationale (see chat 2026-07-15): distance-based buckets read as a
-- functional access model ("how do I get there?") rather than a buyer
-- decision model ("what matters to my life?"). Buyers self-identify by
-- persona (family with kids, foodie, senior, asian-family) — the new
-- taxonomy maps to that heuristic AND to Google Places `type` values so
-- the discovery pipeline stays automatable for S+A tier buckets.
--
-- Data:
-- Existing listing_pois rows all carry legacy bucket names. Since we are
-- pre-launch and every row is re-fetchable from Google Places, we DELETE
-- them here and let the owner re-run discover after deploy. Same story
-- for generated_videos scoped to a bucket. This is the cleanest cutover.

begin;

-- 1. Drop old check constraints -------------------------------------------
alter table public.listing_pois
  drop constraint if exists listing_pois_intent_bucket_check;

alter table public.generated_videos
  drop constraint if exists generated_videos_intent_bucket_check;

-- 2. Wipe legacy rows (pre-launch cutover; re-fetchable) -------------------
delete from public.generated_videos where intent_bucket is not null;
delete from public.listing_pois;

-- 3. Add new check constraints (14 buckets) --------------------------------
alter table public.listing_pois
  add constraint listing_pois_intent_bucket_check
  check (intent_bucket in (
    'schools','dining','nightlife','shopping','outdoor','fitness','kids',
    'asian_community','daily_errands','faith','work_hubs','healthcare',
    'pets','transit'
  ));

alter table public.generated_videos
  add constraint generated_videos_intent_bucket_check
  check (
    intent_bucket is null or intent_bucket in (
      'schools','dining','nightlife','shopping','outdoor','fitness','kids',
      'asian_community','daily_errands','faith','work_hubs','healthcare',
      'pets','transit'
    )
  );

commit;
