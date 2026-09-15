-- Make swipe telemetry queryable — the measurement floor under the
-- recommendation work (phase303).
--
-- Swipe events land with `listing_id` NULL (that column is the explore
-- stream's) and everything that matters buried in `payload` jsonb:
-- `cardId`, `cardType`, `verdict` ("L"/"R"). Nothing in the product could
-- ask "what is the right-swipe rate?" without a full-table jsonb scan.
--
-- GENERATED columns rather than backfill + trigger: Postgres computes them
-- for existing rows during ADD COLUMN (a table rewrite — the table is days
-- old and service-role-only, so the lock is cheap) and keeps them in step
-- with `payload` forever. The ingest route (`/api/mobile/events`) needs no
-- change and cannot forget to set them.
--
-- RLS: already enabled with zero policies on this table (service-role only,
-- by design — see 20260904120000). Adding columns changes nothing there.

alter table public.mobile_events
  add column if not exists card_id text
    generated always as (payload->>'cardId') stored,
  add column if not exists card_type text
    generated always as (payload->>'cardType') stored,
  add column if not exists verdict text
    generated always as (payload->>'verdict') stored;

-- Swipes by card, newest first — per-listing verdict tallies.
create index if not exists mobile_events_swipe_card_idx
  on public.mobile_events (card_id, received_at desc)
  where type = 'swipe' and card_id is not null;

-- Swipes by install, newest first — one buyer's like history, the co-like
-- read behind /api/mobile/similar.
create index if not exists mobile_events_swipe_install_idx
  on public.mobile_events (install_id, received_at desc)
  where type = 'swipe';
