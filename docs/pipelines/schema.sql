-- Percho pipeline schema v1 (D1)
--
-- Scope: 5 core tables backing the reel-compose pipeline
--   neighborhoods → content_items → tags
--                                 ↘
--                                  compositions → publishes
--
-- Design axioms:
--   - Postgres 15 (Supabase). All tables in `public`. RLS ENABLED on every table;
--     policies live in a follow-up migration (this file is schema only).
--   - GA-only, selling-only (memory alignment). `state` is CHECK-constrained to 'GA'
--     for now; loosen when we expand beyond Georgia.
--   - Every table has: uuid pk, created_at, updated_at (trigger elsewhere), soft
--     status enum. No hard deletes on content_items — mark `archived`.
--   - Foreign keys use ON DELETE CASCADE only for child rows that are meaningless
--     without the parent (tags → content_items, compositions → neighborhoods).
--     publishes → compositions uses RESTRICT (we do not want to lose publish
--     receipts if a composition row is nuked).
--   - JSONB for anything provider-shaped (wikimedia manifest row, ffmpeg plan,
--     platform response). Structured columns for anything we index or filter on.
--   - No ORM. Column names are snake_case; queries are hand-written supabase-js.
--
-- Not covered here (deferred):
--   - listings / mls_photos (Phase E)
--   - agents / accounts / billing (owned by app/, not pipeline)
--   - job queue rows (see orchestration.md — likely lives in a separate table
--     or an external queue like PGMQ / SQS)

-- =====================================================================
-- extensions
-- =====================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";    -- fuzzy match on titles / captions

-- =====================================================================
-- enums
-- =====================================================================

