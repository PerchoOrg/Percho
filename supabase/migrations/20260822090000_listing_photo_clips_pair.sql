-- phase85: a birdview hero clip is anchored by TWO real photos.
--
-- The owner rejected the synthetic aerial (the model invents a roofline that
-- does not exist). A birdview move is now allowed only when the listing
-- carries a real aerial photo, and the generation is submitted with BOTH
-- endpoints as real frames: the clip row's own photo is the ground shot, and
-- `pair_photo_id` is the aerial. `pair_role` says which END of the clip the
-- pair sits on: 'first' (birdview_descend opens on the aerial) or 'last'
-- (rise_to_birdview closes on it).
--
-- Additive; existing single-photo clips keep both columns null. RLS on the
-- table is unchanged (admin-only, 20260821000000).

alter table listing_photo_clips
  add column pair_photo_id uuid references listing_photos(id) on delete set null,
  add column pair_role text check (pair_role in ('first', 'last'));

comment on column listing_photo_clips.pair_photo_id is
  'Second REAL photo anchoring a birdview hero clip (the aerial). Null for single-photo clips.';
comment on column listing_photo_clips.pair_role is
  'Which end of the clip the pair photo anchors: first (descend opens on it) or last (rise closes on it).';
