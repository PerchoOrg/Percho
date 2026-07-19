-- sweep active communities that don't meet the new
-- activate gate back to 'inactive'.
--
-- The gate (enforced going forward in `setCommunityStatus`):
--   * name is set and not the 'Untitled community' stub
--   * city is set (trimmed non-empty)
--   * state is set (trimmed non-empty)
--   * >= 1 community_photo OR >= 1 ready+public community_video
--
-- Anything currently `status='active'` that fails the gate gets flipped to
-- 'inactive' in a single UPDATE. Owner opted for this over grandfathering
-- so the buyer-facing communities grid + the listing → community dropdown
-- both stop leaking Untitled / empty stubs immediately.
--
-- Idempotent: rerunning is a no-op because the sub-selects re-count each
-- run. Safe to include in prod deploy pipeline.

update public.communities c
set status = 'inactive'
where c.status = 'active'
  and (
    c.name is null
    or btrim(c.name) = ''
    or btrim(c.name) = 'Untitled community'
    or c.city is null
    or btrim(c.city) = ''
    or c.state is null
    or btrim(c.state) = ''
    or (
      not exists (
        select 1 from public.community_photos cp
        where cp.community_id = c.id
      )
      and not exists (
        select 1 from public.community_videos cv
        where cv.community_id = c.id
          and cv.status = 'ready'
          and cv.visibility = 'public'
      )
    )
  );
