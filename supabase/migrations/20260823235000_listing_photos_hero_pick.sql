-- listing_photos.hero_pick — the owner's manual choice of opening shot (2026-08-23).
--
-- The home tour's hero is `plan[0]`: the first shot of the cut, and the ONLY
-- shot Seedance animates (worker.py `process_plan_job`). Until now nothing
-- could name it. It fell out of `narrative_sort` — exterior first, highest
-- hero_score inside the room type — and when the tagger scored the wrong
-- exterior highest, the only lever was rejecting the photo that won, which
-- also removes it from the film (owner 2026-08-23: "most times the hero is
-- selected correctly, but in case we need to manually change").
--
-- WHY NOT REUSE the plan's `is_hero`: that flag is written BY the planner into
-- `step_results.plan`, means "one of the top-3 hero_score shots, give it the
-- long beat", and is overwritten on every re-plan. A human decision cannot
-- live in a step's output — it has to outlive the step that reads it.
--
-- One hero per listing, enforced by a partial unique index rather than by the
-- writer alone: two heroes is not a state the planner can resolve, so it must
-- not be a state the table can hold.

alter table public.listing_photos
  add column if not exists hero_pick boolean not null default false;

create unique index if not exists listing_photos_hero_pick_idx
  on public.listing_photos (listing_id)
  where hero_pick;

comment on column public.listing_photos.hero_pick is
  'Manual override for the tour''s opening shot. At most one true row per listing (partial unique index). The plan step forces it to sort_order 0, which is also the shot Seedance animates. False everywhere = let the planner choose.';
