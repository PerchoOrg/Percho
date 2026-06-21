-- Phase 46: Simplify listing/community status to active|inactive only.
--
-- Listings: collapse three-state (draft|published|archived) → two-state
-- (active|inactive). Mapping:
--   published  → active
--   draft      → inactive
--   archived   → inactive   (archive concept removed entirely; users
--                            simply deactivate or delete)
--
-- Communities: brand-new `status` column with the same two-state model,
-- defaulting to 'active' (existing communities all stay buyer-visible).
--
-- RLS notes:
--   * Public read of listings now gates on status='active'.
--   * Public read of listing_videos / listing_photos cascades to the
--     same gate.
--   * Communities RLS stays open (no buyer visibility change in p46).

-- ─── listings ───────────────────────────────────────────────────────
-- Drop old policy + index that reference 'published'.
drop policy if exists "public reads published listings" on public.listings;
drop policy if exists "public reads published listing videos" on public.listing_videos;
drop policy if exists "public reads published photos" on public.photos;
drop policy if exists "public reads published listing photos" on public.listing_photos;
drop index if exists public.listings_status_idx;

-- Drop the old check constraint (auto-named listings_status_check by Postgres).
alter table public.listings drop constraint if exists listings_status_check;

-- Backfill: published → active, everything else → inactive.
update public.listings
   set status = case when status = 'published' then 'active' else 'inactive' end;

-- New constraint + default.
alter table public.listings
  alter column status set default 'inactive',
  add constraint listings_status_check
    check (status in ('active', 'inactive'));

-- New index for buyer-visible listings.
create index listings_status_idx on public.listings (status) where status = 'active';

-- New public read policies (active replaces published).
create policy "public reads active listings" on public.listings
  for select using (status = 'active');

create policy "public reads active listing videos" on public.listing_videos
  for select using (
    listing_id in (select id from public.listings where status = 'active')
  );

create policy "public reads active photos" on public.photos
  for select using (
    listing_id in (select id from public.listings where status = 'active')
  );

create policy "public reads active listing photos" on public.listing_photos
  for select using (
    listing_id in (select id from public.listings where status = 'active')
  );

-- ─── communities ────────────────────────────────────────────────────
-- Add status column, default 'active' for backfill so no existing
-- community goes dark for buyers. Buyer-facing visibility is NOT
-- gated by status in phase 46 (RLS stays open) — the column drives
-- dashboard UI only.
alter table public.communities
  add column if not exists status text not null default 'active'
    check (status in ('active', 'inactive'));
