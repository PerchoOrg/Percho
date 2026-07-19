-- ─────────────────────────────────────────────────────────────────
-- 0020_buyer_self_insert.sql
--
-- Allow a buyer to insert their own row into public.buyers.
--
-- Background: 0012 created the buyers table with self_select + self_update
-- RLS but no self_insert policy. The intent was that handle_new_user (a
-- security-definer trigger) would insert the row at signup. Two cases break
-- that assumption:
--   1. Legacy users that signed up before 0012 was applied — they have an
--      auth.users row but no buyers row.
--   2. Users that signed up as 'agent' (default) and later need a buyer
--      row — currently impossible to backfill from app code.
--
-- 's inline display-name editor needs to upsert into buyers from
-- the user's session, so we add a tightly scoped self-insert policy:
-- buyers can ONLY insert their own row (user_id = auth.uid()).
-- ─────────────────────────────────────────────────────────────────

drop policy if exists "buyers_self_insert" on public.buyers;
create policy "buyers_self_insert" on public.buyers
  for insert with check (auth.uid() = user_id);
