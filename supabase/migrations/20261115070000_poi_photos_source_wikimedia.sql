-- Photos from Wikimedia Commons (phase325).
--
-- A city film shows the city as a whole — its history, its streets, its new
-- park — and Google Places only has photographs of listed places. Suwanee's
-- pipeline photos gave about ten city-scale subjects; Commons had the 1897
-- survey map, the caboose by the tracks, Main Street and the new park's
-- bridge. 'wikimedia_commons' marks that provenance: `attribution` carries the
-- author, the licence and the file page, which a CC BY photo must be credited
-- with wherever the film is shown.
--
-- Only licences a film may use are ingested (`lib/poi/commons.ts`): public
-- domain, CC0 and CC BY. Share-alike is refused — a film is a derivative work.

alter table public.poi_photos
  drop constraint if exists poi_photos_source_check;
alter table public.poi_photos
  add constraint poi_photos_source_check
  check (source in ('google_places', 'google_streetview', 'community_site', 'wikimedia_commons'));
