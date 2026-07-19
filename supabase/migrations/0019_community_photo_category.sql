-- 0019_community_photo_category — --
-- Adds the same 12-category axis to community_photos that we put on
-- community_videos in 0017. Photos still aren't buyer-visible (private
-- bucket, raw material for AI video generation), but tagging them at
-- upload time means future AI assembly can group images by category
-- without having to infer it from pixels.
--
-- Backwards compatible: column is nullable. Existing rows get a
-- conservative default (`neighborhood_walk` — the closest analogue to
-- the legacy `kind='neighborhood'` value). We do NOT mark them
-- needs_review for now because nothing reads that flag for photos.

alter table public.community_photos
  add column if not exists category text;

update public.community_photos
  set category = case
    when kind = 'school' then 'school_run'
    when kind = 'poi' then 'walk_the_block'
    else 'neighborhood_walk'
  end
  where category is null;

comment on column public.community_photos.category is
  '12-value taxonomy — same axis as community_videos.category. '
  'See lib/zod/community-video-categories.ts for the list. Nullable for '
  'backwards compat; new uploads should always set it.';
