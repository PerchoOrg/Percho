-- 0040_community_video_description — --
-- Add an optional free-text description to community_videos so agents can
-- write a one-line context blurb under each video (e.g. "filmed at golden
-- hour from the corner of Main & 3rd"). Replaces the yellow "needs review"
-- callout that used to occupy that slot in the management UI.
--
-- Backwards compatible: column is nullable, no default. Existing rows
-- stay null and the UI shows a "Add a description" affordance instead.

alter table public.community_videos
  add column if not exists description text;

comment on column public.community_videos.description is
  'Optional free-text caption shown under the video in the agent management UI. Not currently rendered on the public community page.';
