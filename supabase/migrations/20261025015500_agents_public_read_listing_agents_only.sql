-- ─── agents: the public read covers listing agents only ──────────────
--
-- Left open by phase306. "public reads agent profile" (baseline) is
-- `for select using (true)` with no `to` clause, and this project's default
-- privileges give anon SELECT on every column. Every sign-up gets an agents
-- row — handle_new_user defaults the role to 'agent', and the iOS app's
-- Apple / email-code sign-ins send none — so the anon key that ships in the
-- app could read every user's email, phone, user_id and is_admin with one
-- request (`/rest/v1/agents?select=*`), and `/a/<slug>` rendered any user's
-- email and phone.
--
-- Public pages need another person's agents row only when that agent has an
-- active listing (cards, /v/, /a/, search, share links) or created a
-- community (its Contact button). Everyone else — every buyer, every iOS
-- user — is now visible only to themselves; "agent reads own profile" is
-- unchanged, and so is every service-role read.
--
-- The check is a SECURITY DEFINER function rather than an inline subquery:
-- listings' own policy ("agent manages own listings") reads agents, so an
-- agents policy that read listings directly would recurse (42P17). The
-- function returns a boolean for an id and nothing else.
--
-- Not done here: anon can still read the email / phone / user_id / is_admin
-- of the listing agents that stay visible. Column grants were not used
-- because other tables' policies subquery agents.user_id and agents.is_admin
-- as the calling role, so revoking those columns from anon would break anon
-- reads of those tables.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.agent_is_public(p_agent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from public.listings l
            where l.agent_id = p_agent_id and l.status = 'active'
         )
      or exists (
           select 1 from public.communities c
            where c.created_by = p_agent_id
         );
$$;

revoke all on function public.agent_is_public(uuid) from public;
grant execute on function public.agent_is_public(uuid) to anon, authenticated;

drop policy if exists "public reads agent profile" on public.agents;
create policy "public reads listing agents"
  on public.agents
  for select
  using (public.agent_is_public(id));
