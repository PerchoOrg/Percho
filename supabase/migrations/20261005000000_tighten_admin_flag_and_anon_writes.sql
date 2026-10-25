-- ─── tighten: the admin flag, and three writes anon never needed ─────
--
-- Found by the phase306 audit. Every change here REMOVES a capability; none
-- adds one. This project's default privileges give anon / authenticated ALL
-- on public tables (see 20260904171000), so RLS policies are the only gate.
--
-- 1. agents.is_admin
--    "agent updates own profile" is `for update using (user_id = auth.uid())`
--    with no column list, and is_admin (20260716200000) was added later with
--    no protection. Every signup gets an agents row — handle_new_user defaults
--    the role to 'agent', and the app's Apple / email-OTP sign-ins send none —
--    so any registered user could set their own is_admin with the public anon
--    key, and requireAdmin() reads that column. A trigger, not a column grant:
--    a table-level UPDATE grant covers every column, so revoking one column
--    would do nothing, and re-granting a column list would have to be kept in
--    step with every future column.
--
-- 2. communities DELETE / UPDATE
--    Both policies carry a `created_by is null` branch and no `to` clause, so
--    the branch applied to anon too: one anonymous DELETE could remove every
--    unclaimed community and cascade through its videos, tours and leads.
--    Scoped to authenticated. What a signed-in agent may do to an unclaimed
--    community is unchanged — that is the shared-community model
--    (20260715120000) and a product decision, not this migration's.
--
-- 3. leads INSERT for anon
--    `/api/leads` validates, resolves the owning agent itself and writes on the
--    service role; nothing inserts as anon. The open policy let anyone bypass
--    the route, name any agent_id, and have notify-lead email that agent.
-- ─────────────────────────────────────────────────────────────────────

-- 1 ─────────────────────────────────────────────────────────────────
create or replace function public.agents_guard_is_admin()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- PostgREST runs a request as anon / authenticated; the service role,
  -- migrations and the SQL editor run as other roles and stay free to set it.
  if new.is_admin is distinct from old.is_admin
     and current_user in ('anon', 'authenticated') then
    raise exception 'agents.is_admin can only be changed by an operator'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists agents_guard_is_admin on public.agents;
create trigger agents_guard_is_admin
  before update of is_admin on public.agents
  for each row execute function public.agents_guard_is_admin();

-- 2 ─────────────────────────────────────────────────────────────────
drop policy if exists "creator deletes community" on public.communities;
create policy "creator deletes community"
  on public.communities
  for delete
  to authenticated
  using (
    created_by is null
    or created_by in (select id from public.agents where user_id = auth.uid())
  );

drop policy if exists "stakeholder updates community" on public.communities;
create policy "stakeholder updates community"
  on public.communities
  for update
  to authenticated
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

-- 3 ─────────────────────────────────────────────────────────────────
drop policy if exists "public creates leads" on public.leads;
