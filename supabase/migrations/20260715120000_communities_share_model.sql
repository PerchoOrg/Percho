-- Phase 83.2 (2026-07-15): shared-community model.
--
-- 1. Flip all Nextdoor seeds to status='active' so buyer + agent + guest
--    surfaces show them. Previously seeded as 'inactive' to avoid
--    polluting the feed before the claim UX shipped; the new model has
--    no claim step for communities so they should be public reference
--    data from day one.
--
-- 2. Broaden the UPDATE policy: any agent that has an ACTIVE listing
--    linked to a community may edit that community. Previous policy
--    (0013) locked edits to the creator or unowned rows. The new model
--    grants edit rights to "stakeholders" — agents doing business there.
--    Seeded rows remain created_by IS NULL, so the OR-null branch
--    (kept) still allows any authenticated agent to edit them until
--    they gain a listing owner.
--
-- 3. `claim_community` RPC from the 20260715115000 seed migration is
--    NOT dropped (would require a separate DDL and add churn). It
--    still works but no code path calls it — dead-but-harmless.

update public.communities
   set status = 'active'
 where source = 'nextdoor'
   and status = 'inactive';

drop policy if exists "creator updates community" on public.communities;

create policy "stakeholder updates community"
  on public.communities
  for update
  using (
    created_by is null
    or created_by in (select id from public.agents where user_id = auth.uid())
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
    created_by is null
    or created_by in (select id from public.agents where user_id = auth.uid())
    or exists (
      select 1
        from public.listings l
        join public.agents a on a.id = l.agent_id
       where l.community_id = communities.id
         and l.status = 'active'
         and a.user_id = auth.uid()
    )
  );