do $$ begin
  create type content_source as enum (
    'wikimedia',       -- CC / PD stills from Wikimedia Commons
    'unsplash',        -- CC0 photography (mock listings only for now)
    'mls_photo',       -- agent-uploaded MLS photo (Phase E)
    'agent_upload',    -- agent-uploaded broll (photo or video)
    'stock_video'      -- reserved; not used in v1
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type content_kind as enum ('image', 'video');
exception when duplicate_object then null; end $$;

do $$ begin
  create type content_status as enum ('pending', 'ready', 'archived', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type composition_status as enum (
    'draft',       -- plan generated, not yet rendered
    'rendering',   -- ffmpeg job in flight
    'rendered',    -- mp4 exists, not yet approved
    'approved',    -- agent QA'd, ok to publish
    'failed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type publish_platform as enum (
    'instagram_reels',
    'tiktok',
    'youtube_shorts',
    'facebook_reels',
    'rednote',       -- 小红书 — allowed per positioning: multilingual buyers
    'wechat_moments',
    'direct_link'    -- percho.com/<slug> hosted page
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type publish_status as enum ('queued', 'posted', 'failed', 'retracted');
exception when duplicate_object then null; end $$;

-- =====================================================================
-- neighborhoods
-- =====================================================================
-- One row per marketable neighborhood. Matches docs/pipelines/neighborhoods/<slug>.yaml
-- 1:1 for now; the YAML is source-of-truth until we build an admin UI.

create table if not exists public.neighborhoods (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,                    -- 'peachtree-corners'
  display_name  text not null,                           -- 'Peachtree Corners'
  state         text not null default 'GA' check (state = 'GA'),  -- GA-only per memory
  county        text,                                    -- 'Gwinnett'
  metro         text default 'Atlanta',
  centroid_lat  numeric(9,6),                            -- for map / distance ranking
  centroid_lng  numeric(9,6),
  config_yaml   jsonb,                                   -- parsed YAML snapshot for audit
  status        text not null default 'active' check (status in ('active','paused','archived')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists neighborhoods_status_idx
  on public.neighborhoods (status)
  where status = 'active';

create index if not exists neighborhoods_display_name_trgm_idx
  on public.neighborhoods using gin (display_name gin_trgm_ops);

comment on table public.neighborhoods is
  'Marketable GA neighborhoods. One row per <slug>.yaml under docs/pipelines/neighborhoods/.';

-- =====================================================================
-- content_items
-- =====================================================================
-- Every raw asset — images + video clips — pulled or uploaded into the system.
-- Storage: `storage_path` is a Supabase Storage key (bucket implied by source).
-- License fields are mandatory for wikimedia/unsplash; MLS photos inherit
-- rights from the listing agreement (tracked elsewhere).

create table if not exists public.content_items (
  id                uuid primary key default gen_random_uuid(),
  neighborhood_id   uuid not null references public.neighborhoods(id) on delete cascade,
  source            content_source not null,
  source_ref        text,                        -- upstream id (wikimedia file title, unsplash id, etc.)
  kind              content_kind not null,
  storage_path      text not null,               -- e.g. 'wikimedia/peachtree-corners/foo.jpg'
  width_px          int check (width_px is null or width_px > 0),
  height_px         int check (height_px is null or height_px > 0),
  duration_sec      numeric(6,2) check (duration_sec is null or duration_sec >= 0),  -- null for images
  license           text,                        -- 'CC-BY-SA-4.0', 'PD', 'CC0', 'mls-agent-owned'
  attribution       text,                        -- required credit line if license demands
  captured_at       date,                        -- when the photo/video was taken (best-effort)
  status            content_status not null default 'pending',
  raw_manifest      jsonb,                       -- untouched provider row (for reprocessing)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Video assets must have duration; images must not.
  constraint content_kind_shape check (
    (kind = 'video' and duration_sec is not null)
    or (kind = 'image' and duration_sec is null)
  ),

  -- Dedupe upstream fetches within a neighborhood.
  constraint content_source_unique unique (neighborhood_id, source, source_ref)
);

create index if not exists content_items_neighborhood_status_idx
  on public.content_items (neighborhood_id, status);

create index if not exists content_items_source_idx
  on public.content_items (source);

create index if not exists content_items_ready_by_nbhd_idx
  on public.content_items (neighborhood_id)
  where status = 'ready';

comment on table public.content_items is
  'Raw stills and clips. One row per asset. License columns are mandatory for CC-sourced items.';

-- =====================================================================
-- tags
-- =====================================================================
-- Many-to-one against content_items. Two-layer taxonomy matches tag_rules.py:
--   L1 = subject     (streetscape, listing-exterior, park, restaurant, ...)
--   L2 = vibe        (walkable, quiet-suburban, nightlife, family, ...)
-- Split into rows (not JSON) so we can index / filter / count per slot.

create table if not exists public.tags (
  id               uuid primary key default gen_random_uuid(),
  content_item_id  uuid not null references public.content_items(id) on delete cascade,
  layer            smallint not null check (layer in (1, 2)),
  value            text not null check (length(value) between 1 and 64),
  confidence       numeric(3,2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  source_rule      text,                          -- 'tag_rules.py:v1' or 'human:<uid>' or 'llm:sonnet-4-5'
  created_at       timestamptz not null default now(),

  constraint tag_unique_per_item unique (content_item_id, layer, value)
);

create index if not exists tags_value_layer_idx
  on public.tags (layer, value);

create index if not exists tags_content_item_idx
  on public.tags (content_item_id);

comment on table public.tags is
  'Two-layer tags per content_item. layer=1 subject, layer=2 vibe. Mirrors tag_rules.py.';

-- =====================================================================
-- compositions
-- =====================================================================
-- One row per reel plan → render attempt. Contains the ffmpeg plan snapshot
-- so a render is reproducible without re-running the composer.

create table if not exists public.compositions (
  id                 uuid primary key default gen_random_uuid(),
  neighborhood_id    uuid not null references public.neighborhoods(id) on delete cascade,
  slug               text not null,                       -- 'peachtree-corners-v1'
  version            int not null default 1 check (version > 0),
  duration_sec       numeric(6,2) not null check (duration_sec > 0 and duration_sec <= 90),
  aspect_ratio       text not null default '9:16' check (aspect_ratio in ('9:16','1:1','16:9')),
  plan               jsonb not null,                      -- slots, clip ids, captions, ffmpeg cmd
  clip_ids           uuid[] not null default '{}',        -- ordered content_item ids consumed
  output_path        text,                                -- Supabase Storage key of mp4 (nullable until rendered)
  poster_path        text,                                -- storage key of 1st-frame jpg
  cf_stream_uid      text,                                -- Cloudflare Stream uid once uploaded
  status             composition_status not null default 'draft',
  render_started_at  timestamptz,
  render_ended_at    timestamptz,
  render_error       text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint compositions_slug_version_unique unique (slug, version)
);

create index if not exists compositions_neighborhood_status_idx
  on public.compositions (neighborhood_id, status);

create index if not exists compositions_status_recent_idx
  on public.compositions (status, created_at desc);

create index if not exists compositions_clip_ids_gin_idx
  on public.compositions using gin (clip_ids);   -- reverse lookup: which reels used this clip?

comment on table public.compositions is
  'Reel render attempts. plan jsonb is the source-of-truth for reproducible ffmpeg runs.';

-- =====================================================================
-- publishes
-- =====================================================================
-- One row per (composition, platform) publish attempt. RESTRICT on parent
-- delete so we never lose a receipt.

create table if not exists public.publishes (
  id               uuid primary key default gen_random_uuid(),
  composition_id   uuid not null references public.compositions(id) on delete restrict,
  platform         publish_platform not null,
  status           publish_status not null default 'queued',
  external_id      text,                          -- platform-side post id
  external_url     text,                          -- canonical URL of the post
  posted_at        timestamptz,
  retracted_at     timestamptz,
  caption          text,                          -- final caption pushed to the platform
  hashtags         text[] not null default '{}',
  metrics          jsonb,                         -- {views, likes, comments, ...} last snapshot
  metrics_synced_at timestamptz,
  response         jsonb,                         -- raw platform API response for debugging
  error            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- One live publish per (composition, platform). A retracted row does not block a repost.
  constraint publishes_one_live_per_platform
    unique (composition_id, platform, status) deferrable initially deferred
);

create index if not exists publishes_composition_idx
  on public.publishes (composition_id);

create index if not exists publishes_platform_status_idx
  on public.publishes (platform, status);

create index if not exists publishes_posted_recent_idx
  on public.publishes (posted_at desc)
  where status = 'posted';

comment on table public.publishes is
  'Publish receipts. Parent delete is RESTRICTed — receipts outlive composition churn.';

-- =====================================================================
-- updated_at triggers
-- =====================================================================
-- Applied to every table with an updated_at column. Trigger fn lives in a
-- shared migration (assumed): public.set_updated_at(). Defined here inline
-- so this file is self-contained for design review.

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['neighborhoods','content_items','compositions','publishes'] loop
    execute format(
      'drop trigger if exists trg_%I_updated_at on public.%I;
       create trigger trg_%I_updated_at before update on public.%I
         for each row execute function public.set_updated_at();',
      t, t, t, t
    );
  end loop;
end $$;

-- =====================================================================
-- RLS bootstrap
-- =====================================================================
-- Enable RLS everywhere. Policies are in a follow-up migration; without
-- policies the anon key returns zero rows, which is the safe default.

alter table public.neighborhoods  enable row level security;
alter table public.content_items  enable row level security;
alter table public.tags           enable row level security;
alter table public.compositions   enable row level security;
alter table public.publishes      enable row level security;

-- =====================================================================
-- open questions (see orchestration.md D3)
-- =====================================================================
-- 1. Does `compositions.plan` need a hash column for cache-hit detection on
--    re-render? Likely yes when D3 lands the render worker contract.
-- 2. Do we split `agent_uploads` off content_items once MLS photos land in E1?
--    Current bet: no — same table, different `source` + license.
-- 3. `publishes.metrics` polling cadence lives in cron config, not schema.
