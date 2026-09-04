-- ─── community_reviews ──────────────────────────────────────────────
--
-- Phase E of the store launch: resident reviews. A signed-in user leaves
-- ONE review per community (rating, a few 1–5 dimensions, a paragraph).
-- Nothing shows until a human approves it in /admin/pipeline/reviews —
-- the queue is the whole moderation story, and there is deliberately no
-- seed: an empty section beats a generated one (owner, 2026-09-03).
--
-- Writes come straight from the app through RLS, the same way saves do
-- (`20260904090000_mobile_auth_saves.sql`). The policies are what keep a
-- client honest: it can only insert/update its OWN row, and only as
-- `pending`, so an edit re-enters the queue instead of editing an
-- approved review in place. Approval itself is service-role only.
--
-- Reads: anon and authenticated see `approved` rows (minus `user_id` —
-- a review is shown as "A resident", never as an account); an
-- authenticated user also sees their own row in any status, so the app
-- can show "waiting for review" and offer an edit.
-- ─────────────────────────────────────────────────────────────────────

create table public.community_reviews (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references public.communities(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  rating        smallint not null check (rating between 1 and 5),
  -- {quiet?, walkable?, friendly?, value?} → 1..5. Keys are validated in
  -- `apps/web/lib/communities/reviews.ts` on the way out; the DB only
  -- insists it is an object.
  dimensions    jsonb not null default '{}'::jsonb
                check (jsonb_typeof(dimensions) = 'object'),
  body          text not null check (char_length(body) between 20 and 1200),
  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  reviewed_at   timestamptz,
  unique (community_id, user_id)
);

create index community_reviews_community_status_idx
  on public.community_reviews (community_id, status, created_at desc);
create index community_reviews_status_idx
  on public.community_reviews (status, created_at);

alter table public.community_reviews enable row level security;

create policy "anyone reads approved reviews" on public.community_reviews
  for select to anon, authenticated
  using (status = 'approved');

create policy "user reads own review" on public.community_reviews
  for select to authenticated
  using (user_id = auth.uid());

create policy "user submits review" on public.community_reviews
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

create policy "user edits own review" on public.community_reviews
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and status = 'pending');

-- No delete policy: a user retracts by editing; the row goes with the
-- account (cascade) on deletion.

grant select (id, community_id, rating, dimensions, body, status, created_at, updated_at)
  on public.community_reviews to anon;
grant select on public.community_reviews to authenticated;
grant insert (community_id, user_id, rating, dimensions, body, status)
  on public.community_reviews to authenticated;
grant update (rating, dimensions, body, status, updated_at)
  on public.community_reviews to authenticated;
