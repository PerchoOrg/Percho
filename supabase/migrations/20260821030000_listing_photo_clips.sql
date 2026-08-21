-- listing_photo_clips — photo -> clip cache for the home tour (2026-08-21).
--
-- Owner 2026-08-20: "lets follow the same pattern, so we can more control on
-- the single photos, for better quality or rendering."
--
-- Until now a home tour was ONE ffmpeg pass: N photos, cross-faded, straight
-- to an mp4. The smallest thing you could redo was the whole film. This makes
-- the photo the unit, exactly as `photo_clips` did for the community tour on
-- 2026-08-15 — one clip per photo, cached, re-renderable on its own.
--
-- WHY A SEPARATE TABLE AND NOT `photo_clips`:
--   `photo_clips.photo_id` is `not null references poi_photos(id)`. Carrying
--   listing photos there means making it nullable, adding a second nullable
--   FK, a CHECK that exactly one is set, and a new unique index — after which
--   every existing reader (worker.py, seedance-worker, four admin pages,
--   admin-clip-actions, admin-nearby-photos) has to handle both shapes.
--   The repo already answers this question the other way: listing_pois /
--   community_pois and listing_poi_photos / community_poi_photos are separate
--   tables and `lib/poi/entity-scope.ts` parameterises the one code path over
--   them (ARCHITECTURE.md, "parameterised by entity rather than copied").
--
-- WHAT IS DIFFERENT FROM photo_clips: `surface`.
--   A community tour renders one canvas (1080x1576). A home tour renders two —
--   the iOS feed card and the 16:9 web player — and a clip's pixels are a
--   function of its canvas, so the same photo has a different clip per
--   surface. That is why surface is in the unique key and not a render-time
--   argument.
--
--   iOS renders at 1080x1576, the SAME canvas as the community tour. The old
--   home tour rendered 1080x1080 on the strength of a 2026-07-28 note that the
--   feed card's media block was 1:1; the 2026-08-17 card unification made every
--   card one frame (theme/card-frame.ts) and left that square render behind,
--   cropping 31.5% of every frame's width under fit="cover".
--
-- SEEDANCE IS HERO-ONLY.
--   Allowed in the CHECK because the owner wants an AI hero shot (2026-08-20:
--   "i may need seedback for the first picture or last one, as hero photo").
--   The constraint that it may only land on the first or last shot lives in the
--   plan step, not here: it is a property of a photo's position in a cut, which
--   a per-photo row cannot see.

create table if not exists public.listing_photo_clips (
  id               uuid primary key default gen_random_uuid(),
  listing_photo_id uuid not null references public.listing_photos(id) on delete cascade,
  -- Which canvas this clip's pixels were rendered for.
  surface          text not null check (surface in ('ios','web')),
  engine           text not null check (engine in ('kenburns','depthflow','seedance')),
  -- The camera move the plan chose (Ken Burns mode / DepthFlow move / Seedance
  -- camera token). Decided at plan time so the worker renders what was
  -- reviewed rather than re-deriving it.
  move             text,
  duration_s       numeric(4,1),
  status           text not null default 'pending'
                     check (status in ('pending','processing','ready','failed')),
  provider_job_id  text,
  polling_url      text,
  storage_path     text,                  -- inside the `ai-videos` bucket
  -- Fingerprint of the inputs the FILE was produced from (canvas, engine,
  -- move, duration, photo version). Mismatch => re-render. Same mechanism as
  -- photo_clips.render_key, which exists because three plan-only changes once
  -- shipped undetected (see 20260819220000).
  render_key       text,
  prompt           text,                  -- seedance only; NULL for local engines
  ai_generated     boolean not null default false,
  cost_usd         numeric(10,4),
  error            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- One clip per (photo, engine, surface). A photo may carry a Ken Burns and a
-- DepthFlow clip at once — the plan picks which one the cut uses, and having
-- both means switching engines costs nothing.
create unique index if not exists listing_photo_clips_photo_engine_surface_key
  on public.listing_photo_clips (listing_photo_id, engine, surface);

-- The worker's claim query: oldest pending row for the engines it renders.
create index if not exists listing_photo_clips_status_created_idx
  on public.listing_photo_clips (status, created_at)
  where status = 'pending';

create trigger listing_photo_clips_touch before update on public.listing_photo_clips
  for each row execute function public.touch_updated_at();

alter table public.listing_photo_clips enable row level security;

-- Admin read only; the surface is admin-only and generation costs money.
-- Writes are service-role, from the generate step and the render worker.
drop policy if exists "admin reads listing_photo_clips" on public.listing_photo_clips;
create policy "admin reads listing_photo_clips" on public.listing_photo_clips
  for select
  using (exists (select 1 from public.agents a where a.user_id = auth.uid() and a.is_admin = true));

comment on column public.listing_photo_clips.surface is
  'Which canvas the clip was rendered for: ios = 1080x1576 (the feed card, same as the community tour), web = 1920x1080. Part of the unique key because the canvas changes the pixels.';
comment on column public.listing_photo_clips.render_key is
  'Fingerprint of the inputs this clip was rendered from. Mismatch => re-render. Seedance rows are never auto-requeued.';
