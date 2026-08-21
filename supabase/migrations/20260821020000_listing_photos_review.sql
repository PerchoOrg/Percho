-- listing_photos review verdict (2026-08-21).
--
-- The home tour had no human gate. `build_plan` ran over every photo the
-- listing had and the first sign of what it chose was the finished film, two
-- to four minutes and one Cloudflare upload later. The community tour has
-- stopped at a review gate since 2026-08-15 and it is the single thing that
-- keeps a bad photo from being paid for twice.
--
-- WHY NOT REUSE `listing_photos.status`:
--   It already exists and it means something else — `check (status in
--   ('ready','error'))`, the UPLOAD's state, ready on insert because photos
--   have no async ingest. Widening its CHECK to carry a review verdict would
--   make one column answer two questions, and every existing reader of
--   `status = 'ready'` would start seeing rows that are uploaded fine but
--   rejected for the film.
--
--   The cost of the separate column is that this table now has `status` and
--   `review_status` side by side, which reads badly. That is a naming debt
--   inherited from the baseline, and it is the smaller of the two evils.
--
-- Mirrors poi_photos.status / poi_photos.rejection_reason (2026-08-17 and
-- 2026-08-20) so PhotoTable's review column works the same on both surfaces.

alter table public.listing_photos
  add column if not exists review_status   text not null default 'pending',
  add column if not exists rejection_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'listing_photos_review_status_chk') then
    alter table public.listing_photos
      add constraint listing_photos_review_status_chk
      check (review_status in ('pending','approved','rejected')) not valid;
    alter table public.listing_photos validate constraint listing_photos_review_status_chk;
  end if;
end $$;

-- Partial: 'pending' is the overwhelming majority and is never the thing you
-- filter for on the server (the table filters it client-side).
create index if not exists listing_photos_review_status_idx
  on public.listing_photos (review_status)
  where review_status <> 'pending';

comment on column public.listing_photos.review_status is
  'Human review verdict for the home tour: pending | approved | rejected. NOT the upload status — that is `status`. The plan step excludes rejected photos.';
comment on column public.listing_photos.rejection_reason is
  'Why review_status went to rejected. Set by the plan step for automated verdicts and by the admin action for manual ones.';
