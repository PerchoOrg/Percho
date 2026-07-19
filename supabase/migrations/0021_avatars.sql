-- ─── 0021_avatars ───────────────────────────────────────────────────
-- User avatar picker + upload.
--
-- Scope:
--   * Add `avatar_url` to `public.buyers` (mirrors `agents.headshot_url`
--     which already exists from 0001_init.sql).
--   * Storage RLS for the `avatars` bucket: any authenticated user can
--     write under their own `{user_id}/...` prefix; everyone can read.
--
-- Why one shared bucket (not `agent-avatars` + `buyer-avatars`):
--   A user is exactly one of agent/buyer in V1, identified by
--   `auth.uid()`. Path-prefix RLS by user_id is unambiguous and avoids
--   role-table joins in storage policies (cheaper, simpler).
--
-- Why we DON'T rename `agents.headshot_url` to `avatar_url`:
--   The column is already referenced by `/a/[agentSlug]/page.tsx` and
--   would force a rename in app code + a non-trivial prod migration.
--   The UI layer normalises both fields to "avatar" — DB columns stay
--   put. Surgical changes only.
--
-- ────────────────────────────────────────────────────────────────────
-- Pre-flight (owner action — run BEFORE applying this migration):
--   Storage → New bucket → name: 'avatars'
--     - Public read = ON
--     - File size limit: 5 MB
--     - Allowed MIME types: image/webp, image/jpeg, image/png
-- ────────────────────────────────────────────────────────────────────

-- ─── (1) buyers.avatar_url ──────────────────────────────────────────
alter table public.buyers
  add column if not exists avatar_url text;

-- ─── (2) Storage RLS on the `avatars` bucket ────────────────────────
-- Path convention: `{auth.uid()}/{uuid}.webp`. The first path segment
-- MUST equal the caller's auth.uid() — fence both writes and deletes.
-- Public reads are handled by the bucket-level public flag; no select
-- policy required here.

drop policy if exists "users upload own avatar" on storage.objects;
create policy "users upload own avatar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (split_part(name, '/', 1))::uuid = auth.uid()
  );

drop policy if exists "users update own avatar" on storage.objects;
create policy "users update own avatar" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (split_part(name, '/', 1))::uuid = auth.uid()
  )
  with check (
    bucket_id = 'avatars'
    and (split_part(name, '/', 1))::uuid = auth.uid()
  );

drop policy if exists "users delete own avatar" on storage.objects;
create policy "users delete own avatar" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (split_part(name, '/', 1))::uuid = auth.uid()
  );

-- ────────────────────────────────────────────────────────────────────
-- Verify after `supabase db push`:
--   select column_name from information_schema.columns
--     where table_schema='public' and table_name='buyers' and column_name='avatar_url';
--   -- Storage bucket 'avatars' visible in dashboard, public-read=ON.
-- ────────────────────────────────────────────────────────────────────
