-- MLS mirror tables for FMLS via Bridge Interactive RESO Web API.
--
-- Design notes:
--   * source_system + listing_key is the natural key from the vendor
--     side. We keep a synthetic uuid PK for FK ergonomics.
--   * Only ~30 RESO fields we actually use — see docs/mls-integration/
--     data-model.md. Adding fields later is a non-breaking migration.
--   * RLS: server-role only. Publicly reading raw MLS data would breach
--     IDX terms. Anything user-facing is proxied through app code that
--     applies the compliance filters (see compliance-checklist.md).
--   * mls_listings.our_listing_id links a mirrored MLS record to its
--     Percho `listings` row when the listing agent is on Percho;
--     nullable because most FMLS records won't have a match.

create extension if not exists pgcrypto;

create table if not exists public.mls_listings (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  listing_key text not null,
  list_price numeric,
  standard_status text,
  property_type text,
  property_sub_type text,
  street_number text,
  street_name text,
  street_suffix text,
  city text,
  state_or_province text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  bedrooms_total integer,
  bathrooms_total_integer integer,
  living_area numeric,
  lot_size_acres numeric,
  year_built integer,
  public_remarks text,
  list_office_name text,
  list_agent_full_name text,
  list_agent_mls_id text,
  days_on_market integer,
  modification_timestamp timestamptz,
  internet_entire_listing_display_yn boolean,
  our_listing_id uuid references public.listings(id) on delete set null,
  mirrored_at timestamptz not null default now(),
  constraint mls_listings_source_key_uniq unique (source_system, listing_key)
);

create index if not exists mls_listings_mod_ts_idx
  on public.mls_listings (modification_timestamp desc);
create index if not exists mls_listings_city_idx
  on public.mls_listings (city);
create index if not exists mls_listings_status_idx
  on public.mls_listings (standard_status);
-- Simple lat/lng btree pair. Real geohash / PostGIS can come later if
-- we need radius search; MVP address-autofill doesn't.
create index if not exists mls_listings_latlng_idx
  on public.mls_listings (latitude, longitude);

create table if not exists public.mls_media (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  media_key text not null,
  listing_key text not null,
  media_url text not null,
  display_order integer,
  media_category text,
  short_description text,
  modification_timestamp timestamptz,
  mirrored_at timestamptz not null default now(),
  constraint mls_media_source_key_uniq unique (source_system, media_key)
);
create index if not exists mls_media_listing_idx
  on public.mls_media (source_system, listing_key);

create table if not exists public.mls_offices (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  office_key text not null,
  office_name text,
  office_phone text,
  office_mls_id text,
  modification_timestamp timestamptz,
  mirrored_at timestamptz not null default now(),
  constraint mls_offices_source_key_uniq unique (source_system, office_key)
);

create table if not exists public.mls_members (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  member_key text not null,
  member_full_name text,
  member_mls_id text,
  member_email text,
  member_office_key text,
  modification_timestamp timestamptz,
  mirrored_at timestamptz not null default now(),
  constraint mls_members_source_key_uniq unique (source_system, member_key)
);

create table if not exists public.mls_sync_state (
  source_system text primary key,
  last_modification_timestamp timestamptz,
  updated_at timestamptz not null default now()
);

-- RLS: enable and add zero policies. Only service-role bypasses RLS.
alter table public.mls_listings   enable row level security;
alter table public.mls_media      enable row level security;
alter table public.mls_offices    enable row level security;
alter table public.mls_members    enable row level security;
alter table public.mls_sync_state enable row level security;

-- Explicit deny-all comment (for reviewers): no policies means no
-- authenticated/anon reads or writes. Access is service-role only.
comment on table public.mls_listings   is 'FMLS mirror. Server-role only. See docs/mls-integration/.';
comment on table public.mls_media      is 'FMLS media mirror. Server-role only.';
comment on table public.mls_offices    is 'FMLS offices mirror. Server-role only.';
comment on table public.mls_members    is 'FMLS members mirror. Server-role only.';
comment on table public.mls_sync_state is 'Sync watermark per source_system. Server-role only.';
