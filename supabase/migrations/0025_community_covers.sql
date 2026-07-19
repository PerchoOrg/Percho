-- ─── 0025_community_covers ──────────────────────────────────────────
-- --
-- Each community gets an editable "cover" — agent picks either one of
-- the community's videos OR uploads an image. Cover renders on:
--   * /communities (buyer grid card, 9:16)
--   * /c/[slug] (buyer detail header hero)
--   * /saved (Communities tab cards)
--
-- Two columns instead of one polymorphic ref so reads stay trivial
-- (`select cover_video_id, cover_storage_path` — no kind discriminator)
-- and DB-level cleanup works (FK ON DELETE SET NULL on the video link).
--
-- Resolution priority at render time (in app code, not SQL):
--   1. cover_video_id → Cloudflare Stream poster
--   2. cover_storage_path → public URL in `community-covers` bucket
--   3. fallback: first ready video poster (existing behavior)
--   4. fallback: blank
--
-- Storage backend: NEW public bucket `community-covers`. We can NOT
-- reuse `community-photos` because that bucket is private (signed-URL
-- only, dashboard-internal) and the cover must be readable by anon
-- buyers. Reusing it would force every buyer page render to hit the
-- sign endpoint per community card — too expensive and adds latency.
-- ────────────────────────────────────────────────────────────────────

-- ─── (1) communities columns ───────────────────────────────────────

alter table public.communities
  add column if not exists cover_video_id uuid
    references public.community_videos(id) on delete set null,
  add column if not exists cover_storage_path text;

-- Defense in depth: cannot have both set. App-level UI also prevents
-- this (clicking "pick video" clears storage_path and vice versa).
alter table public.communities
  add constraint communities_cover_xor_chk
    check (cover_video_id is null or cover_storage_path is null);

-- ─── (2) community-covers public bucket ─────────────────────────────
-- Public-read so anon buyers can fetch without signed URLs. Write
-- access is fenced by RLS (only the community's creating agent, or
-- any agent if created_by is null, matching the editor permission
-- rule in app/dashboard/communities/[id]/page.tsx).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-covers', 'community-covers', true, 10485760,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ─── (3) Storage RLS for `community-covers` bucket ──────────────────
-- Path convention: {community_id}/{filename}. Same shape as
-- `community-photos`. Owner-write check mirrors who can edit the
-- community row itself.

drop policy if exists "agent uploads to own community covers" on storage.objects;
create policy "agent uploads to own community covers" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'community-covers'
    and (split_part(name, '/', 1))::uuid in (
      select c.id from public.communities c
        left join public.agents a on a.id = c.created_by
      where c.created_by is null
         or a.user_id = auth.uid()
    )
  );

drop policy if exists "agent deletes own community covers" on storage.objects;
create policy "agent deletes own community covers" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'community-covers'
    and (split_part(name, '/', 1))::uuid in (
      select c.id from public.communities c
        left join public.agents a on a.id = c.created_by
      where c.created_by is null
         or a.user_id = auth.uid()
    )
  );

drop policy if exists "agent updates own community covers" on storage.objects;
create policy "agent updates own community covers" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'community-covers'
    and (split_part(name, '/', 1))::uuid in (
      select c.id from public.communities c
        left join public.agents a on a.id = c.created_by
      where c.created_by is null
         or a.user_id = auth.uid()
    )
  );

-- Public read: bucket-level public flag handles SELECT. No row policy
-- needed.

-- ────────────────────────────────────────────────────────────────────
-- Verify after `supabase db push`:
--   select column_name from information_schema.columns
--     where table_name = 'communities'
--       and column_name in ('cover_video_id','cover_storage_path');
--   -- two rows
--   select id from storage.buckets where id = 'community-covers';
--   -- 1 row
-- ────────────────────────────────────────────────────────────────────
