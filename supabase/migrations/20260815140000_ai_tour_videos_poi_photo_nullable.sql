-- Follow-up to 20260815120000/130000 (2026-08-15 rev 3).
--
-- The route stopped writing poi_photo_id when multi-photo batches landed
-- (input_photo_ids uuid[] is now the single source). The old column kept its
-- NOT NULL constraint, so enqueue failed with:
--   null value in column "poi_photo_id" of relation "ai_tour_videos"
-- Drop the constraint; the column stays (nullable) for history.

alter table public.ai_tour_videos
  alter column poi_photo_id drop not null;
