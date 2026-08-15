-- AI tour videos (2026-08-15) — admin-triggered Seedance clip for a community.
--
-- Owner ask: on /admin/pipeline/community-nearby/<id>, pick photos with a
-- per-row checkbox and turn them into ONE AI video via OpenRouter
-- (bytedance/seedance-2.0-mini).
--
-- ONE ROW PER BATCH (2026-08-15 rev 2): Seedance 2.0 Mini accepts up to 9
-- `first_frame` reference images in a single job and weaves them into ONE
-- video, so all selected photos go in `input_photo_ids` and one row = one
-- provider job = one output clip.
--
-- WHY NOT `generated_videos`: that table is the ffmpeg/Cloudflare render
-- pipeline the EC2 worker polls (scope + intent_bucket + input_photo_ids[] +
-- cf_stream_uid). These rows are a different generator with a different
-- lifecycle (provider job id, polling url, mp4 in Supabase Storage) and are
-- NOT consumed by any buyer-facing surface yet — admin preview only. Bolting
-- them onto generated_videos would put rows the render worker doesn't
-- understand into its queue.

create table if not exists public.ai_tour_videos (
  id              uuid primary key default gen_random_uuid(),
  community_id    uuid not null references public.communities(id) on delete cascade,
  -- Photo ids that fed this batch (all selected photos -> ONE video).
  input_photo_ids uuid[] not null default '{}',
  -- Final per-clip prompt, frozen at enqueue time (base prompt + POI name), so
  -- a result stays auditable after the admin edits the box for the next batch.
  prompt          text not null,
  model           text not null,
  duration_s      integer not null default 8,
  aspect_ratio    text not null default '9:16',
  status          text not null default 'pending'
                    check (status in ('pending','submitting','processing','ready','failed')),
  provider_job_id text,                       -- OpenRouter video job id
  polling_url     text,                       -- OpenRouter-supplied poll endpoint
  storage_path    text,                       -- path inside the `ai-videos` bucket
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Follow-up (2026-08-15 rev 2): the first version of this migration shipped
-- `poi_photo_id uuid` (one row per photo). The owner corrected the model:
-- ALL selected photos -> ONE video. Keep this additive so a DB that already
-- ran v1 stays in sync; the route now reads input_photo_ids and never writes
-- poi_photo_id.
alter table public.ai_tour_videos
  add column if not exists input_photo_ids uuid[] not null default '{}';

create index if not exists ai_tour_videos_community_idx
  on public.ai_tour_videos (community_id, created_at desc);

-- Partial index for the pump's "anything still moving?" query.
create index if not exists ai_tour_videos_live_idx
  on public.ai_tour_videos (status)
  where status in ('pending','submitting','processing');

alter table public.ai_tour_videos enable row level security;

-- Admins read; every write goes through the service role in
-- app/api/admin/community-tour/[id]/ai-video/route.ts (which gates on
-- requireAdmin first). No client write policy on purpose — generating a clip
-- costs money, so the only path is the audited route.
drop policy if exists "admin reads ai_tour_videos" on public.ai_tour_videos;
create policy "admin reads ai_tour_videos" on public.ai_tour_videos
  for select
  using (exists (select 1 from public.agents a where a.user_id = auth.uid() and a.is_admin = true));

-- ─── `ai-videos` bucket ─────────────────────────────────────────────
-- Public read so the admin <video> tag (and, later, any buyer surface) can
-- play the mp4 without signed URLs — same call as `community-covers`. 200 MB
-- cap: a 12 s 1080p Seedance clip is single-digit MB, so this is only a
-- runaway guard.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ai-videos', 'ai-videos', true, 209715200, array['video/mp4'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No storage.objects insert/update/delete policy for `ai-videos`: the route
-- writes with the service role, which bypasses RLS. Public read comes from
-- buckets.public = true.
