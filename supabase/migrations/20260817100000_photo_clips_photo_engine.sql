-- photo_clips: allow one clip per (photo, engine) instead of one per photo.
-- A photo can have BOTH a seedance clip (paid AI) and a depthflow/kenburns
-- clip (local render service). The per-photo Generate button creates the
-- engine row implied by the shot list; the render worker consumes
-- depthflow/kenburns rows locally, the seedance worker consumes seedance rows
-- via OpenRouter.

alter table public.photo_clips
  drop constraint if exists photo_clips_photo_id_key;

create unique index if not exists photo_clips_photo_engine_key
  on public.photo_clips (photo_id, engine);
