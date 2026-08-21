-- Photos enter the enhance queue the moment they are imported (2026-08-21).
--
-- Owner: "enhancement should happen once the pics firstly are imported."
--
-- Enhancement used to be TRIGGERED by the admin photo table — a React effect
-- that queued `none` photos while the page was open. So it ran when somebody
-- was watching and not otherwise: 2,418 of 2,580 listing photos had never been
-- enhanced at all.
--
-- phase81 moved the trigger into the tag step, which is better but still late:
-- a photo is only enhanced once someone starts a tour for its listing, and the
-- enhanced file is what the tour should have been built from in the first
-- place.
--
-- WHY THE COLUMN DEFAULT AND NOT A CALL SITE:
--   Photos arrive from at least three places — the agent's upload in the
--   listing editor, the MLS/Bridge sync, and the admin ingest scripts — and a
--   fourth will be added eventually. Every one of them inserts a row. Making
--   the DEFAULT the queue means "imported" and "queued for enhancement" are the
--   same event, and no import path can forget.
--
-- Enhancement is local (ESRGAN + ffmpeg on the Mac mini), costs no API money,
-- and sits LAST in the worker's priority order, below every render. A large
-- backlog delays nothing interactive.

alter table public.listing_photos
  alter column enhanced_status set default 'queued';

-- The existing backlog. `none` means "nobody happened to look at this photo
-- while the admin table was open", which is not a decision anyone made.
-- Deliberately does not touch 'failed': those have been tried and the tag step
-- retries them, so sweeping them in here would loop.
update public.listing_photos
   set enhanced_status = 'queued'
 where enhanced_status = 'none';

comment on column public.listing_photos.enhanced_status is
  'none | queued | processing | ready | approved | rejected | failed. Defaults to queued: a photo joins the enhance queue when it is imported. The worker writes approved on success (since 2026-08-21) — the manual gate was removed on 2026-08-17.';
