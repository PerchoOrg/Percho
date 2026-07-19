-- add leads to supabase_realtime publication so the dashboard
-- /leads page receives live INSERT events when buyers submit the public form.
--
-- RLS policies (defined in 0001) still apply to Realtime: clients only receive
-- events for rows they can SELECT. Agents only see leads on their own listings.
--
-- The dashboard leads page combines this with a polling fallback (5s) gated on
-- "do we have any leads still pending notified_at" — so even if Realtime drops
-- events (server-side RLS filter quirks, network), the UI eventually settles.

alter publication supabase_realtime add table public.leads;
