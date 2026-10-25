-- ─── communities: writes need an agent, not just a session ────────────
--
-- 20261005000000 scoped the unclaimed-community branches (`created_by is
-- null`) to `authenticated` to stop anon deletes. But every iPhone user is
-- `authenticated` too — the app ships the anon key and signs buyers in — so
-- any app user could still, with that key and their own session:
--   · DELETE every community nobody claimed (the ~22k Nextdoor- and
--     county-GIS-seeded rows) and cascade their videos, tours and leads;
--   · UPDATE any of them;
--   · INSERT new ones ("agents insert communities" only checked
--     `auth.role() = 'authenticated'`).
--
-- The shared-community model (20260715120000) is about AGENTS editing an
-- unclaimed community. These policies now say so: the caller must have an
-- agents row. What an agent may do is unchanged. Buyers — and, from
-- 20261025023000, every new iOS sign-up — have none.
--
-- The `agents` subquery runs as the caller; "agent reads own profile" keeps
-- the caller's own row visible, so the check works under RLS.
-- ─────────────────────────────────────────────────────────────────────

drop policy if exists "agents insert communities" on public.communities;
create policy "agents insert communities"
  on public.communities
  for insert
  to authenticated
  with check (exists (select 1 from public.agents a where a.user_id = auth.uid()));

drop policy if exists "creator deletes community" on public.communities;
create policy "creator deletes community"
  on public.communities
  for delete
  to authenticated
  using (
    created_by in (select id from public.agents where user_id = auth.uid())
    or (
      created_by is null
      and exists (select 1 from public.agents a where a.user_id = auth.uid())
    )
  );

drop policy if exists "stakeholder updates community" on public.communities;
create policy "stakeholder updates community"
  on public.communities
  for update
  to authenticated
  using (
    created_by in (select id from public.agents where user_id = auth.uid())
    or (
      created_by is null
      and exists (select 1 from public.agents a where a.user_id = auth.uid())
    )
    or exists (
      select 1
        from public.listings l
        join public.agents a on a.id = l.agent_id
       where l.community_id = communities.id
         and l.status = 'active'
         and a.user_id = auth.uid()
    )
  )
  with check (
    created_by in (select id from public.agents where user_id = auth.uid())
    or (
      created_by is null
      and exists (select 1 from public.agents a where a.user_id = auth.uid())
    )
    or exists (
      select 1
        from public.listings l
        join public.agents a on a.id = l.agent_id
       where l.community_id = communities.id
         and l.status = 'active'
         and a.user_id = auth.uid()
    )
  );
