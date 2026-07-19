-- ─── 0011_listing_photos_and_geo ────────────────────────────────────
-- + 11 (2026-06-12).
--
-- Two changes bundled because they ship as one product release:
--
-- (1) listing photos. New table `listing_photos`. We did NOT
--     consolidate `listing_videos` + photos into a single `listing_media`
--     table because:
--       * Existing video flow (RLS, webhook, realtime, dashboard, browse)
--         is wired to `listing_videos` in ~12 files. Renaming everything
--         in one migration is risky and slows the photo ship.
--       * Cloudflare Stream (videos) and Supabase Storage (photos) have
--         different status fields, different ownership, different lifecycle.
--         Forcing them into one table costs a discriminated `kind` column
--         and a dozen `case when` branches in queries.
--       * If we ever want a media gallery query, a SQL view UNIONing the
--         two tables is trivial. The reverse (split a merged table) is not.
--     Trade-off: two tables to read in `lib/feed/browse-cards.ts`.
--     Acceptable — already reading `community_videos` separately.
--
-- (2) geo on community_videos. The existing `community_videos`
--     table has no lat/lng, which means we cannot answer "community
--     content within X miles of my listing". Adding lat/lng lets the
--     `/nearby` page query both listings and community videos by radius
--     against the user's geolocation.
--
-- Storage backend for photos: Supabase Storage (NOT Cloudflare Images).
-- Reason: already in the stack, no new vendor / API key to procure for
-- V1. Bandwidth at our scale (handful of agents, ~15 photos per listing)
-- is well within the free tier. We can swap to Cloudflare Images later
-- if cost or transformation needs justify it — the photo URL column is
-- opaque to the rest of the app.
--
-- ────────────────────────────────────────────────────────────────────
-- Pre-flight (run once, in Supabase dashboard if not already done):
--   1. Storage → New bucket → name: 'listing-photos', public read = ON.
--      The RLS policies below enforce write-side ownership.
--   2. Storage → listing-photos bucket → Settings:
--        - File size limit: 10 MB
--        - Allowed MIME types: image/jpeg, image/png, image/webp
--   3. Confirm `pgcrypto` ext is on (it is, from 0001_init).
-- ────────────────────────────────────────────────────────────────────

-- ─── (1) listing_photos ─────────────────────────────────────────────
create table public.listing_photos (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references public.listings on delete cascade,

  -- Path inside the `listing-photos` Supabase Storage bucket.
  -- e.g. `{listing_id}/{uuid}.jpg`. Read via the public URL helper or via
  -- a signed URL if we ever lock the bucket private.
  storage_path  text not null unique,

  -- Optional human label for accessibility / future SEO alt-text.
  alt_text      text,

  -- Status mirrors `listing_videos` for parity, but photos go straight to
  -- 'ready' on insert (no async processing pipeline like Stream has).
  -- 'error' is here only for hand-mark recovery.
  status        text not null default 'ready'
                  check (status in ('ready', 'error')),

  -- -style sortable position. Cover photo is the one with
  -- min(sort_order) by default; agents can override via the cover panel
  -- (sets `listings.cover_url` directly to that photo's public URL).
  sort_order    integer not null default 0,

  -- Image dimensions captured client-side at upload time. Optional, but
  -- useful for responsive `<img sizes>` and the placeholder aspect ratio.
  width         integer,
  height        integer,

  created_at    timestamptz not null default now()
);

create index listing_photos_listing_idx
  on public.listing_photos (listing_id, sort_order);

-- Realtime: same publication membership as `listing_videos` so the edit
-- page can use one Realtime channel for "media updated".
alter publication supabase_realtime add table public.listing_photos;
alter table public.listing_photos replica identity full;

alter table public.listing_photos enable row level security;

-- Owner: full CRUD on photos belonging to listings they own.
create policy "agent manages own listing photos" on public.listing_photos
  for all using (
    listing_id in (
      select l.id from public.listings l
        join public.agents a on a.id = l.agent_id
      where a.user_id = auth.uid()
    )
  );

-- Public: read photos for published listings (parallel to listing_videos).
create policy "public reads published listing photos" on public.listing_photos
  for select using (
    listing_id in (select id from public.listings where status = 'published')
  );

-- ─── (2) Storage RLS for `listing-photos` bucket ────────────────────
-- Path convention: {listing_id}/{filename}. RLS policies fence the first
-- path segment to a listing the caller owns.
--
-- NB: Supabase Storage RLS targets `storage.objects`. Bucket id is the
-- first arg to all helpers. We do `split_part(name, '/', 1)::uuid` to
-- pull the listing_id off the path.

-- Owner upload: agent can insert objects under listings they own.
create policy "agent uploads to own listing photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (split_part(name, '/', 1))::uuid in (
      select l.id from public.listings l
        join public.agents a on a.id = l.agent_id
      where a.user_id = auth.uid()
    )
  );

-- Owner delete: agent can delete objects under listings they own.
create policy "agent deletes own listing photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'listing-photos'
    and (split_part(name, '/', 1))::uuid in (
      select l.id from public.listings l
        join public.agents a on a.id = l.agent_id
      where a.user_id = auth.uid()
    )
  );

-- Public read: bucket is public so anyone can fetch by URL. No RLS
-- needed for SELECT — bucket-level public flag handles it.

-- ─── (3) geo on community_videos ─────────────────────────
-- Why on community_videos and not on `communities` itself? A community
-- has many videos; each video is shot at a specific point (a school
-- entrance, a coffee shop, a park gate). Tagging each video lets the
-- `/nearby` query say "school videos within 2mi" without inheriting a
-- coarser community-centroid lat/lng.
alter table public.community_videos
  add column lat numeric(9, 6),
  add column lng numeric(9, 6);

-- B-tree on lat/lng for the V1 simple-radius query
-- (`abs(lat - ?) < r and abs(lng - ?) < r`). We are deliberately NOT
-- adding PostGIS — see DEVLOG 2026-06-12 for the trade-off. When we
-- have >10k community videos, swap in `geography(Point, 4326)` + GIST.
create index community_videos_geo_idx
  on public.community_videos (lat, lng)
  where lat is not null and lng is not null;

-- ─── (4) Publish gate relaxation ────────────────────────────────────
-- Existing publish flow (see app/dashboard/listings/[id]/edit/actions.ts)
-- requires ≥1 ready listing_video before allowing status='published'.
-- expands this to: at least 1 ready listing_video OR 1 ready
-- listing_photo. The check is in application code, not a DB constraint
-- (constraints can't easily reference two tables). This migration makes
-- no DB changes for this; documented here for traceability.
--
-- ────────────────────────────────────────────────────────────────────
-- Verify after `supabase db push`:
--   select count(*) from public.listing_photos;            -- 0
--   select column_name from information_schema.columns
--     where table_name = 'community_videos' and column_name in ('lat','lng');
--   -- two rows: lat, lng
--   -- Storage bucket 'listing-photos' visible in dashboard, public.
-- ────────────────────────────────────────────────────────────────────
