-- ─── community_reviews: tighten grants ──────────────────────────────
--
-- Follow-up to 20260904170000. That migration's column-level grants were
-- written as if the table started with no privileges, but this project's
-- default privileges hand ALL on new public tables to anon / authenticated
-- (checked on the live DB: both roles held INSERT/SELECT/UPDATE on every
-- column). RLS still held — anon inserts were refused — but the point of
-- the narrow grants was that anon cannot even name `user_id`. Revoke the
-- defaults and re-issue exactly what the app needs.
-- ─────────────────────────────────────────────────────────────────────

revoke all on public.community_reviews from anon, authenticated;

grant select (id, community_id, rating, dimensions, body, status, created_at, updated_at)
  on public.community_reviews to anon;
grant select on public.community_reviews to authenticated;
grant insert (community_id, user_id, rating, dimensions, body, status)
  on public.community_reviews to authenticated;
grant update (rating, dimensions, body, status, updated_at)
  on public.community_reviews to authenticated;
