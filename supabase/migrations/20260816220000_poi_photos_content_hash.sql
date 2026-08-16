-- poi_photos: content-based dedup
--
-- Root cause (2026-08-16): Google Places photo refs ROTATE on every response,
-- so the same image can arrive under a different `google_photo_name`. The
-- existing UNIQUE(google_photo_name) dedup misses those, and re-fetching a POI
-- after a refresh stores the same bytes twice (The Forum Peachtree Corners had
-- 13 rows for 10 distinct images).
--
-- Fix: dedup by (poi_id, content_hash) — sha256 of the stored bytes — same
-- pattern as k12_school_photos (20260718020000). The writer (community-actions
-- / listing-actions fetchPhotos*) computes the hash before upload and reuses
-- an existing row when (poi_id, content_hash) matches, refreshing
-- google_photo_name instead of inserting.

alter table public.poi_photos
  add column if not exists content_hash text;

-- Backfill: hash is computed from stored bytes. Run a one-off backfill below
-- (the app computes sha256 at fetch time; this covers rows inserted before
-- the column existed).

-- Unique per-POI content hash — the real dedup key.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'poi_photos_poi_content_hash_key') then
    alter table public.poi_photos
      add constraint poi_photos_poi_content_hash_key unique (poi_id, content_hash);
  end if;
end $$;

create index if not exists poi_photos_poi_content_hash_idx
  on public.poi_photos (poi_id, content_hash);
