-- leads.followed_up_at
--
-- Vivian's lead inbox needs a way to mark "I contacted this person already"
-- so she can see at a glance who's still owed a follow-up. We avoid a full
-- pipeline-stages model (V2 territory) and ship a single nullable timestamp:
--
--   NULL          → not yet followed up (default for new leads)
--   timestamptz   → moment the agent recorded a follow-up
--
-- The UI sets this when she clicks Email / Text / "Mark as followed up" on a
-- row, and lets her clear it from the detail page if she clicked by mistake.
--
-- RLS: existing per-listing policies on public.leads cover this column —
-- SELECT/UPDATE are already gated by `listing_id ∈ caller's listings`. No
-- new policy needed.
--
-- Index: partial index on rows still pending follow-up. Query pattern in
-- the dashboard filter "Unread" chip is `where followed_up_at is null`,
-- and the unfollowed-up set is the hot subset.

alter table public.leads
  add column if not exists followed_up_at timestamptz;

create index if not exists leads_followed_up_at_pending_idx
  on public.leads (created_at desc)
  where followed_up_at is null;
