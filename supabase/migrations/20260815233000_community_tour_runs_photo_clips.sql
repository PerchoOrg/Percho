-- Community Tour pipeline runs + photo→clip cache (2026-08-15).
--
-- Owner flow (finalized 2026-08-15):
--   1. read community info (DB, no work)
--   2. dual-agent research (claude code + codex CLI, LOCAL DEV ONLY)
--   3. resolve+merge candidate POIs against Google Places (firewall)
--   4. <4 survivors → widen radius & re-run (hook; thresholds later)
--   5. fetch 3 photos per surviving POI (existing poi_photos pipeline)
--   6. AI tag (Gemini) → category/duration/shot_role → shot list
--   7. generate one clip PER PHOTO (photo = smallest generation unit),
--      duration 2-4s by category, cached in photo_clips (reuse across runs)
--   8. ffmpeg concat per shot list → final tour video
--
-- Every step's result is persisted so the admin page can show it later.

-- ─── community_tour_runs: one row = one pipeline run per community ─────────
create table if not exists public.community_tour_runs (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  status       text not null default 'researching'
                 check (status in (
                   'researching','resolving','fetching_photos','tagging',
                   'generating','assembled','failed'
                 )),
  -- Raw per-step outputs, keyed by step name. Persisted so the admin page
  -- renders history instead of re-running steps.
  step_results jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists community_tour_runs_community_idx
  on public.community_tour_runs (community_id, created_at desc);

alter table public.community_tour_runs enable row level security;

-- Admins read/write; writes are audited service-role only (generation costs
-- money). Mirror ai_tour_videos policy.
drop policy if exists "admin reads community_tour_runs" on public.community_tour_runs;
create policy "admin reads community_tour_runs" on public.community_tour_runs
  for select
  using (exists (select 1 from public.agents a where a.user_id = auth.uid() and a.is_admin = true));

-- ─── photo_clips: photo → generated clip cache (global, cross-community) ───
create table if not exists public.photo_clips (
  id              uuid primary key default gen_random_uuid(),
  photo_id        uuid not null unique references public.poi_photos(id) on delete cascade,
  engine          text not null check (engine in ('seedance','depthflow','kenburns')),
  duration_s      numeric(4,1),          -- 2-4s by photo category, decided at tag time
  status          text not null default 'pending'
                    check (status in ('pending','processing','ready','failed')),
  provider_job_id text,
  polling_url     text,
  storage_path    text,                  -- inside `ai-videos` bucket
  cost_usd        numeric(10,4),
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.photo_clips enable row level security;

drop policy if exists "admin reads photo_clips" on public.photo_clips;
create policy "admin reads photo_clips" on public.photo_clips
  for select
  using (exists (select 1 from public.agents a where a.user_id = auth.uid() and a.is_admin = true));
