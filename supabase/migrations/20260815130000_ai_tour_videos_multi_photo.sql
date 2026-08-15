-- Follow-up to 20260815120000_ai_tour_videos.sql (2026-08-15 rev 2).
--
-- Owner correction: ALL selected photos -> ONE video (Seedance 2.0 Mini takes
-- up to 9 first-frame reference images per job), so a batch needs a photo-id
-- ARRAY, not a single poi_photo_id. The route now reads input_photo_ids and
-- never writes poi_photo_id; the old column stays for history.

alter table public.ai_tour_videos
  add column if not exists input_photo_ids uuid[] not null default '{}';
