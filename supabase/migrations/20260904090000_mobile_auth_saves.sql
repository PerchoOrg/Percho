-- ─── mobile_auth_saves ──────────────────────────────────────────────
--
-- Phase B of the store launch: the mobile app gets real accounts
-- (Sign in with Apple + email OTP via Supabase Auth), and Saved moves
-- from device-local AsyncStorage to the server.
--
-- `saved_listings` / `saved_communities` were built for this day
-- (baseline 0016: "When buyer auth lands, a follow-up phase merges
-- `device_id` rows into `user_id` rows"). The mobile client is that
-- phase, with one simplification: an authenticated save is written with
-- `device_id = user_id::text`, so the existing (device_id, item_id)
-- primary key dedupes per USER and the same account on two phones never
-- double-saves. Web's anonymous device-id rows (service-role only) are
-- untouched and still invisible to clients.
--
-- RLS: baseline left both tables deny-all. These policies open exactly
-- the authenticated user's own rows — anon still sees nothing.
-- ─────────────────────────────────────────────────────────────────────

create policy "user reads own saves" on public.saved_listings
  for select to authenticated
  using (user_id = auth.uid());

create policy "user saves listings" on public.saved_listings
  for insert to authenticated
  with check (user_id = auth.uid() and device_id = auth.uid()::text);

create policy "user unsaves listings" on public.saved_listings
  for delete to authenticated
  using (user_id = auth.uid());

create policy "user reads own community saves" on public.saved_communities
  for select to authenticated
  using (user_id = auth.uid());

create policy "user saves communities" on public.saved_communities
  for insert to authenticated
  with check (user_id = auth.uid() and device_id = auth.uid()::text);

create policy "user unsaves communities" on public.saved_communities
  for delete to authenticated
  using (user_id = auth.uid());

-- RLS policies gate rows, but the roles also need table-level grants —
-- baseline deliberately granted nothing ("service-role only by default").
grant select, insert, delete on public.saved_listings to authenticated;
grant select, insert, delete on public.saved_communities to authenticated;
