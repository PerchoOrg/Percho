-- poi_photos.rejection_reason — why a photo is out.
--
-- `status = 'rejected'` has always been a bare verdict. The pipeline knows
-- exactly why it rejected each one — religious subject matter, tagger-unusable,
-- no stored file — and threw the reason away at the point of writing the
-- status, so the review table could show that a photo was out but never why
-- (owner 2026-08-20: "for rejected photos, we need to add reasons in the
-- table").
--
-- That mattered most for the reasons a human would disagree with. A photo
-- dropped for religious content and one dropped by the owner's own click looked
-- identical in the table, so the automated verdicts were unauditable — and this
-- session has already found two of them wrong (resolution, which is fixable by
-- rendering, and an over-broad event filter).
--
-- Nullable, no backfill in SQL: reasons for existing rows are restored by a
-- one-off script that re-runs the same predicate, and anything it cannot
-- explain is left null rather than guessed at.

alter table public.poi_photos
  add column if not exists rejection_reason text;

comment on column public.poi_photos.rejection_reason is
  'Why status went to rejected. Set by the photos step for automated verdicts and by the admin action for manual ones; null on rows rejected before 2026-08-20.';
