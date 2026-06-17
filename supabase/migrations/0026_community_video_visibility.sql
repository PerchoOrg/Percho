-- 0026_community_video_visibility.sql — Phase 35.2 (2026-06-17)
--
-- Add 3-state visibility to community_videos so an agent can hide a video
-- from buyers without deleting it (or shelve it permanently as `archived`).
--
--   public    — visible everywhere buyers can see (default; current behaviour)
--   private   — owner-only; suppressed from /c/[slug], /a/[agentSlug],
--               and the global swipe feed. Still listed in the dashboard.
--   archived  — same as private to buyers; the dashboard groups these
--               under a separate "Archived" lane to get them out of the
--               agent's daily working set without losing the file.
--
-- Why a single string column with a check, not an enum type:
--   - Adding values to a Postgres enum is annoying (separate transaction,
--     can't be in the same migration as data using the new value).
--   - The set is small and stable. A check constraint is fine.
--
-- RLS change: public read now filters to visibility='public'. The
-- "agents manage community videos" policy stays open to authenticated
-- users (V1: multi-agent communities still share manage). Tightening the
-- write policy to `uploaded_by = auth.uid()` is a separate change that
-- needs a sweep through the editor code first.
--
-- The community_video_extra_links public-read policy is left as
-- `using (true)` because joins through community_videos already drop
-- non-public rows via this new RLS filter.

-- ─── 1. column + backfill ────────────────────────────────────────

alter table public.community_videos
  add column if not exists visibility text not null default 'public';

alter table public.community_videos
  add constraint community_videos_visibility_check
  check (visibility in ('public', 'private', 'archived'));

-- Existing rows: everything stays public (the column default already
-- handles new inserts; this is just explicit for the audit trail).
update public.community_videos
   set visibility = 'public'
 where visibility is null;

-- ─── 2. tighten public-read RLS ─────────────────────────────────

drop policy if exists "public reads community videos" on public.community_videos;

create policy "public reads public community videos"
  on public.community_videos
  for select
  using (visibility = 'public');

-- ─── 3. index for dashboard manage-list grouping ─────────────────

create index if not exists community_videos_community_visibility_idx
  on public.community_videos (community_id, visibility);

comment on column public.community_videos.visibility is
  'Phase 35.2: public (buyers see) | private (hidden from buyers, kept in agent dashboard) | archived (hidden, parked in dashboard archive lane).';
