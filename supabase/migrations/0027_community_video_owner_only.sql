-- 0027_community_video_owner_only.sql
-- Tighten community_videos write policies so an
-- agent can only update / delete videos they uploaded themselves.
--
-- Background: the original policy in 0001_init.sql was
--     for all using (auth.role() = 'authenticated')
-- which let any signed-in agent edit or delete any other agent's video.
-- That was fine when the dashboard showed "your own videos" only, but
-- phase 35.2 added a manage list that lists every video on a community
-- (so agents can see what's already there), and that exposed the gap.
--
-- Public reads stay broad — `community_videos` always allows anyone to
-- read public-visibility rows (see 0026). We only narrow writes.
--
-- Inserts: still any authenticated agent. The row's `uploaded_by` is set
-- by the server action that does the insert; we don't have a clean way
-- to require it here without breaking existing inserts that don't pass
-- the column (server defaults it from `agents.user_id = auth.uid()`).
-- Updates / deletes: the row's `uploaded_by` must match the caller's
-- agent.id. NULL `uploaded_by` (legacy rows) gets locked: nobody can
-- edit those through RLS — the V1 fleet of legacy rows is small and
-- can be touched via the service role if we ever need to.

drop policy if exists "agents manage community videos" on public.community_videos;

-- Insert: any authenticated agent can upload.
create policy "agents insert community videos"
  on public.community_videos
  for insert
  with check (auth.role() = 'authenticated');

-- Update: only the original uploader.
create policy "agents update own community videos"
  on public.community_videos
  for update
  using (
    uploaded_by in (
      select id from public.agents where user_id = auth.uid()
    )
  )
  with check (
    uploaded_by in (
      select id from public.agents where user_id = auth.uid()
    )
  );

-- Delete: only the original uploader.
create policy "agents delete own community videos"
  on public.community_videos
  for delete
  using (
    uploaded_by in (
      select id from public.agents where user_id = auth.uid()
    )
  );

comment on table public.community_videos is
  'writes locked to uploaded_by = caller''s agent.id. Reads stay open per 0026 (public visibility filter).';
