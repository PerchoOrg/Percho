-- Reviews of a city (phase372).
--
-- Owner 2026-11-22, on the city page: "最底下还是要有review 部分". A city's
-- review is the same thing as a community's — a signed-in person's rating,
-- four scores and a paragraph, held as `pending` until someone reads it — so
-- it lives in the same table rather than a copy of it: one moderation queue,
-- one set of policies, one write path that can approve.
--
-- A row is about exactly one place. `community_id` stops being required and
-- `city_id` joins it; the check keeps a row from naming both or neither.
-- Every existing row has a community and no city, so it already passes.
--
-- The RLS policies are about WHO (a user's own row, `approved` for everyone)
-- and say nothing of the place, so they cover city rows as they stand. Only
-- the column grants need the new column.

alter table public.community_reviews
  add column city_id uuid references public.cities(id) on delete cascade,
  alter column community_id drop not null,
  add constraint community_reviews_one_place
    check ((community_id is null) <> (city_id is null));

-- One review per person per city. The table's own unique (community_id,
-- user_id) does not reach these rows: their community_id is null.
create unique index community_reviews_city_user_idx
  on public.community_reviews (city_id, user_id)
  where city_id is not null;

create index community_reviews_city_status_idx
  on public.community_reviews (city_id, status, created_at desc)
  where city_id is not null;

grant select (city_id) on public.community_reviews to anon;
grant insert (city_id) on public.community_reviews to authenticated;
