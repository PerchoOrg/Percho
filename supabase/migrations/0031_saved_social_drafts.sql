-- ─── 0031_saved_social_drafts ─────────────────────────────────────
-- Phase 48.2 (2026-06-22). Persist generated social copy so agents
-- don't lose drafts on refresh.
--
-- Design constraints (security + abuse):
--   * RLS scoped agent → listing → drafts. Agents only see/write drafts
--     for their own listings.
--   * Per-listing cap (50 drafts) enforced by trigger to prevent the
--     surface from being abused as free unbounded blob storage.
--   * Content size hard cap (8 KB) checked at column level. The model's
--     longest legitimate single-cell output is ~2 KB; 8 KB is generous
--     padding without enabling abuse.
--   * Inserts are gated by the same per-agent rate limit as generation
--     (in the route handler), and saves are independent of generation
--     so an agent can refine and re-save without burning another
--     Anthropic call.
--
-- Schema mirrors the generator's (platform, language, body) shape so
-- the UI can list saved drafts grouped by platform and reuse the same
-- enums it already understands.

create table public.saved_social_drafts (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings on delete cascade,
  agent_id    uuid not null references public.agents on delete cascade,
  platform    text not null check (platform in (
    'facebook', 'instagram', 'email', 'tiktok', 'x',
    'linkedin', 'threads', 'rednote', 'wechat'
  )),
  language    text not null check (language in ('en', 'zh', 'es', 'vi', 'ko')),
  body        text not null check (length(body) > 0 and length(body) <= 8192),
  highlights  text[],
  created_at  timestamptz not null default now()
);

create index saved_social_drafts_listing_idx
  on public.saved_social_drafts (listing_id, created_at desc);

-- Per-listing cap. Trigger fires before insert; if the listing already has
-- 50 drafts, raise. We don't auto-evict — surfacing the cap to the agent
-- is more honest than silently dropping their oldest draft.
create or replace function public.enforce_saved_social_drafts_cap()
returns trigger language plpgsql as $$
declare
  cnt integer;
begin
  select count(*) into cnt
    from public.saved_social_drafts
    where listing_id = new.listing_id;
  if cnt >= 50 then
    raise exception 'saved_drafts_cap_reached'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger saved_social_drafts_cap
  before insert on public.saved_social_drafts
  for each row execute function public.enforce_saved_social_drafts_cap();

alter table public.saved_social_drafts enable row level security;

-- Agent reads own listings' drafts.
create policy "agent reads own social drafts" on public.saved_social_drafts
  for select using (
    agent_id in (select id from public.agents where user_id = auth.uid())
  );

-- Agent inserts drafts for own listings (route handler also validates
-- listing ownership; defense in depth here).
create policy "agent saves own social drafts" on public.saved_social_drafts
  for insert with check (
    agent_id in (select id from public.agents where user_id = auth.uid())
    and listing_id in (
      select l.id from public.listings l
      join public.agents a on a.id = l.agent_id
      where a.user_id = auth.uid()
    )
  );

-- Agent deletes own drafts.
create policy "agent deletes own social drafts" on public.saved_social_drafts
  for delete using (
    agent_id in (select id from public.agents where user_id = auth.uid())
  );
-- No update policy: drafts are immutable. Edit = delete + re-save.
