-- ─── 0035_events_community ──────────────────────────────────────────
-- Extend `events` to record community-targeted
-- analytics events alongside the listing-targeted ones we've had since
-- --
-- Why: the agent-hub Community detail page now has an Analytics tab
-- mirroring the listing edit hub. To populate it we need page_view /
-- card_view / video_complete rows attributable to a community (rather
-- than to a single listing inside that community). The public
-- `/c/[slug]` and `/c/[slug]/feed` routes will start emitting these.
--
-- Same pattern as 0029_leads_community: relax the NOT NULL on
-- `listing_id`, add `community_id`, enforce exactly-one-of via a check
-- constraint, extend RLS so the community's `created_by` agent can
-- read its own events.
--
-- Anon insert policy stays as-is — it's already `with check (true)`.
-- Validation in the events route (zod) is what enforces shape.

alter table public.events alter column listing_id drop not null;
alter table public.events
  add column if not exists community_id uuid
    references public.communities on delete cascade;

-- Exactly one of listing_id / community_id must be set on every row.
-- (The events route validates the same — defense in depth.)
alter table public.events
  drop constraint if exists events_target_chk;
alter table public.events
  add constraint events_target_chk check (
    (listing_id is not null and community_id is null)
    or (listing_id is null and community_id is not null)
  );

create index if not exists events_community_idx
  on public.events (community_id, created_at desc);

-- Owner-read RLS extension. The policy reads listing-events;
-- this one adds the community-events path. Both stay co-resident so a
-- single agent SELECT scans both worlds.
drop policy if exists "agent reads own community events" on public.events;
create policy "agent reads own community events" on public.events
  for select using (
    community_id in (
      select c.id from public.communities c
      join public.agents a on a.id = c.created_by
      where a.user_id = auth.uid()
    )
  );
