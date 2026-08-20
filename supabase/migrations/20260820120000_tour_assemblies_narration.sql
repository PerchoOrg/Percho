-- tour_assemblies.narration — the timed script the worker speaks.
--
-- Narration is written by the plan step, where the shot list first exists, and
-- spoken by the render worker, which is the only place the real timeline is
-- known (clips are ffprobe'd and laid out with 0.5s crossfades). This column is
-- how the script gets from one to the other, alongside `ordered_clips`.
--
-- Shape:
--   {
--     "voice": "Aoede",
--     "segments": [
--       {"index": 0, "startClip": 0, "endClip": 12, "text": "...", "words": 26}
--     ]
--   }
--
-- `startClip`/`endClip` index into `ordered_clips` and are the ANCHOR. The
-- seconds the plan step estimated are deliberately not the contract: rendered
-- clips come back about half a second longer than planned, which happens to
-- cancel the crossfade overlap almost exactly — close enough to look correct
-- and not a thing to place audio on.
--
-- Nullable. An assembly written before this column, or one whose narration call
-- failed, renders with music alone exactly as before.

alter table public.tour_assemblies
  add column if not exists narration jsonb;

comment on column public.tour_assemblies.narration is
  'Timed narration from the plan step: {voice, segments:[{index,startClip,endClip,text,words}]}. Clip indices reference ordered_clips. Null renders music-only.';
