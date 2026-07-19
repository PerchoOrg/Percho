-- community ownership.
--
-- Adds `communities.created_by` so we can gate metadata edits to the agent
-- who created the row. V1 left communities fully shared (any authenticated
-- agent could edit). Now that we have multiple agents using the platform,
-- we want a soft ownership boundary on metadata while keeping schools / POIs
-- / videos still globally writable (those are crowdsourced data, not the
-- "identity" of the community).
--
-- Behaviour:
--   * Existing rows get `created_by = NULL`. NULL is treated as "legacy /
--     unowned"; the RLS policy lets any authenticated agent edit those.
--     New rows get `created_by` populated server-side from the authenticated
--     agent. Once owned, only that agent can update/delete metadata.
--   * Insert remains open to any authenticated agent. The application code
--     stamps `created_by` to the calling agent's id.
--   * Public reads unchanged.
--
-- Why a column on `communities` rather than a join table: V1 has one creator
-- per community, no co-ownership, no transfer. A nullable FK is enough.

alter table public.communities
  add column created_by uuid references public.agents(id) on delete set null;

create index communities_created_by_idx on public.communities (created_by);

-- Replace the V1 "any authenticated agent does anything" policy with split
-- policies: insert open, select public, update/delete gated to creator
-- (or unowned legacy rows).

drop policy if exists "agents manage communities" on public.communities;

create policy "agents insert communities"
  on public.communities
  for insert
  with check (auth.role() = 'authenticated');

create policy "creator updates community"
  on public.communities
  for update
  using (
    created_by is null
    or created_by in (select id from public.agents where user_id = auth.uid())
  )
  with check (
    created_by is null
    or created_by in (select id from public.agents where user_id = auth.uid())
  );

create policy "creator deletes community"
  on public.communities
  for delete
  using (
    created_by is null
    or created_by in (select id from public.agents where user_id = auth.uid())
  );
