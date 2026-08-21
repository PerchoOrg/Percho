-- listing_photo_clips.status gains 'rejected' (2026-08-21).
--
-- Owner: "the generated seedance clip for hero is really good, we should plan
-- it as a default option, unless we manually reject it."
--
-- Those two halves need each other. Once the plan step assigns Seedance to the
-- hero shot by default, discarding a bad one has to be REMEMBERED — otherwise
-- the next plan re-adds it and the next generate re-bills it, and the reject
-- button becomes a way to spend money repeatedly.
--
-- `discardListingClip` used to DELETE the row, which is right when nothing
-- would recreate it (the community tour never auto-assigns Seedance). Here the
-- row has to survive as a tombstone, so the verdict outlives the file.
--
-- 'rejected' rather than a separate boolean: every reader already switches on
-- `status`, and a rejected clip is exactly "a clip that must not be used" —
-- the same question `ready` and `failed` answer.

alter table public.listing_photo_clips
  drop constraint if exists listing_photo_clips_status_check;

alter table public.listing_photo_clips
  add constraint listing_photo_clips_status_check
  check (status in ('pending','processing','ready','failed','rejected'));

comment on column public.listing_photo_clips.status is
  'pending | processing | ready | failed | rejected. A rejected row is a tombstone: the plan step will not re-assign this engine to this photo, and generate will not re-bill it. Only a manual regenerate clears it.';
