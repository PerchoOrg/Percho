-- Phase 5.3 fixup — switch notify_lead trigger from `app.settings.*` to Supabase Vault.
--
-- Why: Supabase hosted Postgres does not grant the `postgres` role permission
-- to `alter database postgres set app.settings.* = ...` (error 42501). 0006
-- assumed self-hosted-style superuser settings. The hosted-supported path is
-- `vault.decrypted_secrets` for the service_role_key. The project URL is not
-- a secret (it's in every browser request to the Edge Function), so we
-- hardcode it here for the single production project.
--
-- Project ref: tavmbcghxjeyaoptndvn  (production, single Supabase project)
--
-- One-time manual step after this migration applies (Dashboard → SQL Editor):
--   select vault.create_secret('<service role JWT>', 'service_role_key');
-- Verify with:
--   select name from vault.secrets;        -- expect: service_role_key
--
-- The trigger reads vault via `vault.decrypted_secrets`. Missing secret → warn
-- and let the INSERT succeed (better to keep the lead than fail the form).

create or replace function public.notify_lead_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
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

  perform extensions.http_post(
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
