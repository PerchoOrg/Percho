-- drop unused friendliness/affordability subjective scores.
--
-- Added in 20260715115000 as part of the Nextdoor seed, but never surfaced
-- in the UI and never validated as meaningful signals. Cutting them so we
-- stop paying for their storage/backfill maintenance.

alter table public.communities
  drop column if exists friendliness_score,
  drop column if exists affordability_score;
