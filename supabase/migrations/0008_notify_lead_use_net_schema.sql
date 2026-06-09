-- Phase 5.3 fixup #2 — call pg_net via the `net` schema, not `extensions`.
--
-- Why: pg_net's `http_post` lives in the `net` schema regardless of the
-- `create extension ... with schema extensions` clause — the extension
-- creates and owns its own `net` schema. 0006/0007 used `extensions.http_post(...)`
-- which raised at INSERT time:
--   ERROR: function extensions.http_post(url => text, headers => jsonb, body => jsonb) does not exist
-- and bubbled up to the public POST /api/leads route as `insert_failed`.
--
-- Fix: `create or replace` the trigger function with `net.http_post(...)`
-- and add `net` to the function's search_path.

create or replace function public.notify_lead_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  edge_url    constant text := 'https://tavmbcghxjeyaoptndvn.supabase.co';
  service_key text;
begin
  select decrypted_secret
    into service_key
    from vault.decrypted_secrets
   where name = 'service_role_key'
   limit 1;

  if service_key is null then
    raise warning 'notify_lead: vault secret service_role_key not set; skipping HTTP call for lead %', new.id;
    return new;
  end if;

  perform net.http_post(
    url     := edge_url || '/functions/v1/notify-lead',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'Authorization',  'Bearer ' || service_key
    ),
    body    := jsonb_build_object('lead_id', new.id)
  );

  return new;
end;
$$;
