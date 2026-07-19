-- vision tagging fields for POI photo allocator
--
-- Adds `applicable_buckets text[]` as a top-level column so the allocator can
-- filter photos by target buyer-question bucket with a GIN index (fast) rather
-- than a jsonb path query. Everything else the vision tagger returns
-- (description, primary_category, subject tags, mood, etc.) lives inside the
-- existing `ai_tags jsonb` column — no schema churn, one round-trip per photo.
--
-- ai_tags shape (populated by lib/poi/vision-tagger.ts, Claude Sonnet 4.5):
--   {
--     description: "storefront of Publix at dusk, warm interior glow",
--     primary_category: "storefront" | "interior" | "food" | "landscape" | "aerial" | "people" | "other",
--     tags: ["night", "warm-light", "grocery"],
--     mood: "inviting",
--     usable: true,
--     reason: null
--   }
-- ai_score (already numeric(3,2)) is the tagger's 0-1 quality/relevance score.
--
-- Buckets mirror lib/poi/types.ts INTENT_BUCKETS:
--   walkable | daily_drive | lifestyle | commute

alter table public.poi_photos
  add column if not exists applicable_buckets text[] not null default '{}';

-- GIN index — allocator does `applicable_buckets @> array['daily_drive']`
-- across the whole listing's approved-photo pool on every generate call.
create index if not exists poi_photos_applicable_buckets_idx
  on public.poi_photos using gin (applicable_buckets);

-- Small helper index for the orientation preference — allocator reads
-- (width_px, height_px) and prefers portrait (h > w). No dedicated index
-- needed since we always filter by poi_id / applicable_buckets first, but
-- annotate the intent.
comment on column public.poi_photos.applicable_buckets is
  'Buckets this photo works well in (walkable/daily_drive/lifestyle/commute/community). Populated by vision tagger. Empty = untagged, allocator will fall back to legacy behavior.';

-- Bump generated_videos.status to include 'superseded' — regenerate
-- marks the old row superseded so its input_photo_ids are released back to
-- the allocator pool.
--
-- generated_videos.status is a plain text with a check constraint; we can't
-- alter the check in-place portably, so drop-and-recreate.
do $$
declare
  cname text;
begin
  select conname into cname
    from pg_constraint
   where conrelid = 'public.generated_videos'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%status%';
  if cname is not null then
    execute format('alter table public.generated_videos drop constraint %I', cname);
  end if;
end
$$;

alter table public.generated_videos
  add constraint generated_videos_status_check
  check (status in ('pending','processing','ready','failed','superseded'));
