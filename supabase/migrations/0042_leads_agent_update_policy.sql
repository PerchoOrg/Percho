-- leads.UPDATE RLS policy
--
-- Bug: 0001_init.sql enabled RLS on public.leads and shipped SELECT + INSERT
-- policies, but NEVER an UPDATE policy. 0014_leads_followed_up.sql's header
-- comment claimed "existing per-listing policies on public.leads cover this
-- column — SELECT/UPDATE are already gated" — that was wrong. With RLS on
-- and no matching UPDATE policy, every UPDATE silently affects 0 rows.
--
-- Symptom: agent clicks "Mark as followed up" on /dashboard/leads (or the
-- detail page toggle); UI flips optimistically; fetch resolves; the API's
-- `update().eq(id).select().maybeSingle()` returns null (0 rows) → route
-- returns 404 → client reverts → row pops back to unfollowed-up. Looked
-- like "refresh and it goes back" but actually reverted on response.
--
-- Fix: add a per-agent UPDATE policy mirroring the SELECT policy. Match the
-- existing shape (agent_id IN (select id from agents where user_id = auth.uid())).
-- WITH CHECK identical to USING — agents can't reassign a lead to another
-- agent by editing agent_id, since the new value also has to satisfy the
-- check.
--
-- Scope: deliberately narrow. No DELETE policy added — leads are append-only
-- audit data; cleanup happens via the listing-cascade in 0041.

create policy "agent updates own leads" on public.leads
  for update
  using (
    agent_id in (select id from public.agents where user_id = auth.uid())
  )
  with check (
    agent_id in (select id from public.agents where user_id = auth.uid())
  );
