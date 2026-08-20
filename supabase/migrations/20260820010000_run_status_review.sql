-- community_tour_runs.status gains 'review'.
--
-- phase73.10 split the photos step so it stops for the owner's manual photo
-- review, and wrote `setRunStatus(run, 'review')` — without widening this
-- constraint. Every photos run since has done all its work (the step result is
-- saved first) and then failed on the very last write:
--
--   new row for relation "community_tour_runs" violates check constraint
--   "community_tour_runs_status_check"
--
-- WIDENED, not replaced. The existing vocabulary is re-listed verbatim and
-- 'review' appended. Re-deriving the list from the migration file alone burned
-- this project once before, when a rewritten intent_bucket constraint dropped
-- values that live rows were already using — so the six values below were also
-- checked against what `community_tour_runs.status` actually holds today
-- (assembled, tagging, resolving, fetching_photos, failed, researching).

alter table public.community_tour_runs
  drop constraint if exists community_tour_runs_status_check;

alter table public.community_tour_runs
  add constraint community_tour_runs_status_check
  check (status in (
    'researching','resolving','fetching_photos','tagging',
    'review','generating','assembled','failed'
  ));
