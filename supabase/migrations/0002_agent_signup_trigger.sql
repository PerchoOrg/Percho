-- ─────────────────────────────────────────────────────────────────
-- 0002_agent_signup_trigger.sql
--
-- When a new user signs up via Supabase Auth, automatically create a
-- corresponding agents row. The slug defaults to the email local-part
-- (lowercased, sanitized); the agent can change it later via the
-- dashboard profile editor.
--
-- This avoids a chicken-and-egg in the dashboard always
-- expects an agents row to exist for auth.uid().
-- ─────────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_slug text;
  candidate text;
  n         int := 0;
begin
  -- Derive a slug from the email local-part: foo.bar+tag@gmail.com -> 'foo-bar'
  base_slug := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  if base_slug = '' or base_slug is null then
    base_slug := 'agent';
  end if;

  candidate := base_slug;
  -- Resolve slug collisions by appending -2, -3, ...
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
