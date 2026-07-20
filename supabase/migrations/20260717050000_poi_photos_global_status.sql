-- global reject bit on poi_photos.
--
-- Context: poi_photos is a globally-deduped photo pool (one row per
-- google_photo_name, shared across every listing + community that
-- references the same POI). Per-scope approval already exists via
-- listing_poi_photos.status / community_poi_photos.status.
--
-- New: an admin-level "kill switch" that removes a photo everywhere at
-- once — bad crop, wrong subject, adult content, wrong attribution, etc.
-- Video generation filters this in a single place (lib/poi/*-video-actions.ts).
-- Per-scope approval stays as a curation layer on top.

alter table public.poi_photos
  add column if not exists status text not null default 'pending',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.agents(id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'poi_photos_status_chk') then
    alter table public.poi_photos
      add constraint poi_photos_status_chk
      check (status in ('pending','approved','rejected')) not valid;
    alter table public.poi_photos validate constraint poi_photos_status_chk;
  end if;
end $$;

create index if not exists poi_photos_status_idx
  on public.poi_photos (status)
  where status <> 'pending';
