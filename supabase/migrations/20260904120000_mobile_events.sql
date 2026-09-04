-- ─── mobile_events ──────────────────────────────────────────────────
--
-- Phase C of the store launch: the sink for the mobile app's telemetry
-- queue (`apps/mobile/state/event-queue.ts`), which until now drained
-- into a no-op transport — every swipe/explore event was written to
-- AsyncStorage and thrown away.
--
-- One table for both event streams (§1.10 scope events + §2.6 explore
-- events), mirroring the client's one-queue decision: the discriminating
-- `type` lives in the row, the full event lives in `payload`, and the
-- few columns worth indexing are lifted out.
--
-- Idempotency: the client's `seq` is monotonic PER INSTALL, and the
-- transport contract says a batch may be re-sent whenever the ack was
-- lost — so (install_id, seq) is unique and the API inserts with
-- "ignore duplicates". `listing_id` is a bare uuid on purpose: events
-- are an analytics record and must survive the listing's deletion
-- (phase166 deleted 249 of them; an FK would have taken the history).
--
-- RLS: enabled, NO policies — nothing reads or writes this table except
-- the service role behind POST /api/mobile/events, which validates and
-- rate-limits first. The baseline `events` table is anon-writable and
-- that is exactly what this one avoids.
-- ─────────────────────────────────────────────────────────────────────

create table public.mobile_events (
  id           bigint generated always as identity primary key,
  install_id   uuid not null,
  user_id      uuid,                         -- signed-in sender, when known
  type         text not null,
  seq          bigint not null,
  at           timestamptz not null,         -- client clock, from the event
  listing_id   uuid,                         -- explore-stream events only
  payload      jsonb not null,
  received_at  timestamptz not null default now()
);

create unique index mobile_events_install_seq_key
  on public.mobile_events (install_id, seq);
create index mobile_events_type_idx
  on public.mobile_events (type, received_at desc);
create index mobile_events_listing_idx
  on public.mobile_events (listing_id, received_at desc)
  where listing_id is not null;

alter table public.mobile_events enable row level security;
