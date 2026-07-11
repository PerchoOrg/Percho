-- 0017_community_video_categories.sql — Phase 22 (2026-06-14)
--
-- Replace the 3-value `kind` enum (school | poi | neighborhood) with a richer
-- 12-category taxonomy split into two buckets:
--
--   Bucket A — "Only on Percho" (scarce content, no other platform has it)
--     walk_the_block, listen_here, morning_rush, after_dark, hidden_spot, local_pick
--
--   Bucket B — "Real look at the data" (data exists elsewhere, we add the
--   visceral video layer agents have always recorded but had nowhere to put)
--     school_run, daily_errands, the_park, eating_out, get_active, transit_reality
--
-- Strategy: ADD COLUMN, do not drop. Old `kind` stays — old code keeps working
-- until Phase 22 is fully shipped, then we'll drop it in a later migration.
--
-- Existing rows get a conservative best-effort mapping into the new system,
-- and `category_needs_review = true` so we (or the agent who uploaded it) can
-- re-classify in the UI later. Nothing is silently lost.
--
-- Buckets are computed once in a generated column so app code never has to
-- remember which category lives in which bucket.

-- ─── 1. add columns ──────────────────────────────────────────────

alter table public.community_videos
  add column if not exists category text,
  add column if not exists category_needs_review boolean not null default false;

-- ─── 2. seed `category` from existing `kind` ─────────────────────
--
-- Conservative mapping — anything ambiguous gets flagged for review.
--   school       → school_run        (tight match, no review flag)
--   neighborhood → walk_the_block    (tight match, no review flag)
--   poi          → eating_out        (loose; could be park/errands/etc → flag)
-- Anything else (unexpected legacy value) → walk_the_block + flag.

update public.community_videos
   set category = case kind
                    when 'school'       then 'school_run'
                    when 'neighborhood' then 'walk_the_block'
                    when 'poi'          then 'eating_out'
                    else                     'walk_the_block'
                  end,
       category_needs_review = case kind
                                 when 'poi' then true
                                 when 'school' then false
                                 when 'neighborhood' then false
                                 else true
                               end
 where category is null;

-- Now lock down: every row has a category.
alter table public.community_videos
  alter column category set not null;

-- ─── 3. constrain to the 12 known values ─────────────────────────

alter table public.community_videos
  add constraint community_videos_category_check
  check (category in (
    -- Bucket A — Only on Percho
    'walk_the_block',
    'listen_here',
    'morning_rush',
    'after_dark',
    'hidden_spot',
    'local_pick',
    -- Bucket B — Real look at the data
    'school_run',
    'daily_errands',
    'the_park',
    'eating_out',
    'get_active',
    'transit_reality'
  ));

-- ─── 4. derived bucket column ────────────────────────────────────
--
-- Generated column — DB does the bookkeeping. App only reads it.

alter table public.community_videos
  add column if not exists bucket text generated always as (
    case
      when category in (
        'walk_the_block', 'listen_here', 'morning_rush',
        'after_dark', 'hidden_spot', 'local_pick'
      ) then 'a'
      else 'b'
    end
  ) stored;

-- ─── 5. indexes for the community page (6+6 grid query) ──────────

create index if not exists community_videos_community_category_idx
  on public.community_videos (community_id, category);

create index if not exists community_videos_needs_review_idx
  on public.community_videos (community_id)
  where category_needs_review = true;

-- ─── 6. notes for future migrations ──────────────────────────────
--
-- TODO once Phase 22 UI ships and prod data is reclassified:
--   - drop column `kind`
--   - drop the old kind check constraint
--   - tighten events.card_type if we want category-level cards
--
-- Intentionally NOT done here so we can roll forward incrementally.
