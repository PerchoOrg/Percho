-- ─── handle_new_user: a sign-up that names no role is a buyer ─────────
--
-- The baseline trigger defaulted a missing `role` to 'agent'. The web
-- sign-up form always sends one ('buyer' by default, or 'agent'), so the
-- only sign-ups that arrive without it are the iOS app's: Sign in with Apple
-- (`signInWithIdToken` cannot carry user metadata at all) and the email code
-- (`signInWithOtp`). Every iPhone user therefore got an agents row — a
-- public-profile slug, the agent nav on the web, and a row other users could
-- read until 20261025015500.
--
-- Owner approved the auth-flow change on 2026-10-25 (CLAUDE.md §8). Only the
-- default changes; the explicit 'agent' branch is untouched, and existing
-- rows are not moved (no backfill). An account created by hand in the
-- Supabase dashboard now also lands as a buyer unless its metadata says
-- {"role": "agent"}.
-- ─────────────────────────────────────────────────────────────────────

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
  user_role := coalesce(new.raw_user_meta_data->>'role', 'buyer');

  if user_role = 'buyer' then
    insert into public.buyers (user_id, display_name, email)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
      new.email
    );
    return new;
  end if;

  -- 'agent' (or any other explicit role) — unchanged from the baseline.
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
