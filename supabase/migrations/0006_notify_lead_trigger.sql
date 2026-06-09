-- Phase 5.3 — notify-lead trigger.
--
-- Goal: when a row lands in `public.leads`, fire off an HTTP POST to the
-- `notify-lead` Supabase Edge Function (which calls Resend). The function
-- itself owns the idempotency check (`notified_at IS NULL`) so this trigger
-- can be unconditional on AFTER INSERT.
--
-- pg_net is Supabase's built-in async HTTP-from-Postgres extension. It
-- queues requests on a worker — the INSERT does not block on the HTTP call.
-- That's important: we don't want the public POST /api/leads response time
-- coupled to Resend's latency or the Edge Function cold start.
--
-- Required Postgres settings (set once via Supabase dashboard or the SQL
-- below — kept here for reproducibility):
--   app.settings.supabase_url      = 'https://<project-ref>.supabase.co'
--   app.settings.service_role_key  = '<service role JWT>'
--
-- The trigger reads these via `current_setting(..., true)` so a missing
-- setting yields NULL instead of erroring out the INSERT — better to log
-- the lead and lose the email than to lose the lead.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_lead_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  edge_url   text;
  service_key text;
begin
  edge_url    := current_setting('app.settings.supabase_url',     true);
  service_key := current_setting('app.settings.service_role_key', true);

  if edge_url is null or service_key is null then
    raise warning 'notify_lead: app.settings.supabase_url / service_role_key not configured; skipping HTTP call for lead %', new.id;
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

drop trigger if exists notify_lead_after_insert on public.leads;
create trigger notify_lead_after_insert
  after insert on public.leads
  for each row execute function public.notify_lead_on_insert();
