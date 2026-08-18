-- Follow-up to 20260815120000/130000 (2026-08-15 rev 3).
--
-- The route stopped writing poi_photo_id when multi-photo batches landed
-- (input_photo_ids uuid[] is now the single source). The old column kept its
-- NOT NULL constraint, so enqueue failed with:
--   null value in column "poi_photo_id" of relation "ai_tour_videos"
-- Drop the constraint; the column stays (nullable) for history.
--
-- Guarded (2026-08-17): 20260815120000 was edited in place after it had already
-- been applied — its first revision created `poi_photo_id`, the current text
-- does not. So a database that ran rev 1 HAS the column while a fresh replay
-- never creates it, and this migration used to abort the whole chain with
--   ERROR: column "poi_photo_id" of relation "ai_tour_videos" does not exist
-- That made the schema unreplayable, which is why `pnpm db:types` was never
-- runnable and database.types.ts stayed a stub. Making this conditional is
-- what unblocks a from-scratch `supabase db reset`.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_tour_videos'
      and column_name = 'poi_photo_id'
  ) then
    alter table public.ai_tour_videos
      alter column poi_photo_id drop not null;
  end if;
end $$;
