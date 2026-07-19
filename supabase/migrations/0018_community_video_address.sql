-- 0018_community_video_address — --
-- Adds a free-text `address` to community_videos so agents can write a
-- human-readable location ("Smith Park, 123 Main St") instead of being
-- forced to pick a POI/school from a dropdown. lat/lng (added in 0011)
-- continues to back the Nearby query and is now silently filled by the
-- browser's geolocation when address is empty — never surfaced in the UI.
--
-- Backwards compatible: column is nullable.

alter table public.community_videos
  add column if not exists address text;

comment on column public.community_videos.address is
  'human-readable address typed by uploader. May be null when only lat/lng (silent geo) is recorded.';
