-- 0023: community video N:N extra links
--
-- Each community_video already has a single primary
-- community_id (the one the uploading agent picks at upload time). To support
-- "this video also makes sense in these other communities" without forcing
-- agents to re-upload, we add a side table that records additional memberships.
-- The original community_videos.community_id stays put — it's still the
-- "origin / primary" community and continues to drive existing queries.
--
-- The unified membership view (community_video_membership) collapses primary +
-- extras so /c/[slug] pages can do one read.

create table public.community_video_extra_links (
  community_id uuid not null references public.communities on delete cascade,
  video_id     uuid not null references public.community_videos on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (community_id, video_id)
);

create index cvel_community_idx on public.community_video_extra_links (community_id);
create index cvel_video_idx     on public.community_video_extra_links (video_id);

alter table public.community_video_extra_links replica identity full;
alter table public.community_video_extra_links enable row level security;

-- Public can read all extra links (mirrors the public-readable policy on
-- community_videos itself).
create policy "public reads community video extra links"
  on public.community_video_extra_links
  for select using (true);

-- Authenticated agents manage links (write-side authorization further
-- enforced by server actions checking that the agent owns the underlying
-- video). RLS-only check keeps this DB-level guardrail at "must be logged
-- in", same shape as the community_videos write policy.
create policy "agents manage community video extra links"
  on public.community_video_extra_links
  for all using (auth.role() = 'authenticated');

-- Membership view: unifies primary + extras. UNION (not UNION ALL) so that
-- a video accidentally linked back to its own primary community does not
-- duplicate. Read-side queries use this view; writes still target the
-- underlying tables directly.
create or replace view public.community_video_membership as
  select community_id, id as video_id, 'primary'::text as link_kind
    from public.community_videos
  union
  select community_id, video_id,        'extra'::text   as link_kind
    from public.community_video_extra_links;

comment on table  public.community_video_extra_links is
  'secondary community memberships for a community_video. The video''s primary community lives on community_videos.community_id; rows here add extra memberships. Reads: query community_video_membership view.';
comment on view   public.community_video_membership is
  'unified read of which (community_id, video_id) pairs are visible. Combines community_videos.community_id (link_kind=primary) with community_video_extra_links (link_kind=extra).';
