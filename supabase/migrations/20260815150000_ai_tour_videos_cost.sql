-- AI tour videos: track OpenRouter generation cost per video (2026-08-15).
-- Worker writes usage.cost from the poll response when a job completes.

alter table public.ai_tour_videos
  add column if not exists cost_usd numeric(10, 4);
