-- ─── 0015_community_photos ─────────────────────────────────────────
-- --
-- Adds a private photo library scoped to a community. UNLIKE
-- listing_photos, these photos are NOT buyer-visible — they
-- exist solely as raw material for future AI video generation. Bucket
-- is private, RLS denies anon read.
--
-- Why a new table instead of folding into `community_videos`:
--   * Different storage backend (Supabase Storage vs Cloudflare Stream),
--     different status lifecycle (`ready` synchronously vs `processing`
--     polling), different MIME contract.
--   * `community_videos` is a hot path for public buyer queries
--     (browse-cards.ts, /v/[a]/[l]). Adding a `media_kind` discriminator
--     would force a `where media_kind = 'video'` predicate everywhere
--     and it's easy to miss one — cheaper to keep the buyer table pure.
--
-- ────────────────────────────────────────────────────────────────────
-- Pre-flight (owner action — run BEFORE applying this migration):
--   Storage → New bucket → name: 'community-photos'
--     - Public read = OFF (private; no public buyer URL)
--     - File size limit: 10 MB
--     - Allowed MIME types: image/jpeg, image/png, image/webp
-- ────────────────────────────────────────────────────────────────────

-- ─── (1) community_photos table ─────────────────────────────────────
create table public.community_photos (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references public.communities on delete cascade,

  -- Path inside the `community-photos` Supabase Storage bucket.
  -- e.g. `{community_id}/{uuid}.jpg`.
  storage_path  text not null unique,

  -- Mirrors community_videos.kind so a future ETL can pair photos →
  -- ai-generated videos by category.
  kind          text not null default 'neighborhood'
                  check (kind in ('school', 'poi', 'neighborhood')),

  -- Optional links — when kind=school link to one of the community's
  -- schools; when kind=poi link to one of the community's POIs.
  school_id     uuid references public.schools on delete set null,
  poi_id        uuid references public.pois on delete set null,

  -- Optional geo for future AI-generated nearby video metadata.
  lat           numeric(9, 6),
  lng           numeric(9, 6),

  alt_text      text,
  width         integer,
  height        integer,

  -- Photos go straight to 'ready' on insert (no async processing).
  status        text not null default 'ready'
                  check (status in ('ready', 'error')),
  sort_order    integer not null default 0,

  created_at    timestamptz not null default now()
);

create index community_photos_community_idx
  on public.community_photos (community_id, sort_order);

-- Realtime: same publication membership as community_videos so the
-- dashboard panel can use one channel for "community media updated".
alter publication supabase_realtime add table public.community_photos;
alter table public.community_photos replica identity full;

alter table public.community_photos enable row level security;

-- Authenticated agents can read+write community photos. Mirrors the
-- community_videos write policy (any authenticated agent can upload to
-- any community — communities are a shared editorial space). NO public
-- read policy → anon cannot select. That is the buyer-invisible gate.
create policy "agents manage community photos" on public.community_photos
  for all to authenticated
  using (auth.uid() in (select user_id from public.agents))
  with check (auth.uid() in (select user_id from public.agents));

-- ─── (2) Storage RLS for `community-photos` bucket ──────────────────
-- Path convention: {community_id}/{filename}. Storage RLS scopes the
-- first path segment to a real community. Agent gating mirrors the
-- table policy.

create policy "agents upload community photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'community-photos'
    and auth.uid() in (select user_id from public.agents)
    and (split_part(name, '/', 1))::uuid in (select id from public.communities)
  );

create policy "agents read community photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'community-photos'
    and auth.uid() in (select user_id from public.agents)
  );

create policy "agents delete community photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'community-photos'
    and auth.uid() in (select user_id from public.agents)
    and (split_part(name, '/', 1))::uuid in (select id from public.communities)
  );

-- No anon select policy → bucket is private; only signed URLs work.

-- ────────────────────────────────────────────────────────────────────
-- Verify after `supabase db push`:
--   select count(*) from public.community_photos;            -- 0
--   -- Storage bucket 'community-photos' visible in dashboard, public-read=OFF.
-- ────────────────────────────────────────────────────────────────────
