-- Phase 91 (2026-07-15) — nearby videos = community content, keyed by 14 intent buckets
--
-- Model change:
--   * Nearby videos now live on `community_videos` (per-community), not on
--     `generated_videos` (per-listing). A listing shows its community's videos.
--   * Classification drops the legacy 12-category taxonomy in favor of the
--     14 `intent_bucket` values (see lib/poi/types.ts INTENT_BUCKETS).
--   * Multiple videos per (community_id, intent_bucket) are allowed for
--     history, but exactly one is marked `is_primary = true` — the reader
--     picks that row.
--
-- Data disposition (per owner 07-15): all existing `community_videos` and
-- `generated_videos` rows are seed/test — wiped. No user data at risk.
--
-- What this migration does NOT do (deferred):
--   * Drop legacy `community_videos.category`, `kind`, `bucket`, `school_id`,
--     `poi_id` columns — kept until Phase 93 readers switch over, to avoid
--     breaking existing dashboards mid-deploy.
--   * Drop `generated_videos.scope='poi'` / per-POI code paths — Phase 92
--     worker change removes the writer; column stays for now.

-- ─── 1. wipe existing seed/test video rows ───────────────────────

delete from public.generated_videos;
delete from public.community_videos;

-- ─── 2. community_videos: add intent_bucket + is_primary ─────────

alter table public.community_videos
  add column if not exists intent_bucket text,
  add column if not exists is_primary boolean not null default false;

-- 14-bucket check (matches lib/poi/types.ts::INTENT_BUCKETS)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'community_videos_intent_bucket_chk') then
    alter table public.community_videos
      add constraint community_videos_intent_bucket_chk
      check (intent_bucket is null or intent_bucket in (
        'schools','dining','nightlife','shopping','outdoor','fitness','kids',
        'asian_community','daily_errands','faith','work_hubs','healthcare',
        'pets','transit'
      )) not valid;
    alter table public.community_videos validate constraint community_videos_intent_bucket_chk;
  end if;
end $$;

-- Legacy `category` and `kind` are still `not null` from earlier migrations.
-- New rows from the render worker won't populate them; relax to allow nulls.
alter table public.community_videos alter column category drop not null;
alter table public.community_videos alter column kind drop not null;

-- ─── 3. one primary per (community_id, intent_bucket) ────────────
--
-- Partial unique index (not a UNIQUE constraint) — we never POST-upsert this
-- table via PostgREST on_conflict, so §3 of supabase-migration-workflow
-- doesn't apply. Writer flips is_primary=false on siblings, sets =true on the
-- new row, inside a transaction.

create unique index if not exists community_videos_primary_uidx
  on public.community_videos (community_id, intent_bucket)
  where is_primary = true;

-- Read index for the listing/community pages: given a community, fetch all
-- 14 primary videos in one query.
create index if not exists community_videos_intent_bucket_idx
  on public.community_videos (community_id, intent_bucket)
  where intent_bucket is not null;

-- ─── 4. generated_videos: add community_id + relax listing_id ────
--
-- The render worker's job row still needs SOMETHING to key ownership by.
-- Phase 91 splits `generated_videos.listing_id` into two possible owners:
--   * community_id set + listing_id null → bucket video (new)
--   * listing_id set + community_id null → per-listing hero (unchanged path,
--     though the worker doesn't currently write these here)
-- Exactly one must be set.

alter table public.generated_videos
  add column if not exists community_id uuid references public.communities on delete cascade;

alter table public.generated_videos
  alter column listing_id drop not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'generated_videos_owner_chk') then
    alter table public.generated_videos
      add constraint generated_videos_owner_chk
      check (
        (listing_id is not null and community_id is null)
        or (listing_id is null and community_id is not null)
      ) not valid;
    alter table public.generated_videos validate constraint generated_videos_owner_chk;
  end if;
end $$;

create index if not exists generated_videos_community_idx
  on public.generated_videos (community_id, status)
  where community_id is not null;

-- ─── 5. RLS for community-scoped generated_videos ────────────────
--
-- Existing policies filter by listing_id → listings → agents. Add a parallel
-- pair for community_id → communities → agents (via the same ownership
-- chain the community_videos policies already use: any authenticated agent).

create policy "agent reads community generated_videos" on public.generated_videos
  for select using (
    community_id is not null and auth.role() = 'authenticated'
  );

create policy "agent updates community generated_videos" on public.generated_videos
  for update using (
    community_id is not null and auth.role() = 'authenticated'
  );

create policy "agent inserts community generated_videos" on public.generated_videos
  for insert with check (
    community_id is not null and auth.role() = 'authenticated'
  );
