-- ─── 0016_saved_listings ────────────────────────────────────────────
-- --
-- Persists buyer "save" actions across page reloads / tabs. V1 uses an
-- anonymous device-id stored in browser localStorage (no buyer login
-- yet — that is +). When buyer auth lands, a follow-up phase
-- merges `device_id` rows into `user_id` rows for the same person.
--
-- Why a new table over abusing leads / contact tables: leads are
-- intent-to-contact, saves are intent-to-revisit. Different lifecycle,
-- different cardinality, different surfaces.
--
-- ────────────────────────────────────────────────────────────────────

create table public.saved_listings (
  device_id     text not null,
  listing_id    uuid not null references public.listings on delete cascade,

  -- Null for V1 (anonymous). When buyer auth ships, a successful login
  -- triggers a server action that updates the user's device_id rows to
  -- set user_id, enabling cross-device sync from that point forward.
  user_id       uuid references auth.users on delete cascade,

  created_at    timestamptz not null default now(),

  primary key (device_id, listing_id)
);

-- Future buyer-login merge query: `update saved_listings set user_id =
-- $1 where device_id = $2 and user_id is null`. This index keeps that
-- update cheap.
create index saved_listings_user_idx on public.saved_listings (user_id) where user_id is not null;

-- Listing-side index for "how many people saved this" stats and for
-- the cascade delete to scan efficiently.
create index saved_listings_listing_idx on public.saved_listings (listing_id);

alter table public.saved_listings enable row level security;

-- RLS posture: deny everything to anon and authenticated. All access
-- goes through server actions in app/_actions/saved-listings.ts using
-- the service-role client. The server action validates the device_id
-- shape (UUID) and rate-limits per device. This avoids leaking saves
-- across devices via a forgeable header, which is the hazard of
-- header-based device-id RLS policies.
--
-- (No grant to anon/authenticated → service-role only by default.)

-- Helpful view for future "popular listings" stats (anon-readable
-- aggregate count, not individual saves).
create view public.saved_listing_counts as
  select listing_id, count(*) as save_count
  from public.saved_listings
  group by listing_id;

grant select on public.saved_listing_counts to anon, authenticated;
