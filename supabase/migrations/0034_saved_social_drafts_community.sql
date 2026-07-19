-- ─── 0034_saved_social_drafts_community ────────────────────────────
-- Extend `saved_social_drafts` to also hold
-- community marketing drafts.
--
-- Listing drafts are platform × language. Community drafts are
-- language-only — one general-purpose blurb per language that the
-- agent copies into whichever channel they want. Different shape, but
-- same lifecycle (save / list / edit / delete / per-listing cap /
-- input-hash cache), so we extend the existing table instead of
-- forking a parallel one.
--
-- Schema changes:
--   * `listing_id` becomes nullable.
--   * Add `community_id` (nullable, references communities).
--   * Add target check: exactly one of listing_id / community_id set.
--   * `platform` becomes nullable. Listing rows MUST set it; community
--     rows MUST leave it null. Enforced by check constraint.
--   * Cap trigger expanded: 50 drafts per listing OR per community.
--   * RLS extended so a community's `created_by` agent can manage its
--     drafts (mirrors leads_community RLS in 0029).
--
-- Backwards compatible: every existing row has listing_id+platform set
-- and community_id null. The new constraints are satisfied as-is.

-- 1. Loosen NOT NULLs and add community_id ────────────────────────
alter table public.saved_social_drafts
  alter column listing_id drop not null;
alter table public.saved_social_drafts
  alter column platform drop not null;
alter table public.saved_social_drafts
  add column if not exists community_id uuid
    references public.communities on delete cascade;

-- 2. Target & platform shape ──────────────────────────────────────
alter table public.saved_social_drafts
  drop constraint if exists saved_social_drafts_target_chk;
alter table public.saved_social_drafts
  add constraint saved_social_drafts_target_chk check (
    (listing_id is not null and community_id is null)
    or (listing_id is null and community_id is not null)
  );

alter table public.saved_social_drafts
  drop constraint if exists saved_social_drafts_platform_shape_chk;
alter table public.saved_social_drafts
  add constraint saved_social_drafts_platform_shape_chk check (
    -- listing drafts must have a platform; community drafts must not.
    (listing_id is not null and platform is not null)
    or (community_id is not null and platform is null)
  );

-- 3. Cap trigger — per-listing OR per-community ──────────────────
create or replace function public.enforce_saved_social_drafts_cap()
returns trigger language plpgsql as $$
declare
  cnt integer;
begin
  if new.listing_id is not null then
    select count(*) into cnt
      from public.saved_social_drafts
      where listing_id = new.listing_id;
  else
    select count(*) into cnt
      from public.saved_social_drafts
      where community_id = new.community_id;
  end if;
  if cnt >= 50 then
    raise exception 'saved_drafts_cap_reached'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Trigger itself unchanged from 0031; redefining ensures the new
-- function body is wired up.
drop trigger if exists saved_social_drafts_cap on public.saved_social_drafts;
create trigger saved_social_drafts_cap
  before insert on public.saved_social_drafts
  for each row execute function public.enforce_saved_social_drafts_cap();

-- 4. Index for community queries ─────────────────────────────────
create index if not exists saved_social_drafts_community_idx
  on public.saved_social_drafts (community_id, created_at desc);

-- Cache lookup variant for community rows (sparse on hash).
create index if not exists saved_social_drafts_community_input_hash_idx
  on public.saved_social_drafts (community_id, input_hash)
  where input_hash is not null and community_id is not null;

-- 5. RLS — extend each policy with the community-owner path ──────
-- Drop and recreate each one. Names match 0031 so a fresh DB still
-- has a single canonical policy per action.

drop policy if exists "agent reads own social drafts" on public.saved_social_drafts;
create policy "agent reads own social drafts" on public.saved_social_drafts
  for select using (
    agent_id in (select id from public.agents where user_id = auth.uid())
  );

drop policy if exists "agent saves own social drafts" on public.saved_social_drafts;
create policy "agent saves own social drafts" on public.saved_social_drafts
  for insert with check (
    agent_id in (select id from public.agents where user_id = auth.uid())
    and (
      listing_id in (
        select l.id from public.listings l
        join public.agents a on a.id = l.agent_id
        where a.user_id = auth.uid()
      )
      or community_id in (
        select c.id from public.communities c
        join public.agents a on a.id = c.created_by
        where a.user_id = auth.uid()
      )
    )
  );

drop policy if exists "agent deletes own social drafts" on public.saved_social_drafts;
create policy "agent deletes own social drafts" on public.saved_social_drafts
  for delete using (
    agent_id in (select id from public.agents where user_id = auth.uid())
  );

-- Update policy didn't exist in 0031 (drafts were "edit = delete + re-save"),
-- but 0033 added the invalidate-cache trigger which only runs on UPDATE. The
-- listing route handler issues PATCH directly via service role… actually
-- no: it uses the auth client. So we need an explicit update policy. Add
-- it now (idempotent — drop first).
drop policy if exists "agent updates own social drafts" on public.saved_social_drafts;
create policy "agent updates own social drafts" on public.saved_social_drafts
  for update using (
    agent_id in (select id from public.agents where user_id = auth.uid())
  ) with check (
    agent_id in (select id from public.agents where user_id = auth.uid())
  );
