-- ─────────────────────────────────────────────────────────────────
-- 0012_buyer_accounts.sql
--
-- introduce buyer accounts alongside agent accounts.
--
-- Until now the only authenticated principal in V1 was an agent
-- (see 0002_agent_signup_trigger.sql). This migration:
--
--   1. Creates a `buyers` table mirroring the agents row 1-to-1 with
--      auth.users for buyer-type accounts.
--   2. Replaces handle_new_user() to branch on the role passed via
--      Supabase signUp `options.data.role`:
--         - 'agent' (or unset, for backward compat)  → insert agents row
--         - 'buyer'                                  → insert buyers row
--   3. Locks down RLS: each buyer can read/update their own row;
--      no public reads.
--
-- Saved-listings + messaging tables come in /15.3.
-- ─────────────────────────────────────────────────────────────────

-- 1. buyers table
create table if not exists public.buyers (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists buyers_email_idx on public.buyers (email);

alter table public.buyers enable row level security;

-- A buyer can read their own row.
drop policy if exists "buyers_self_select" on public.buyers;
create policy "buyers_self_select" on public.buyers
  for select using (auth.uid() = user_id);

-- A buyer can update their own row.
drop policy if exists "buyers_self_update" on public.buyers;
create policy "buyers_self_update" on public.buyers
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- INSERT goes through handle_new_user (security definer); no anon policy needed.
-- DELETE cascades from auth.users; no policy needed.

-- 2. Replace handle_new_user with role-aware branch.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_role text;
  base_slug text;
  candidate text;
  n         int := 0;
begin
  user_role := coalesce(new.raw_user_meta_data->>'role', 'agent');

  if user_role = 'buyer' then
    insert into public.buyers (user_id, display_name, email)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
      new.email
    );
    return new;
  end if;

  -- Default / 'agent' branch (preserves prior behavior).
  base_slug := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  if base_slug = '' or base_slug is null then
    base_slug := 'agent';
  end if;

  candidate := base_slug;
  while exists (select 1 from public.agents where slug = candidate) loop
    n := n + 1;
    candidate := base_slug || '-' || (n + 1);
  end loop;

  insert into public.agents (user_id, slug, name, email)
  values (
    new.id,
    candidate,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

-- Trigger already exists from 0002; replace function definition is enough.
