-- listing_photos are approved unless someone says otherwise (2026-08-21).
--
-- Owner: "all the photos in the listing should be auto approved for plan
-- purpose."
--
-- The gate was modelled on the community tour, where it earns its keep: POI
-- photos are scraped from Google Places and a human has never looked at them,
-- so `pending` is the honest default and approving is the work.
--
-- A listing's photos are the opposite. The agent chose and uploaded them for
-- this listing. They are already curated, and starting them at `pending` made
-- the table open with every row in "Other Photos" and the Review chip asking
-- for a decision that was, in practice, always yes.
--
-- The gate does not go away — it inverts. Reviewing a home tour is now
-- REJECTING the few photos that should not be in the film, which is the
-- decision actually being made.
--
-- Note the plan step's behaviour is unchanged by this: it has always excluded
-- only `review_status = 'rejected'`, so pending photos were already reaching
-- `build_plan`. This migration changes what the TABLE shows and what the
-- reviewer is asked to do, not which photos the film could draw from.

alter table public.listing_photos
  alter column review_status set default 'approved';

-- Backfill: every existing photo is pending only because that was the default
-- when the column landed yesterday. Rejections are preserved — the filter is
-- deliberately `= 'pending'` rather than `<> 'rejected'`.
update public.listing_photos
   set review_status = 'approved'
 where review_status = 'pending';

comment on column public.listing_photos.review_status is
  'Home-tour review verdict: approved (the default — a listing''s own photos are already curated) | rejected | pending. NOT the upload status, which is `status`. The plan step excludes only rejected.';
