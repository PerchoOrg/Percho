-- Approval gate for community bucket renders + grandfather existing ones.
--
-- 20260803060000 gated listing/community_videos on a new `approved_at` column.
-- `generated_videos` was going to reuse its own `status='approved'`, but
-- 20260714120000 REPLACED that CHECK with
-- ('pending','processing','ready','failed','superseded') — 'approved' is no
-- longer a legal value and the update failed with 23514. So this table gets the
-- same `approved_at` column as the other two: one gate shape everywhere, and the
-- render lifecycle (`status`) stays owned by the worker.
alter table public.generated_videos
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id);

comment on column public.generated_videos.approved_at is
  'Non-null = admin approved this render for the buyer-facing feed. The mobile feed serves only approved rows. Backfilled for pre-2026-08-03 ready rows.';

-- Grandfather: without this, turning the gate on drops every community video
-- already live on the owner's phone — the regression the listing backfill in
-- 20260803060000 was written to avoid.
update public.generated_videos
   set approved_at = coalesce(approved_at, now())
 where status = 'ready'
   and cf_stream_uid is not null;
