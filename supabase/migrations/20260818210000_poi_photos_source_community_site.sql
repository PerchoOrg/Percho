-- Allow photos that did not come from Google (phase56).
--
-- An HOA pool, clubhouse or entrance gate is not a listed business, so Google
-- Places has no photos of it. The 'amenities' bucket is fed from the
-- community's own website instead, by scripts/admin/ingest-community-photos.ts.
-- 'community_site' marks that provenance so attribution and re-fetch logic can
-- tell the two apart — a Google photo can be re-fetched from its
-- google_photo_name; an ingested one cannot.

alter table public.poi_photos
  drop constraint if exists poi_photos_source_check;
alter table public.poi_photos
  add constraint poi_photos_source_check
  check (source in ('google_places', 'google_streetview', 'community_site'));
