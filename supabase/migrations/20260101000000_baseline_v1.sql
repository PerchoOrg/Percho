-- Baseline v1: squashed from legacy migrations 0001_init.sql .. 0042_leads_agent_update_policy.sql
-- Squashed 2026-07-19. Original 42 files preserved in git history.
-- Remote schema_migrations repaired: 0001-0042 marked reverted, 20260101000000 marked applied.
-- This baseline is applied on fresh 'supabase db reset'; it is a NO-OP on the linked remote.


-- ============================================================
-- 0001_init.sql
-- ============================================================
-- ─────────────────────────────────────────────────────────────────
-- 0001_init.sql — Percho V1 schema
--
-- Tables (in dependency order):
--   agents, communities, listings,
--   listing_videos, community_videos, photos,
--   schools, pois, leads, events
--
-- Conventions:
--   * Every table has RLS enabled. Public-readable rows are scoped to
--     status='published' or to authenticated owner.
--   * Every table has created_at; mutable tables also have updated_at,
--     maintained via the touch_updated_at() trigger.
--   * Foreign keys cascade on delete unless data must be preserved
--     for audit (events, leads).
--   * Slugs are unique within their parent scope (agent for listings,
--     global for communities).
--
-- Positioning guard: NO `_zh` columns. NO `wechat` columns. English only.
-- ─────────────────────────────────────────────────────────────────

-- ─── Helpers ─────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ─── agents ──────────────────────────────────────────────────────
create table public.agents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users on delete cascade,
  slug        text not null unique,
  name        text not null,
  email       text not null,
  phone       text,
  headshot_url text,
  brokerage   text default 'Keller Williams',
  license_no  text,
  bio         text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger agents_touch before update on public.agents
  for each row execute function public.touch_updated_at();

alter table public.agents enable row level security;

-- Agent can read & update own row.
create policy "agent reads own profile" on public.agents
  for select using (user_id = auth.uid());
create policy "agent updates own profile" on public.agents
  for update using (user_id = auth.uid());
-- Public can read agent profile (used on public listing pages).
create policy "public reads agent profile" on public.agents
  for select using (true);

-- ─── communities ─────────────────────────────────────────────────
create table public.communities (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  city       text,
  state      text not null default 'GA',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger communities_touch before update on public.communities
  for each row execute function public.touch_updated_at();

alter table public.communities enable row level security;
create policy "public reads communities" on public.communities
  for select using (true);
-- Authenticated agents can create/update communities (V1: shared, no ownership).
create policy "agents manage communities" on public.communities
  for all using (auth.role() = 'authenticated');

-- ─── listings ────────────────────────────────────────────────────
create table public.listings (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references public.agents on delete cascade,
  community_id  uuid references public.communities on delete set null,
  slug          text not null,

  address       text not null,
  city          text not null,
  state         text not null default 'GA',
  zip           text,
  neighborhood  text,
  -- Geocode (filled by geocoder when address is set; nullable until then)
  lat           numeric(9, 6),
  lng           numeric(9, 6),

  price         integer,
  beds          numeric,
  baths         numeric,
  sqft          integer,
  year_built    integer,
  lot_size      text,
  hoa           text,

  -- Description: array of paragraphs (English only).
  style         text,
  description   text[] not null default '{}',

  status        text not null default 'draft'
                  check (status in ('draft', 'published', 'archived')),
  cover_url     text,

  views         integer not null default 0,
  shares        integer not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  published_at  timestamptz,

  unique (agent_id, slug)
);
create trigger listings_touch before update on public.listings
  for each row execute function public.touch_updated_at();
create index listings_agent_idx on public.listings (agent_id);
create index listings_community_idx on public.listings (community_id);
create index listings_status_idx on public.listings (status) where status = 'published';

alter table public.listings enable row level security;
-- Agent CRUD on own listings.
create policy "agent manages own listings" on public.listings
  for all using (
    agent_id in (select id from public.agents where user_id = auth.uid())
  );
-- Public can read published listings.
create policy "public reads published listings" on public.listings
  for select using (status = 'published');

-- ─── listing_videos ──────────────────────────────────────────────
-- Videos of the home itself: exterior, interior, walkthrough.
create table public.listing_videos (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references public.listings on delete cascade,
  cf_video_id   text not null unique,
  kind          text not null
                  check (kind in ('exterior', 'interior', 'walkthrough', 'other')),
  title         text,
  duration_sec  integer,
  status        text not null default 'processing'
                  check (status in ('processing', 'ready', 'error')),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);
create index listing_videos_listing_idx on public.listing_videos (listing_id, sort_order);

alter table public.listing_videos enable row level security;
create policy "agent manages own listing videos" on public.listing_videos
  for all using (
    listing_id in (
      select l.id from public.listings l
        join public.agents a on a.id = l.agent_id
      where a.user_id = auth.uid()
    )
  );
create policy "public reads published listing videos" on public.listing_videos
  for select using (
    listing_id in (select id from public.listings where status = 'published')
  );

-- ─── community_videos ────────────────────────────────────────────
-- Cross-listing reusable videos: school exterior, POI storefront, neighborhood
-- aerial. Owned at the community level so multiple listings in Buckhead share
-- the same school/POI footage.
create table public.community_videos (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references public.communities on delete cascade,
  cf_video_id   text not null unique,
  -- Type of community footage; ties the video to a specific overlay card.
  kind          text not null
                  check (kind in ('school', 'poi', 'neighborhood')),
  -- If the video corresponds to a specific school or POI row, link it.
  -- (nullable: a 'neighborhood' aerial doesn't link to either)
  -- FKs added at end of file (schools/pois are created below).
  school_id     uuid,
  poi_id        uuid,
  title         text,
  duration_sec  integer,
  status        text not null default 'processing'
                  check (status in ('processing', 'ready', 'error')),
  uploaded_by   uuid references public.agents on delete set null,
  created_at    timestamptz not null default now()
);
-- Forward-declared FKs to schools/pois — those tables come below.
-- We add them after creating those tables (see end of file).

alter table public.community_videos enable row level security;
create policy "agents manage community videos" on public.community_videos
  for all using (auth.role() = 'authenticated');
create policy "public reads community videos" on public.community_videos
  for select using (true);

-- ─── schools ─────────────────────────────────────────────────────
-- Manual entry V1. source_url + recorded_by + recorded_at are mandatory
-- for fair-housing audit trail.
create table public.schools (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references public.communities on delete cascade,
  name          text not null,
  grades        text,
  rating        numeric check (rating is null or (rating >= 0 and rating <= 10)),
  source_url    text not null,
  recorded_by   uuid not null references public.agents,
  recorded_at   timestamptz not null default now()
);
create index schools_community_idx on public.schools (community_id);

alter table public.schools enable row level security;
create policy "public reads schools" on public.schools for select using (true);
create policy "agents manage schools" on public.schools
  for all using (auth.role() = 'authenticated');

-- ─── pois ────────────────────────────────────────────────────────
create table public.pois (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references public.communities on delete cascade,
  name          text not null,
  poi_type      text not null,         -- e.g. 'restaurant', 'park', 'grocery', 'gym'
  distance_text text,                   -- e.g. '0.8 mi'
  source_url    text not null,
  recorded_by   uuid not null references public.agents,
  recorded_at   timestamptz not null default now()
);
create index pois_community_idx on public.pois (community_id);

alter table public.pois enable row level security;
create policy "public reads pois" on public.pois for select using (true);
create policy "agents manage pois" on public.pois
  for all using (auth.role() = 'authenticated');

-- ─── community_videos forward FKs ────────────────────────────────
-- Now that schools/pois exist, wire up the optional links.
alter table public.community_videos
  add constraint community_videos_school_fk
    foreign key (school_id) references public.schools (id) on delete set null;
alter table public.community_videos
  add constraint community_videos_poi_fk
    foreign key (poi_id) references public.pois (id) on delete set null;

-- ─── photos ──────────────────────────────────────────────────────
-- V1 feed is video-first. Photos are kept for OG cover images and any
-- future use; not rendered as primary feed cards in V1.
create table public.photos (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings on delete cascade,
  storage_url text not null,
  caption     text,
  category    text check (category in ('exterior', 'interior', 'cover', 'other')),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index photos_listing_idx on public.photos (listing_id, sort_order);

alter table public.photos enable row level security;
create policy "agent manages own photos" on public.photos
  for all using (
    listing_id in (
      select l.id from public.listings l
        join public.agents a on a.id = l.agent_id
      where a.user_id = auth.uid()
    )
  );
create policy "public reads published photos" on public.photos
  for select using (
    listing_id in (select id from public.listings where status = 'published')
  );

-- ─── leads ───────────────────────────────────────────────────────
-- Buyer inquiry. 100% routes to the listing agent — platform does not
-- re-route or fan out leads.
-- NOTE: email + phone are the only contact channels. NO wechat field.
create table public.leads (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings,
  agent_id    uuid not null references public.agents,
  name        text not null,
  email       text,
  phone       text,
  message     text,
  source      text,                                -- referrer / utm
  notified_at timestamptz,                          -- when Resend email sent
  created_at  timestamptz not null default now(),
  -- Either email or phone must be present (no anonymous leads).
  check (email is not null or phone is not null)
);
create index leads_agent_idx on public.leads (agent_id, created_at desc);

alter table public.leads enable row level security;
create policy "agent reads own leads" on public.leads
  for select using (
    agent_id in (select id from public.agents where user_id = auth.uid())
  );
-- Public POST creates leads. We don't expose select/update/delete to anon.
create policy "public creates leads" on public.leads
  for insert with check (true);

-- ─── events ──────────────────────────────────────────────────────
-- Behavioral analytics. High-volume insert path. Anon-writable.
create table public.events (
  id          bigserial primary key,
  listing_id  uuid references public.listings on delete cascade,
  event_type  text not null,         -- page_view | card_view | lead_submit | share | video_complete
  card_type   text,                   -- home | school | poi | neighborhood
  card_id     text,
  source      text,                   -- referrer / utm
  geo_country text,
  geo_state   text,
  session_id  text,
  meta        jsonb,
  created_at  timestamptz not null default now()
);
create index events_listing_idx on public.events (listing_id, created_at desc);
create index events_type_idx on public.events (event_type, created_at desc);

alter table public.events enable row level security;
create policy "anyone writes events" on public.events
  for insert with check (true);
create policy "agent reads own listing events" on public.events
  for select using (
    listing_id in (
      select l.id from public.listings l
        join public.agents a on a.id = l.agent_id
      where a.user_id = auth.uid()
    )
  );

-- ============================================================
-- 0002_agent_signup_trigger.sql
-- ============================================================
-- ─────────────────────────────────────────────────────────────────
-- 0002_agent_signup_trigger.sql
--
-- When a new user signs up via Supabase Auth, automatically create a
-- corresponding agents row. The slug defaults to the email local-part
-- (lowercased, sanitized); the agent can change it later via the
-- dashboard profile editor.
--
-- This avoids a chicken-and-egg in the dashboard always
-- expects an agents row to exist for auth.uid().
-- ─────────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_slug text;
  candidate text;
  n         int := 0;
begin
  -- Derive a slug from the email local-part: foo.bar+tag@gmail.com -> 'foo-bar'
  base_slug := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  if base_slug = '' or base_slug is null then
    base_slug := 'agent';
  end if;

  candidate := base_slug;
  -- Resolve slug collisions by appending -2, -3, ...
  while exists (select 1 from public.agents where slug = candidate) loop
    n := n + 1;
    candidate := base_slug || '-' || (n + 1);
  end loop;

  insert into public.agents (user_id, slug, name, email)
  values (
    new.id,
    candidate,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 0003_realtime_videos.sql
-- ============================================================
-- enable Realtime broadcasts on video tables.
--
-- Cloudflare Stream webhook flips listing_videos.status processing → ready.
-- Subscribers (currently /dashboard/upload-test, later the agent dashboard
-- and the feed builder) listen on the supabase_realtime publication
-- to render that transition without a page refresh.
--
-- RLS still applies to Realtime — clients only see UPDATE events for rows
-- their RLS policies permit them to SELECT.

alter publication supabase_realtime add table public.listing_videos;
alter publication supabase_realtime add table public.community_videos;

-- ============================================================
-- 0004_replica_identity_full.sql
-- ============================================================
-- 0004: Set REPLICA IDENTITY FULL on video tables for Realtime RLS.
--
-- Why: Realtime evaluates RLS on every event. Our listing_videos / community_videos
-- policies join through listings → agents → user_id, requiring listing_id to be
-- present in BOTH old and new row images. Postgres default (REPLICA IDENTITY DEFAULT)
-- only writes the PK + changed columns to WAL, so listing_id is NULL in the OLD row
-- of UPDATE events → join fails → Realtime silently drops the event.
--
-- FULL writes the entire row to WAL on every change. Tradeoff: slightly larger WAL
-- volume. Acceptable at V1 video volume (handful of rows/agent).

alter table public.listing_videos replica identity full;
alter table public.community_videos replica identity full;

-- ============================================================
-- 0005_drop_upload_test_listings.sql
-- ============================================================
-- cleanup — drop the upload-test seed listings.
--
-- created one listing per agent with slug='__upload_test__' so the
-- agent could exercise the video uploader on a real row before the listing
-- CRUD UI existed. makes that obsolete: agents now create real
-- listings via /dashboard/listings/new.
--
-- This deletes:
--   - all listings with slug='__upload_test__'
--   - their listing_videos (cascades via fk on listing_videos.listing_id)
--
-- Cloudflare Stream assets uploaded against these listings become orphans;
-- a reconcile job (out of V1 scope) will sweep them later. No code path
-- ever served these videos publicly, so no public URL breaks.

delete from public.listings where slug = '__upload_test__';

-- ============================================================
-- 0006_notify_lead_trigger.sql
-- ============================================================
-- notify-lead trigger.
--
-- Goal: when a row lands in `public.leads`, fire off an HTTP POST to the
-- `notify-lead` Supabase Edge Function (which calls Resend). The function
-- itself owns the idempotency check (`notified_at IS NULL`) so this trigger
-- can be unconditional on AFTER INSERT.
--
-- pg_net is Supabase's built-in async HTTP-from-Postgres extension. It
-- queues requests on a worker — the INSERT does not block on the HTTP call.
-- That's important: we don't want the public POST /api/leads response time
-- coupled to Resend's latency or the Edge Function cold start.
--
-- Required Postgres settings (set once via Supabase dashboard or the SQL
-- below — kept here for reproducibility):
--   app.settings.supabase_url      = 'https://<project-ref>.supabase.co'
--   app.settings.service_role_key  = '<service role JWT>'
--
-- The trigger reads these via `current_setting(..., true)` so a missing
-- setting yields NULL instead of erroring out the INSERT — better to log
-- the lead and lose the email than to lose the lead.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_lead_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  edge_url   text;
  service_key text;
begin
  edge_url    := current_setting('app.settings.supabase_url',     true);
  service_key := current_setting('app.settings.service_role_key', true);

  if edge_url is null or service_key is null then
    raise warning 'notify_lead: app.settings.supabase_url / service_role_key not configured; skipping HTTP call for lead %', new.id;
    return new;
  end if;

  perform extensions.http_post(
    url     := edge_url || '/functions/v1/notify-lead',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'Authorization',  'Bearer ' || service_key
    ),
    body    := jsonb_build_object('lead_id', new.id)
  );

  return new;
end;
$$;

drop trigger if exists notify_lead_after_insert on public.leads;
create trigger notify_lead_after_insert
  after insert on public.leads
  for each row execute function public.notify_lead_on_insert();

-- ============================================================
-- 0007_notify_lead_use_vault.sql
-- ============================================================
-- fixup — switch notify_lead trigger from `app.settings.*` to Supabase Vault.
--
-- Why: Supabase hosted Postgres does not grant the `postgres` role permission
-- to `alter database postgres set app.settings.* = ...` (error 42501). 0006
-- assumed self-hosted-style superuser settings. The hosted-supported path is
-- `vault.decrypted_secrets` for the service_role_key. The project URL is not
-- a secret (it's in every browser request to the Edge Function), so we
-- hardcode it here for the single production project.
--
-- Project ref: tavmbcghxjeyaoptndvn  (production, single Supabase project)
--
-- One-time manual step after this migration applies (Dashboard → SQL Editor):
--   select vault.create_secret('<service role JWT>', 'service_role_key');
-- Verify with:
--   select name from vault.secrets;        -- expect: service_role_key
--
-- The trigger reads vault via `vault.decrypted_secrets`. Missing secret → warn
-- and let the INSERT succeed (better to keep the lead than fail the form).

create or replace function public.notify_lead_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  edge_url    constant text := 'https://tavmbcghxjeyaoptndvn.supabase.co';
  service_key text;
begin
  select decrypted_secret
    into service_key
    from vault.decrypted_secrets
   where name = 'service_role_key'
   limit 1;

  if service_key is null then
    raise warning 'notify_lead: vault secret service_role_key not set; skipping HTTP call for lead %', new.id;
    return new;
  end if;

  perform extensions.http_post(
    url     := edge_url || '/functions/v1/notify-lead',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'Authorization',  'Bearer ' || service_key
    ),
    body    := jsonb_build_object('lead_id', new.id)
  );

  return new;
end;
$$;

-- ============================================================
-- 0008_notify_lead_use_net_schema.sql
-- ============================================================
-- fixup #2 — call pg_net via the `net` schema, not `extensions`.
--
-- Why: pg_net's `http_post` lives in the `net` schema regardless of the
-- `create extension ... with schema extensions` clause — the extension
-- creates and owns its own `net` schema. 0006/0007 used `extensions.http_post(...)`
-- which raised at INSERT time:
--   ERROR: function extensions.http_post(url => text, headers => jsonb, body => jsonb) does not exist
-- and bubbled up to the public POST /api/leads route as `insert_failed`.
--
-- Fix: `create or replace` the trigger function with `net.http_post(...)`
-- and add `net` to the function's search_path.

create or replace function public.notify_lead_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  edge_url    constant text := 'https://tavmbcghxjeyaoptndvn.supabase.co';
  service_key text;
begin
  select decrypted_secret
    into service_key
    from vault.decrypted_secrets
   where name = 'service_role_key'
   limit 1;

  if service_key is null then
    raise warning 'notify_lead: vault secret service_role_key not set; skipping HTTP call for lead %', new.id;
    return new;
  end if;

  perform net.http_post(
    url     := edge_url || '/functions/v1/notify-lead',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'Authorization',  'Bearer ' || service_key
    ),
    body    := jsonb_build_object('lead_id', new.id)
  );

  return new;
end;
$$;

-- ============================================================
-- 0009_realtime_leads.sql
-- ============================================================
-- add leads to supabase_realtime publication so the dashboard
-- /leads page receives live INSERT events when buyers submit the public form.
--
-- RLS policies (defined in 0001) still apply to Realtime: clients only receive
-- events for rows they can SELECT. Agents only see leads on their own listings.
--
-- The dashboard leads page combines this with a polling fallback (5s) gated on
-- "do we have any leads still pending notified_at" — so even if Realtime drops
-- events (server-side RLS filter quirks, network), the UI eventually settles.

alter publication supabase_realtime add table public.leads;

-- ============================================================
-- 0010_ai_usage_log.sql
-- ============================================================
-- ─── 0010_ai_usage_log ─────────────────────────────────────────────
-- Per-agent rate-limit ledger for AI copy generation.
--
-- Why a table (vs Redis/in-memory):
--   * V1 stack is locked to Supabase Postgres + Vercel — no Redis dep.
--   * Vercel serverless instances don't share memory; in-process counters
--     leak across cold starts. A row-level ledger is the simplest correct
--     answer at our volume (~10s of generations/day during internal beta).
-- * Bonus: persisted history doubles as a cost-audit trail. + can
--     query "tokens billed per agent per month" without new infra.
--
-- The route handler queries last-minute count(*) per (agent_id, kind),
-- rejects when >= 10. Index is tuned for that exact query.
--
-- RLS: agent reads own rows (transparency); inserts go through the route
-- handler with service role (the rate-limit decision is a trust boundary,
-- not something we want clients writing directly).

create table public.ai_usage_log (
  id          bigserial primary key,
  agent_id    uuid not null references public.agents on delete cascade,
  kind        text not null check (kind in ('listing_copy', 'social_copy')),
  created_at  timestamptz not null default now()
);

-- Supports `where agent_id = ? and kind = ? and created_at > now() - interval '1 minute'`.
create index ai_usage_log_agent_kind_idx
  on public.ai_usage_log (agent_id, kind, created_at desc);

alter table public.ai_usage_log enable row level security;

create policy "agent reads own ai usage" on public.ai_usage_log
  for select using (
    agent_id in (select id from public.agents where user_id = auth.uid())
  );
-- No insert/update/delete policies for anon/authenticated — service role only.

-- ============================================================
-- 0011_listing_photos_and_geo.sql
-- ============================================================
-- ─── 0011_listing_photos_and_geo ────────────────────────────────────
-- + 11 (2026-06-12).
--
-- Two changes bundled because they ship as one product release:
--
-- (1) listing photos. New table `listing_photos`. We did NOT
--     consolidate `listing_videos` + photos into a single `listing_media`
--     table because:
--       * Existing video flow (RLS, webhook, realtime, dashboard, browse)
--         is wired to `listing_videos` in ~12 files. Renaming everything
--         in one migration is risky and slows the photo ship.
--       * Cloudflare Stream (videos) and Supabase Storage (photos) have
--         different status fields, different ownership, different lifecycle.
--         Forcing them into one table costs a discriminated `kind` column
--         and a dozen `case when` branches in queries.
--       * If we ever want a media gallery query, a SQL view UNIONing the
--         two tables is trivial. The reverse (split a merged table) is not.
--     Trade-off: two tables to read in `lib/feed/browse-cards.ts`.
--     Acceptable — already reading `community_videos` separately.
--
-- (2) geo on community_videos. The existing `community_videos`
--     table has no lat/lng, which means we cannot answer "community
--     content within X miles of my listing". Adding lat/lng lets the
--     `/nearby` page query both listings and community videos by radius
--     against the user's geolocation.
--
-- Storage backend for photos: Supabase Storage (NOT Cloudflare Images).
-- Reason: already in the stack, no new vendor / API key to procure for
-- V1. Bandwidth at our scale (handful of agents, ~15 photos per listing)
-- is well within the free tier. We can swap to Cloudflare Images later
-- if cost or transformation needs justify it — the photo URL column is
-- opaque to the rest of the app.
--
-- ────────────────────────────────────────────────────────────────────
-- Pre-flight (run once, in Supabase dashboard if not already done):
--   1. Storage → New bucket → name: 'listing-photos', public read = ON.
--      The RLS policies below enforce write-side ownership.
--   2. Storage → listing-photos bucket → Settings:
--        - File size limit: 10 MB
--        - Allowed MIME types: image/jpeg, image/png, image/webp
--   3. Confirm `pgcrypto` ext is on (it is, from 0001_init).
-- ────────────────────────────────────────────────────────────────────

-- ─── (1) listing_photos ─────────────────────────────────────────────
create table public.listing_photos (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references public.listings on delete cascade,

  -- Path inside the `listing-photos` Supabase Storage bucket.
  -- e.g. `{listing_id}/{uuid}.jpg`. Read via the public URL helper or via
  -- a signed URL if we ever lock the bucket private.
  storage_path  text not null unique,

  -- Optional human label for accessibility / future SEO alt-text.
  alt_text      text,

  -- Status mirrors `listing_videos` for parity, but photos go straight to
  -- 'ready' on insert (no async processing pipeline like Stream has).
  -- 'error' is here only for hand-mark recovery.
  status        text not null default 'ready'
                  check (status in ('ready', 'error')),

  -- -style sortable position. Cover photo is the one with
  -- min(sort_order) by default; agents can override via the cover panel
  -- (sets `listings.cover_url` directly to that photo's public URL).
  sort_order    integer not null default 0,

  -- Image dimensions captured client-side at upload time. Optional, but
  -- useful for responsive `<img sizes>` and the placeholder aspect ratio.
  width         integer,
  height        integer,

  created_at    timestamptz not null default now()
);

create index listing_photos_listing_idx
  on public.listing_photos (listing_id, sort_order);

-- Realtime: same publication membership as `listing_videos` so the edit
-- page can use one Realtime channel for "media updated".
alter publication supabase_realtime add table public.listing_photos;
alter table public.listing_photos replica identity full;

alter table public.listing_photos enable row level security;

-- Owner: full CRUD on photos belonging to listings they own.
create policy "agent manages own listing photos" on public.listing_photos
  for all using (
    listing_id in (
      select l.id from public.listings l
        join public.agents a on a.id = l.agent_id
      where a.user_id = auth.uid()
    )
  );

-- Public: read photos for published listings (parallel to listing_videos).
create policy "public reads published listing photos" on public.listing_photos
  for select using (
    listing_id in (select id from public.listings where status = 'published')
  );

-- ─── (2) Storage RLS for `listing-photos` bucket ────────────────────
-- Path convention: {listing_id}/{filename}. RLS policies fence the first
-- path segment to a listing the caller owns.
--
-- NB: Supabase Storage RLS targets `storage.objects`. Bucket id is the
-- first arg to all helpers. We do `split_part(name, '/', 1)::uuid` to
-- pull the listing_id off the path.

-- Owner upload: agent can insert objects under listings they own.
create policy "agent uploads to own listing photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (split_part(name, '/', 1))::uuid in (
      select l.id from public.listings l
        join public.agents a on a.id = l.agent_id
      where a.user_id = auth.uid()
    )
  );

-- Owner delete: agent can delete objects under listings they own.
create policy "agent deletes own listing photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'listing-photos'
    and (split_part(name, '/', 1))::uuid in (
      select l.id from public.listings l
        join public.agents a on a.id = l.agent_id
      where a.user_id = auth.uid()
    )
  );

-- Public read: bucket is public so anyone can fetch by URL. No RLS
-- needed for SELECT — bucket-level public flag handles it.

-- ─── (3) geo on community_videos ─────────────────────────
-- Why on community_videos and not on `communities` itself? A community
-- has many videos; each video is shot at a specific point (a school
-- entrance, a coffee shop, a park gate). Tagging each video lets the
-- `/nearby` query say "school videos within 2mi" without inheriting a
-- coarser community-centroid lat/lng.
alter table public.community_videos
  add column lat numeric(9, 6),
  add column lng numeric(9, 6);

-- B-tree on lat/lng for the V1 simple-radius query
-- (`abs(lat - ?) < r and abs(lng - ?) < r`). We are deliberately NOT
-- adding PostGIS — see DEVLOG 2026-06-12 for the trade-off. When we
-- have >10k community videos, swap in `geography(Point, 4326)` + GIST.
create index community_videos_geo_idx
  on public.community_videos (lat, lng)
  where lat is not null and lng is not null;

-- ─── (4) Publish gate relaxation ────────────────────────────────────
-- Existing publish flow (see app/dashboard/listings/[id]/edit/actions.ts)
-- requires ≥1 ready listing_video before allowing status='published'.
-- expands this to: at least 1 ready listing_video OR 1 ready
-- listing_photo. The check is in application code, not a DB constraint
-- (constraints can't easily reference two tables). This migration makes
-- no DB changes for this; documented here for traceability.
--
-- ────────────────────────────────────────────────────────────────────
-- Verify after `supabase db push`:
--   select count(*) from public.listing_photos;            -- 0
--   select column_name from information_schema.columns
--     where table_name = 'community_videos' and column_name in ('lat','lng');
--   -- two rows: lat, lng
--   -- Storage bucket 'listing-photos' visible in dashboard, public.
-- ────────────────────────────────────────────────────────────────────

-- ============================================================
-- 0012_buyer_accounts.sql
-- ============================================================
-- ─────────────────────────────────────────────────────────────────
-- 0012_buyer_accounts.sql
--
-- introduce buyer accounts alongside agent accounts.
--
-- Until now the only authenticated principal in V1 was an agent
-- (see 0002_agent_signup_trigger.sql). This migration:
--
--   1. Creates a `buyers` table mirroring the agents row 1-to-1 with
--      auth.users for buyer-type accounts.
--   2. Replaces handle_new_user() to branch on the role passed via
--      Supabase signUp `options.data.role`:
--         - 'agent' (or unset, for backward compat)  → insert agents row
--         - 'buyer'                                  → insert buyers row
--   3. Locks down RLS: each buyer can read/update their own row;
--      no public reads.
--
-- Saved-listings + messaging tables come in /15.3.
-- ─────────────────────────────────────────────────────────────────

-- 1. buyers table
create table if not exists public.buyers (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists buyers_email_idx on public.buyers (email);

alter table public.buyers enable row level security;

-- A buyer can read their own row.
drop policy if exists "buyers_self_select" on public.buyers;
create policy "buyers_self_select" on public.buyers
  for select using (auth.uid() = user_id);

-- A buyer can update their own row.
drop policy if exists "buyers_self_update" on public.buyers;
create policy "buyers_self_update" on public.buyers
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- INSERT goes through handle_new_user (security definer); no anon policy needed.
-- DELETE cascades from auth.users; no policy needed.

-- 2. Replace handle_new_user with role-aware branch.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_role text;
  base_slug text;
  candidate text;
  n         int := 0;
begin
  user_role := coalesce(new.raw_user_meta_data->>'role', 'agent');

  if user_role = 'buyer' then
    insert into public.buyers (user_id, display_name, email)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
      new.email
    );
    return new;
  end if;

  -- Default / 'agent' branch (preserves prior behavior).
  base_slug := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  if base_slug = '' or base_slug is null then
    base_slug := 'agent';
  end if;

  candidate := base_slug;
  while exists (select 1 from public.agents where slug = candidate) loop
    n := n + 1;
    candidate := base_slug || '-' || (n + 1);
  end loop;

  insert into public.agents (user_id, slug, name, email)
  values (
    new.id,
    candidate,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

-- Trigger already exists from 0002; replace function definition is enough.

-- ============================================================
-- 0013_community_created_by.sql
-- ============================================================
-- community ownership.
--
-- Adds `communities.created_by` so we can gate metadata edits to the agent
-- who created the row. V1 left communities fully shared (any authenticated
-- agent could edit). Now that we have multiple agents using the platform,
-- we want a soft ownership boundary on metadata while keeping schools / POIs
-- / videos still globally writable (those are crowdsourced data, not the
-- "identity" of the community).
--
-- Behaviour:
--   * Existing rows get `created_by = NULL`. NULL is treated as "legacy /
--     unowned"; the RLS policy lets any authenticated agent edit those.
--     New rows get `created_by` populated server-side from the authenticated
--     agent. Once owned, only that agent can update/delete metadata.
--   * Insert remains open to any authenticated agent. The application code
--     stamps `created_by` to the calling agent's id.
--   * Public reads unchanged.
--
-- Why a column on `communities` rather than a join table: V1 has one creator
-- per community, no co-ownership, no transfer. A nullable FK is enough.

alter table public.communities
  add column created_by uuid references public.agents(id) on delete set null;

create index communities_created_by_idx on public.communities (created_by);

-- Replace the V1 "any authenticated agent does anything" policy with split
-- policies: insert open, select public, update/delete gated to creator
-- (or unowned legacy rows).

drop policy if exists "agents manage communities" on public.communities;

create policy "agents insert communities"
  on public.communities
  for insert
  with check (auth.role() = 'authenticated');

create policy "creator updates community"
  on public.communities
  for update
  using (
    created_by is null
    or created_by in (select id from public.agents where user_id = auth.uid())
  )
  with check (
    created_by is null
    or created_by in (select id from public.agents where user_id = auth.uid())
  );

create policy "creator deletes community"
  on public.communities
  for delete
  using (
    created_by is null
    or created_by in (select id from public.agents where user_id = auth.uid())
  );

-- ============================================================
-- 0014_leads_followed_up.sql
-- ============================================================
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

-- ============================================================
-- 0015_community_photos.sql
-- ============================================================
-- ─── 0015_community_photos ─────────────────────────────────────────
-- --
-- Adds a private photo library scoped to a community. UNLIKE
-- listing_photos, these photos are NOT buyer-visible — they
-- exist solely as raw material for future AI video generation. Bucket
-- is private, RLS denies anon read.
--
-- Why a new table instead of folding into `community_videos`:
--   * Different storage backend (Supabase Storage vs Cloudflare Stream),
--     different status lifecycle (`ready` synchronously vs `processing`
--     polling), different MIME contract.
--   * `community_videos` is a hot path for public buyer queries
--     (browse-cards.ts, /v/[a]/[l]). Adding a `media_kind` discriminator
--     would force a `where media_kind = 'video'` predicate everywhere
--     and it's easy to miss one — cheaper to keep the buyer table pure.
--
-- ────────────────────────────────────────────────────────────────────
-- Pre-flight (owner action — run BEFORE applying this migration):
--   Storage → New bucket → name: 'community-photos'
--     - Public read = OFF (private; no public buyer URL)
--     - File size limit: 10 MB
--     - Allowed MIME types: image/jpeg, image/png, image/webp
-- ────────────────────────────────────────────────────────────────────

-- ─── (1) community_photos table ─────────────────────────────────────
create table public.community_photos (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references public.communities on delete cascade,

  -- Path inside the `community-photos` Supabase Storage bucket.
  -- e.g. `{community_id}/{uuid}.jpg`.
  storage_path  text not null unique,

  -- Mirrors community_videos.kind so a future ETL can pair photos →
  -- ai-generated videos by category.
  kind          text not null default 'neighborhood'
                  check (kind in ('school', 'poi', 'neighborhood')),

  -- Optional links — when kind=school link to one of the community's
  -- schools; when kind=poi link to one of the community's POIs.
  school_id     uuid references public.schools on delete set null,
  poi_id        uuid references public.pois on delete set null,

  -- Optional geo for future AI-generated nearby video metadata.
  lat           numeric(9, 6),
  lng           numeric(9, 6),

  alt_text      text,
  width         integer,
  height        integer,

  -- Photos go straight to 'ready' on insert (no async processing).
  status        text not null default 'ready'
                  check (status in ('ready', 'error')),
  sort_order    integer not null default 0,

  created_at    timestamptz not null default now()
);

create index community_photos_community_idx
  on public.community_photos (community_id, sort_order);

-- Realtime: same publication membership as community_videos so the
-- dashboard panel can use one channel for "community media updated".
alter publication supabase_realtime add table public.community_photos;
alter table public.community_photos replica identity full;

alter table public.community_photos enable row level security;

-- Authenticated agents can read+write community photos. Mirrors the
-- community_videos write policy (any authenticated agent can upload to
-- any community — communities are a shared editorial space). NO public
-- read policy → anon cannot select. That is the buyer-invisible gate.
create policy "agents manage community photos" on public.community_photos
  for all to authenticated
  using (auth.uid() in (select user_id from public.agents))
  with check (auth.uid() in (select user_id from public.agents));

-- ─── (2) Storage RLS for `community-photos` bucket ──────────────────
-- Path convention: {community_id}/{filename}. Storage RLS scopes the
-- first path segment to a real community. Agent gating mirrors the
-- table policy.

create policy "agents upload community photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'community-photos'
    and auth.uid() in (select user_id from public.agents)
    and (split_part(name, '/', 1))::uuid in (select id from public.communities)
  );

create policy "agents read community photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'community-photos'
    and auth.uid() in (select user_id from public.agents)
  );

create policy "agents delete community photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'community-photos'
    and auth.uid() in (select user_id from public.agents)
    and (split_part(name, '/', 1))::uuid in (select id from public.communities)
  );

-- No anon select policy → bucket is private; only signed URLs work.

-- ────────────────────────────────────────────────────────────────────
-- Verify after `supabase db push`:
--   select count(*) from public.community_photos;            -- 0
--   -- Storage bucket 'community-photos' visible in dashboard, public-read=OFF.
-- ────────────────────────────────────────────────────────────────────

-- ============================================================
-- 0016_saved_listings.sql
-- ============================================================
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

-- ============================================================
-- 0017_community_video_categories.sql
-- ============================================================
-- 0017_community_video_categories.sql — (2026-06-14)
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
-- until is fully shipped, then we'll drop it in a later migration.
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
-- TODO once UI ships and prod data is reclassified:
--   - drop column `kind`
--   - drop the old kind check constraint
--   - tighten events.card_type if we want category-level cards
--
-- Intentionally NOT done here so we can roll forward incrementally.

-- ============================================================
-- 0018_community_video_address.sql
-- ============================================================
-- 0018_community_video_address — --
-- Adds a free-text `address` to community_videos so agents can write a
-- human-readable location ("Smith Park, 123 Main St") instead of being
-- forced to pick a POI/school from a dropdown. lat/lng (added in 0011)
-- continues to back the Nearby query and is now silently filled by the
-- browser's geolocation when address is empty — never surfaced in the UI.
--
-- Backwards compatible: column is nullable.

alter table public.community_videos
  add column if not exists address text;

comment on column public.community_videos.address is
  'human-readable address typed by uploader. May be null when only lat/lng (silent geo) is recorded.';

-- ============================================================
-- 0019_community_photo_category.sql
-- ============================================================
-- 0019_community_photo_category — --
-- Adds the same 12-category axis to community_photos that we put on
-- community_videos in 0017. Photos still aren't buyer-visible (private
-- bucket, raw material for AI video generation), but tagging them at
-- upload time means future AI assembly can group images by category
-- without having to infer it from pixels.
--
-- Backwards compatible: column is nullable. Existing rows get a
-- conservative default (`neighborhood_walk` — the closest analogue to
-- the legacy `kind='neighborhood'` value). We do NOT mark them
-- needs_review for now because nothing reads that flag for photos.

alter table public.community_photos
  add column if not exists category text;

update public.community_photos
  set category = case
    when kind = 'school' then 'school_run'
    when kind = 'poi' then 'walk_the_block'
    else 'neighborhood_walk'
  end
  where category is null;

comment on column public.community_photos.category is
  '12-value taxonomy — same axis as community_videos.category. '
  'See lib/zod/community-video-categories.ts for the list. Nullable for '
  'backwards compat; new uploads should always set it.';

-- ============================================================
-- 0020_buyer_self_insert.sql
-- ============================================================
-- ─────────────────────────────────────────────────────────────────
-- 0020_buyer_self_insert.sql
--
-- Allow a buyer to insert their own row into public.buyers.
--
-- Background: 0012 created the buyers table with self_select + self_update
-- RLS but no self_insert policy. The intent was that handle_new_user (a
-- security-definer trigger) would insert the row at signup. Two cases break
-- that assumption:
--   1. Legacy users that signed up before 0012 was applied — they have an
--      auth.users row but no buyers row.
--   2. Users that signed up as 'agent' (default) and later need a buyer
--      row — currently impossible to backfill from app code.
--
-- 's inline display-name editor needs to upsert into buyers from
-- the user's session, so we add a tightly scoped self-insert policy:
-- buyers can ONLY insert their own row (user_id = auth.uid()).
-- ─────────────────────────────────────────────────────────────────

drop policy if exists "buyers_self_insert" on public.buyers;
create policy "buyers_self_insert" on public.buyers
  for insert with check (auth.uid() = user_id);

-- ============================================================
-- 0021_avatars.sql
-- ============================================================
-- ─── 0021_avatars ───────────────────────────────────────────────────
-- User avatar picker + upload.
--
-- Scope:
--   * Add `avatar_url` to `public.buyers` (mirrors `agents.headshot_url`
--     which already exists from 0001_init.sql).
--   * Storage RLS for the `avatars` bucket: any authenticated user can
--     write under their own `{user_id}/...` prefix; everyone can read.
--
-- Why one shared bucket (not `agent-avatars` + `buyer-avatars`):
--   A user is exactly one of agent/buyer in V1, identified by
--   `auth.uid()`. Path-prefix RLS by user_id is unambiguous and avoids
--   role-table joins in storage policies (cheaper, simpler).
--
-- Why we DON'T rename `agents.headshot_url` to `avatar_url`:
--   The column is already referenced by `/a/[agentSlug]/page.tsx` and
--   would force a rename in app code + a non-trivial prod migration.
--   The UI layer normalises both fields to "avatar" — DB columns stay
--   put. Surgical changes only.
--
-- ────────────────────────────────────────────────────────────────────
-- Pre-flight (owner action — run BEFORE applying this migration):
--   Storage → New bucket → name: 'avatars'
--     - Public read = ON
--     - File size limit: 5 MB
--     - Allowed MIME types: image/webp, image/jpeg, image/png
-- ────────────────────────────────────────────────────────────────────

-- ─── (1) buyers.avatar_url ──────────────────────────────────────────
alter table public.buyers
  add column if not exists avatar_url text;

-- ─── (2) Storage RLS on the `avatars` bucket ────────────────────────
-- Path convention: `{auth.uid()}/{uuid}.webp`. The first path segment
-- MUST equal the caller's auth.uid() — fence both writes and deletes.
-- Public reads are handled by the bucket-level public flag; no select
-- policy required here.

drop policy if exists "users upload own avatar" on storage.objects;
create policy "users upload own avatar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (split_part(name, '/', 1))::uuid = auth.uid()
  );

drop policy if exists "users update own avatar" on storage.objects;
create policy "users update own avatar" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (split_part(name, '/', 1))::uuid = auth.uid()
  )
  with check (
    bucket_id = 'avatars'
    and (split_part(name, '/', 1))::uuid = auth.uid()
  );

drop policy if exists "users delete own avatar" on storage.objects;
create policy "users delete own avatar" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (split_part(name, '/', 1))::uuid = auth.uid()
  );

-- ────────────────────────────────────────────────────────────────────
-- Verify after `supabase db push`:
--   select column_name from information_schema.columns
--     where table_schema='public' and table_name='buyers' and column_name='avatar_url';
--   -- Storage bucket 'avatars' visible in dashboard, public-read=ON.
-- ────────────────────────────────────────────────────────────────────

-- ============================================================
-- 0022_avatars_bucket.sql
-- ============================================================
-- ─── 0022_avatars_bucket ────────────────────────────────────────────
-- Bootstrap the `avatars` Storage bucket via SQL
-- so we don't need a manual Dashboard step. Idempotent.
-- ────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ============================================================
-- 0023_community_video_extra_links.sql
-- ============================================================
-- 0023: community video N:N extra links
--
-- Each community_video already has a single primary
-- community_id (the one the uploading agent picks at upload time). To support
-- "this video also makes sense in these other communities" without forcing
-- agents to re-upload, we add a side table that records additional memberships.
-- The original community_videos.community_id stays put — it's still the
-- "origin / primary" community and continues to drive existing queries.
--
-- The unified membership view (community_video_membership) collapses primary +
-- extras so /c/[slug] pages can do one read.

create table public.community_video_extra_links (
  community_id uuid not null references public.communities on delete cascade,
  video_id     uuid not null references public.community_videos on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (community_id, video_id)
);

create index cvel_community_idx on public.community_video_extra_links (community_id);
create index cvel_video_idx     on public.community_video_extra_links (video_id);

alter table public.community_video_extra_links replica identity full;
alter table public.community_video_extra_links enable row level security;

-- Public can read all extra links (mirrors the public-readable policy on
-- community_videos itself).
create policy "public reads community video extra links"
  on public.community_video_extra_links
  for select using (true);

-- Authenticated agents manage links (write-side authorization further
-- enforced by server actions checking that the agent owns the underlying
-- video). RLS-only check keeps this DB-level guardrail at "must be logged
-- in", same shape as the community_videos write policy.
create policy "agents manage community video extra links"
  on public.community_video_extra_links
  for all using (auth.role() = 'authenticated');

-- Membership view: unifies primary + extras. UNION (not UNION ALL) so that
-- a video accidentally linked back to its own primary community does not
-- duplicate. Read-side queries use this view; writes still target the
-- underlying tables directly.
create or replace view public.community_video_membership as
  select community_id, id as video_id, 'primary'::text as link_kind
    from public.community_videos
  union
  select community_id, video_id,        'extra'::text   as link_kind
    from public.community_video_extra_links;

comment on table  public.community_video_extra_links is
  'secondary community memberships for a community_video. The video''s primary community lives on community_videos.community_id; rows here add extra memberships. Reads: query community_video_membership view.';
comment on view   public.community_video_membership is
  'unified read of which (community_id, video_id) pairs are visible. Combines community_videos.community_id (link_kind=primary) with community_video_extra_links (link_kind=extra).';

-- ============================================================
-- 0024_saved_communities.sql
-- ============================================================
-- ─── 0024_saved_communities ─────────────────────────────────────────
-- --
-- Buyer can save a community as an "interested in this neighborhood"
-- bookmark — separate signal from saving an individual listing. Lets
-- them anchor on a place first and then drill into homes inside it.
--
-- Mirrors `saved_listings` (0016) exactly: device-id keyed for the
-- anonymous V1 phase, with `user_id` reserved for the buyer-auth
-- merge later. RLS denied to anon/authenticated; access funnels
-- through server actions using the service-role client.
-- ────────────────────────────────────────────────────────────────────

create table public.saved_communities (
  device_id     text not null,
  community_id  uuid not null references public.communities on delete cascade,

  -- Filled when buyer auth merges device-keyed saves into the user.
  user_id       uuid references auth.users on delete cascade,

  created_at    timestamptz not null default now(),

  primary key (device_id, community_id)
);

create index saved_communities_user_idx on public.saved_communities (user_id) where user_id is not null;
create index saved_communities_community_idx on public.saved_communities (community_id);

alter table public.saved_communities enable row level security;
-- No grant to anon/authenticated → service-role only by default.

create view public.saved_community_counts as
  select community_id, count(*) as save_count
  from public.saved_communities
  group by community_id;

grant select on public.saved_community_counts to anon, authenticated;

-- ============================================================
-- 0025_community_covers.sql
-- ============================================================
-- ─── 0025_community_covers ──────────────────────────────────────────
-- --
-- Each community gets an editable "cover" — agent picks either one of
-- the community's videos OR uploads an image. Cover renders on:
--   * /communities (buyer grid card, 9:16)
--   * /c/[slug] (buyer detail header hero)
--   * /saved (Communities tab cards)
--
-- Two columns instead of one polymorphic ref so reads stay trivial
-- (`select cover_video_id, cover_storage_path` — no kind discriminator)
-- and DB-level cleanup works (FK ON DELETE SET NULL on the video link).
--
-- Resolution priority at render time (in app code, not SQL):
--   1. cover_video_id → Cloudflare Stream poster
--   2. cover_storage_path → public URL in `community-covers` bucket
--   3. fallback: first ready video poster (existing behavior)
--   4. fallback: blank
--
-- Storage backend: NEW public bucket `community-covers`. We can NOT
-- reuse `community-photos` because that bucket is private (signed-URL
-- only, dashboard-internal) and the cover must be readable by anon
-- buyers. Reusing it would force every buyer page render to hit the
-- sign endpoint per community card — too expensive and adds latency.
-- ────────────────────────────────────────────────────────────────────

-- ─── (1) communities columns ───────────────────────────────────────

alter table public.communities
  add column if not exists cover_video_id uuid
    references public.community_videos(id) on delete set null,
  add column if not exists cover_storage_path text;

-- Defense in depth: cannot have both set. App-level UI also prevents
-- this (clicking "pick video" clears storage_path and vice versa).
alter table public.communities
  add constraint communities_cover_xor_chk
    check (cover_video_id is null or cover_storage_path is null);

-- ─── (2) community-covers public bucket ─────────────────────────────
-- Public-read so anon buyers can fetch without signed URLs. Write
-- access is fenced by RLS (only the community's creating agent, or
-- any agent if created_by is null, matching the editor permission
-- rule in app/dashboard/communities/[id]/page.tsx).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-covers', 'community-covers', true, 10485760,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ─── (3) Storage RLS for `community-covers` bucket ──────────────────
-- Path convention: {community_id}/{filename}. Same shape as
-- `community-photos`. Owner-write check mirrors who can edit the
-- community row itself.

drop policy if exists "agent uploads to own community covers" on storage.objects;
create policy "agent uploads to own community covers" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'community-covers'
    and (split_part(name, '/', 1))::uuid in (
      select c.id from public.communities c
        left join public.agents a on a.id = c.created_by
      where c.created_by is null
         or a.user_id = auth.uid()
    )
  );

drop policy if exists "agent deletes own community covers" on storage.objects;
create policy "agent deletes own community covers" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'community-covers'
    and (split_part(name, '/', 1))::uuid in (
      select c.id from public.communities c
        left join public.agents a on a.id = c.created_by
      where c.created_by is null
         or a.user_id = auth.uid()
    )
  );

drop policy if exists "agent updates own community covers" on storage.objects;
create policy "agent updates own community covers" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'community-covers'
    and (split_part(name, '/', 1))::uuid in (
      select c.id from public.communities c
        left join public.agents a on a.id = c.created_by
      where c.created_by is null
         or a.user_id = auth.uid()
    )
  );

-- Public read: bucket-level public flag handles SELECT. No row policy
-- needed.

-- ────────────────────────────────────────────────────────────────────
-- Verify after `supabase db push`:
--   select column_name from information_schema.columns
--     where table_name = 'communities'
--       and column_name in ('cover_video_id','cover_storage_path');
--   -- two rows
--   select id from storage.buckets where id = 'community-covers';
--   -- 1 row
-- ────────────────────────────────────────────────────────────────────

-- ============================================================
-- 0026_community_video_visibility.sql
-- ============================================================
-- 0026_community_video_visibility.sql — (2026-06-17)
--
-- Add 3-state visibility to community_videos so an agent can hide a video
-- from buyers without deleting it (or shelve it permanently as `archived`).
--
--   public    — visible everywhere buyers can see (default; current behaviour)
--   private   — owner-only; suppressed from /c/[slug], /a/[agentSlug],
--               and the global swipe feed. Still listed in the dashboard.
--   archived  — same as private to buyers; the dashboard groups these
--               under a separate "Archived" lane to get them out of the
--               agent's daily working set without losing the file.
--
-- Why a single string column with a check, not an enum type:
--   - Adding values to a Postgres enum is annoying (separate transaction,
--     can't be in the same migration as data using the new value).
--   - The set is small and stable. A check constraint is fine.
--
-- RLS change: public read now filters to visibility='public'. The
-- "agents manage community videos" policy stays open to authenticated
-- users (V1: multi-agent communities still share manage). Tightening the
-- write policy to `uploaded_by = auth.uid()` is a separate change that
-- needs a sweep through the editor code first.
--
-- The community_video_extra_links public-read policy is left as
-- `using (true)` because joins through community_videos already drop
-- non-public rows via this new RLS filter.

-- ─── 1. column + backfill ────────────────────────────────────────

alter table public.community_videos
  add column if not exists visibility text not null default 'public';

alter table public.community_videos
  add constraint community_videos_visibility_check
  check (visibility in ('public', 'private', 'archived'));

-- Existing rows: everything stays public (the column default already
-- handles new inserts; this is just explicit for the audit trail).
update public.community_videos
   set visibility = 'public'
 where visibility is null;

-- ─── 2. tighten public-read RLS ─────────────────────────────────

drop policy if exists "public reads community videos" on public.community_videos;

create policy "public reads public community videos"
  on public.community_videos
  for select
  using (visibility = 'public');

-- ─── 3. index for dashboard manage-list grouping ─────────────────

create index if not exists community_videos_community_visibility_idx
  on public.community_videos (community_id, visibility);

comment on column public.community_videos.visibility is
  'public (buyers see) | private (hidden from buyers, kept in agent dashboard) | archived (hidden, parked in dashboard archive lane).';

-- ============================================================
-- 0027_community_video_owner_only.sql
-- ============================================================
-- 0027_community_video_owner_only.sql
-- Tighten community_videos write policies so an
-- agent can only update / delete videos they uploaded themselves.
--
-- Background: the original policy in 0001_init.sql was
--     for all using (auth.role() = 'authenticated')
-- which let any signed-in agent edit or delete any other agent's video.
-- That was fine when the dashboard showed "your own videos" only, but
-- phase 35.2 added a manage list that lists every video on a community
-- (so agents can see what's already there), and that exposed the gap.
--
-- Public reads stay broad — `community_videos` always allows anyone to
-- read public-visibility rows (see 0026). We only narrow writes.
--
-- Inserts: still any authenticated agent. The row's `uploaded_by` is set
-- by the server action that does the insert; we don't have a clean way
-- to require it here without breaking existing inserts that don't pass
-- the column (server defaults it from `agents.user_id = auth.uid()`).
-- Updates / deletes: the row's `uploaded_by` must match the caller's
-- agent.id. NULL `uploaded_by` (legacy rows) gets locked: nobody can
-- edit those through RLS — the V1 fleet of legacy rows is small and
-- can be touched via the service role if we ever need to.

drop policy if exists "agents manage community videos" on public.community_videos;

-- Insert: any authenticated agent can upload.
create policy "agents insert community videos"
  on public.community_videos
  for insert
  with check (auth.role() = 'authenticated');

-- Update: only the original uploader.
create policy "agents update own community videos"
  on public.community_videos
  for update
  using (
    uploaded_by in (
      select id from public.agents where user_id = auth.uid()
    )
  )
  with check (
    uploaded_by in (
      select id from public.agents where user_id = auth.uid()
    )
  );

-- Delete: only the original uploader.
create policy "agents delete own community videos"
  on public.community_videos
  for delete
  using (
    uploaded_by in (
      select id from public.agents where user_id = auth.uid()
    )
  );

comment on table public.community_videos is
  'writes locked to uploaded_by = caller''s agent.id. Reads stay open per 0026 (public visibility filter).';

-- ============================================================
-- 0028_favorites_split.sql
-- ============================================================
-- ─── 0028_favorites_split ───────────────────────────────────────────
-- --
-- Likes are a SEPARATE signal from saves. Saves (`saved_listings`,
-- `saved_communities`) = bookmark / "I want to revisit this".
-- Likes (`listing_likes`, `community_likes`) = lightweight reaction /
-- "I love this" — surfaced in the buyer's Favorites > Likes sub-tab.
--
-- Additive only. Saves tables are untouched.
--
-- Shape mirrors saved_listings/saved_communities (0016, 0024) but with
-- a synthetic `id uuid pk` per phase-43 spec. Anonymous V1 keys by
-- device_id; user_id is reserved for buyer-auth merge.
--
-- RLS posture mirrors saves: deny everything to anon/authenticated.
-- All access funnels through server actions using the service-role
-- client (see lib/buyer/likes.ts).
-- ────────────────────────────────────────────────────────────────────

create table public.listing_likes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users on delete cascade,
  device_id   text,
  listing_id  uuid not null references public.listings on delete cascade,
  created_at  timestamptz not null default now(),

  -- At least one identity must be present.
  constraint listing_likes_identity_chk check (user_id is not null or device_id is not null)
);

-- One like per (device, listing) and one per (user, listing). Partial
-- unique indexes mirror the coalesce pattern saves uses, but split
-- so the two identity domains can each enforce their own uniqueness.
create unique index listing_likes_device_uniq
  on public.listing_likes (device_id, listing_id)
  where device_id is not null;
create unique index listing_likes_user_uniq
  on public.listing_likes (user_id, listing_id)
  where user_id is not null;

create index listing_likes_listing_idx on public.listing_likes (listing_id);

alter table public.listing_likes enable row level security;
-- No grant to anon/authenticated → service-role only by default.

create view public.listing_like_counts as
  select listing_id, count(*) as like_count
  from public.listing_likes
  group by listing_id;

grant select on public.listing_like_counts to anon, authenticated;


create table public.community_likes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users on delete cascade,
  device_id    text,
  community_id uuid not null references public.communities on delete cascade,
  created_at   timestamptz not null default now(),

  constraint community_likes_identity_chk check (user_id is not null or device_id is not null)
);

create unique index community_likes_device_uniq
  on public.community_likes (device_id, community_id)
  where device_id is not null;
create unique index community_likes_user_uniq
  on public.community_likes (user_id, community_id)
  where user_id is not null;

create index community_likes_community_idx on public.community_likes (community_id);

alter table public.community_likes enable row level security;

create view public.community_like_counts as
  select community_id, count(*) as like_count
  from public.community_likes
  group by community_id;

grant select on public.community_like_counts to anon, authenticated;

-- ============================================================
-- 0029_leads_community.sql
-- ============================================================
-- ─── 0029_leads_community ───────────────────────────────────────────
-- --
-- Extend `leads` to accept community-targeted contacts. Owner rule:
-- "if exploring community directly, contact community owner". The
-- direct `/c/[slug]/feed` Contact button needs a place to land its
-- row when the buyer is interested in the neighborhood at large
-- (no listing context). agent_id is still required (NOT NULL), but
-- now derived from `communities.created_by` instead of `listing.agent_id`.
--
-- Additive: existing listing-leads keep working unchanged.
-- ────────────────────────────────────────────────────────────────────

alter table public.leads alter column listing_id drop not null;
alter table public.leads add column community_id uuid references public.communities on delete set null;

-- Exactly one of listing_id / community_id must be set (a lead is
-- about a specific home OR a specific community, never both, never
-- neither).
alter table public.leads
  add constraint leads_target_chk check (
    (listing_id is not null and community_id is null)
    or (listing_id is null and community_id is not null)
  );

create index leads_community_idx on public.leads (community_id, created_at desc);

-- ============================================================
-- 0030_simplify_status.sql
-- ============================================================
-- Simplify listing/community status to active|inactive only.
--
-- Listings: collapse three-state (draft|published|archived) → two-state
-- (active|inactive). Mapping:
--   published  → active
--   draft      → inactive
--   archived   → inactive   (archive concept removed entirely; users
--                            simply deactivate or delete)
--
-- Communities: brand-new `status` column with the same two-state model,
-- defaulting to 'active' (existing communities all stay buyer-visible).
--
-- RLS notes:
--   * Public read of listings now gates on status='active'.
--   * Public read of listing_videos / listing_photos cascades to the
--     same gate.
--   * Communities RLS stays open (no buyer visibility change in p46).

-- ─── listings ───────────────────────────────────────────────────────
-- Drop old policy + index that reference 'published'.
drop policy if exists "public reads published listings" on public.listings;
drop policy if exists "public reads published listing videos" on public.listing_videos;
drop policy if exists "public reads published photos" on public.photos;
drop policy if exists "public reads published listing photos" on public.listing_photos;
drop index if exists public.listings_status_idx;

-- Drop the old check constraint (auto-named listings_status_check by Postgres).
alter table public.listings drop constraint if exists listings_status_check;

-- Backfill: published → active, everything else → inactive.
update public.listings
   set status = case when status = 'published' then 'active' else 'inactive' end;

-- New constraint + default.
alter table public.listings
  alter column status set default 'inactive',
  add constraint listings_status_check
    check (status in ('active', 'inactive'));

-- New index for buyer-visible listings.
create index listings_status_idx on public.listings (status) where status = 'active';

-- New public read policies (active replaces published).
create policy "public reads active listings" on public.listings
  for select using (status = 'active');

create policy "public reads active listing videos" on public.listing_videos
  for select using (
    listing_id in (select id from public.listings where status = 'active')
  );

create policy "public reads active photos" on public.photos
  for select using (
    listing_id in (select id from public.listings where status = 'active')
  );

create policy "public reads active listing photos" on public.listing_photos
  for select using (
    listing_id in (select id from public.listings where status = 'active')
  );

-- ─── communities ────────────────────────────────────────────────────
-- Add status column, default 'active' for backfill so no existing
-- community goes dark for buyers. Buyer-facing visibility is NOT
-- gated by status in phase 46 (RLS stays open) — the column drives
-- dashboard UI only.
alter table public.communities
  add column if not exists status text not null default 'active'
    check (status in ('active', 'inactive'));

-- ============================================================
-- 0031_saved_social_drafts.sql
-- ============================================================
-- ─── 0031_saved_social_drafts ─────────────────────────────────────
-- Persist generated social copy so agents
-- don't lose drafts on refresh.
--
-- Design constraints (security + abuse):
--   * RLS scoped agent → listing → drafts. Agents only see/write drafts
--     for their own listings.
--   * Per-listing cap (50 drafts) enforced by trigger to prevent the
--     surface from being abused as free unbounded blob storage.
--   * Content size hard cap (8 KB) checked at column level. The model's
--     longest legitimate single-cell output is ~2 KB; 8 KB is generous
--     padding without enabling abuse.
--   * Inserts are gated by the same per-agent rate limit as generation
--     (in the route handler), and saves are independent of generation
--     so an agent can refine and re-save without burning another
--     Anthropic call.
--
-- Schema mirrors the generator's (platform, language, body) shape so
-- the UI can list saved drafts grouped by platform and reuse the same
-- enums it already understands.

create table public.saved_social_drafts (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings on delete cascade,
  agent_id    uuid not null references public.agents on delete cascade,
  platform    text not null check (platform in (
    'facebook', 'instagram', 'email', 'tiktok', 'x',
    'linkedin', 'threads', 'rednote', 'wechat'
  )),
  language    text not null check (language in ('en', 'zh', 'es', 'vi', 'ko')),
  body        text not null check (length(body) > 0 and length(body) <= 8192),
  highlights  text[],
  created_at  timestamptz not null default now()
);

create index saved_social_drafts_listing_idx
  on public.saved_social_drafts (listing_id, created_at desc);

-- Per-listing cap. Trigger fires before insert; if the listing already has
-- 50 drafts, raise. We don't auto-evict — surfacing the cap to the agent
-- is more honest than silently dropping their oldest draft.
create or replace function public.enforce_saved_social_drafts_cap()
returns trigger language plpgsql as $$
declare
  cnt integer;
begin
  select count(*) into cnt
    from public.saved_social_drafts
    where listing_id = new.listing_id;
  if cnt >= 50 then
    raise exception 'saved_drafts_cap_reached'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger saved_social_drafts_cap
  before insert on public.saved_social_drafts
  for each row execute function public.enforce_saved_social_drafts_cap();

alter table public.saved_social_drafts enable row level security;

-- Agent reads own listings' drafts.
create policy "agent reads own social drafts" on public.saved_social_drafts
  for select using (
    agent_id in (select id from public.agents where user_id = auth.uid())
  );

-- Agent inserts drafts for own listings (route handler also validates
-- listing ownership; defense in depth here).
create policy "agent saves own social drafts" on public.saved_social_drafts
  for insert with check (
    agent_id in (select id from public.agents where user_id = auth.uid())
    and listing_id in (
      select l.id from public.listings l
      join public.agents a on a.id = l.agent_id
      where a.user_id = auth.uid()
    )
  );

-- Agent deletes own drafts.
create policy "agent deletes own social drafts" on public.saved_social_drafts
  for delete using (
    agent_id in (select id from public.agents where user_id = auth.uid())
  );
-- No update policy: drafts are immutable. Edit = delete + re-save.

-- ============================================================
-- 0032_saved_social_drafts_update.sql
-- ============================================================
-- ─── 0032_saved_social_drafts_update ──────────────────────────────
-- Allow agents to edit their own saved drafts
-- in place. made drafts immutable to keep the surface simple,
-- but qiaoxux wants in-place edit so a refined post can be saved without
-- the delete + re-save dance (which also loses the original timestamp).
--
-- Why now: edits feed back into regenerate. If a user tweaks a draft,
-- the next "Regenerate" should treat that edited body as the seed. Edit
-- + persist is the natural shape.
--
-- Constraints:
--   * Only body / language are user-editable. platform stays pinned to
--     the original — switching platforms means a different draft.
--   * created_at stays put; we add updated_at to surface "last edited".
--   * RLS update policy mirrors select: agent → own drafts only.

alter table public.saved_social_drafts
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_saved_social_drafts_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists saved_social_drafts_touch on public.saved_social_drafts;
create trigger saved_social_drafts_touch
  before update on public.saved_social_drafts
  for each row execute function public.touch_saved_social_drafts_updated_at();

create policy "agent updates own social drafts" on public.saved_social_drafts
  for update using (
    agent_id in (select id from public.agents where user_id = auth.uid())
  ) with check (
    agent_id in (select id from public.agents where user_id = auth.uid())
  );

-- ============================================================
-- 0033_saved_social_drafts_title_and_cache.sql
-- ============================================================
-- ─── 0033_saved_social_drafts_title_and_cache ─────────────────────
-- Two adjacent product needs:
--
-- 1. Rename. Saved drafts get plenty of accumulation, and "Facebook ·
--    English · 6/22 7:42 PM" doesn't scale. Add an optional `title`
--    so agents can label drafts ("Open house — front yard angle").
--    Nullable, max 120 chars.
--
-- 2. Token-cache. Re-clicking Generate with the exact same inputs
--    used to call Claude every time. Add `input_hash` (sha256 hex of
--    normalized {platform, language, highlights}) so the API can
--    look up an existing draft and short-circuit the LLM call. Index
--    on (listing_id, input_hash) for the lookup. Hash is set by the
--    server, not the client — we trust the server's normalization.
--
-- Cache semantics:
--   * Insert sets input_hash from server-side normalization.
--   * On a generate request the API hashes the same way and selects
--     the most recent matching row for this listing → if found,
--     return its body, no LLM call. Refine ("previous_drafts" is
--     present) always bypasses the cache by intent.
--   * Edits update input_hash to NULL — once the agent has tweaked
--     the body, the row is no longer "the canonical answer for this
--     prompt", so a future identical prompt should re-generate
--     fresh rather than return a stale tweaked body. (See below for
--     the trigger that handles this.)

alter table public.saved_social_drafts
  add column if not exists title text,
  add column if not exists input_hash text;

alter table public.saved_social_drafts
  drop constraint if exists saved_social_drafts_title_len;
alter table public.saved_social_drafts
  add constraint saved_social_drafts_title_len
  check (title is null or char_length(title) between 1 and 120);

-- Lookup index: scoped per listing, sparse on hash so edited rows
-- (hash NULL) are excluded from cache hits.
create index if not exists saved_social_drafts_input_hash_idx
  on public.saved_social_drafts (listing_id, input_hash)
  where input_hash is not null;

-- When an edit changes body, drop input_hash so the row is no longer
-- a cache target. Title rename is fine — doesn't invalidate.
create or replace function public.invalidate_saved_social_drafts_cache()
returns trigger language plpgsql as $$
begin
  if new.body is distinct from old.body then
    new.input_hash := null;
  end if;
  return new;
end;
$$;

drop trigger if exists saved_social_drafts_invalidate_cache
  on public.saved_social_drafts;
create trigger saved_social_drafts_invalidate_cache
  before update on public.saved_social_drafts
  for each row execute function public.invalidate_saved_social_drafts_cache();

-- ============================================================
-- 0034_saved_social_drafts_community.sql
-- ============================================================
-- ─── 0034_saved_social_drafts_community ────────────────────────────
-- Extend `saved_social_drafts` to also hold
-- community marketing drafts.
--
-- Listing drafts are platform × language. Community drafts are
-- language-only — one general-purpose blurb per language that the
-- agent copies into whichever channel they want. Different shape, but
-- same lifecycle (save / list / edit / delete / per-listing cap /
-- input-hash cache), so we extend the existing table instead of
-- forking a parallel one.
--
-- Schema changes:
--   * `listing_id` becomes nullable.
--   * Add `community_id` (nullable, references communities).
--   * Add target check: exactly one of listing_id / community_id set.
--   * `platform` becomes nullable. Listing rows MUST set it; community
--     rows MUST leave it null. Enforced by check constraint.
--   * Cap trigger expanded: 50 drafts per listing OR per community.
--   * RLS extended so a community's `created_by` agent can manage its
--     drafts (mirrors leads_community RLS in 0029).
--
-- Backwards compatible: every existing row has listing_id+platform set
-- and community_id null. The new constraints are satisfied as-is.

-- 1. Loosen NOT NULLs and add community_id ────────────────────────
alter table public.saved_social_drafts
  alter column listing_id drop not null;
alter table public.saved_social_drafts
  alter column platform drop not null;
alter table public.saved_social_drafts
  add column if not exists community_id uuid
    references public.communities on delete cascade;

-- 2. Target & platform shape ──────────────────────────────────────
alter table public.saved_social_drafts
  drop constraint if exists saved_social_drafts_target_chk;
alter table public.saved_social_drafts
  add constraint saved_social_drafts_target_chk check (
    (listing_id is not null and community_id is null)
    or (listing_id is null and community_id is not null)
  );

alter table public.saved_social_drafts
  drop constraint if exists saved_social_drafts_platform_shape_chk;
alter table public.saved_social_drafts
  add constraint saved_social_drafts_platform_shape_chk check (
    -- listing drafts must have a platform; community drafts must not.
    (listing_id is not null and platform is not null)
    or (community_id is not null and platform is null)
  );

-- 3. Cap trigger — per-listing OR per-community ──────────────────
create or replace function public.enforce_saved_social_drafts_cap()
returns trigger language plpgsql as $$
declare
  cnt integer;
begin
  if new.listing_id is not null then
    select count(*) into cnt
      from public.saved_social_drafts
      where listing_id = new.listing_id;
  else
    select count(*) into cnt
      from public.saved_social_drafts
      where community_id = new.community_id;
  end if;
  if cnt >= 50 then
    raise exception 'saved_drafts_cap_reached'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Trigger itself unchanged from 0031; redefining ensures the new
-- function body is wired up.
drop trigger if exists saved_social_drafts_cap on public.saved_social_drafts;
create trigger saved_social_drafts_cap
  before insert on public.saved_social_drafts
  for each row execute function public.enforce_saved_social_drafts_cap();

-- 4. Index for community queries ─────────────────────────────────
create index if not exists saved_social_drafts_community_idx
  on public.saved_social_drafts (community_id, created_at desc);

-- Cache lookup variant for community rows (sparse on hash).
create index if not exists saved_social_drafts_community_input_hash_idx
  on public.saved_social_drafts (community_id, input_hash)
  where input_hash is not null and community_id is not null;

-- 5. RLS — extend each policy with the community-owner path ──────
-- Drop and recreate each one. Names match 0031 so a fresh DB still
-- has a single canonical policy per action.

drop policy if exists "agent reads own social drafts" on public.saved_social_drafts;
create policy "agent reads own social drafts" on public.saved_social_drafts
  for select using (
    agent_id in (select id from public.agents where user_id = auth.uid())
  );

drop policy if exists "agent saves own social drafts" on public.saved_social_drafts;
create policy "agent saves own social drafts" on public.saved_social_drafts
  for insert with check (
    agent_id in (select id from public.agents where user_id = auth.uid())
    and (
      listing_id in (
        select l.id from public.listings l
        join public.agents a on a.id = l.agent_id
        where a.user_id = auth.uid()
      )
      or community_id in (
        select c.id from public.communities c
        join public.agents a on a.id = c.created_by
        where a.user_id = auth.uid()
      )
    )
  );

drop policy if exists "agent deletes own social drafts" on public.saved_social_drafts;
create policy "agent deletes own social drafts" on public.saved_social_drafts
  for delete using (
    agent_id in (select id from public.agents where user_id = auth.uid())
  );

-- Update policy didn't exist in 0031 (drafts were "edit = delete + re-save"),
-- but 0033 added the invalidate-cache trigger which only runs on UPDATE. The
-- listing route handler issues PATCH directly via service role… actually
-- no: it uses the auth client. So we need an explicit update policy. Add
-- it now (idempotent — drop first).
drop policy if exists "agent updates own social drafts" on public.saved_social_drafts;
create policy "agent updates own social drafts" on public.saved_social_drafts
  for update using (
    agent_id in (select id from public.agents where user_id = auth.uid())
  ) with check (
    agent_id in (select id from public.agents where user_id = auth.uid())
  );

-- ============================================================
-- 0035_events_community.sql
-- ============================================================
-- ─── 0035_events_community ──────────────────────────────────────────
-- Extend `events` to record community-targeted
-- analytics events alongside the listing-targeted ones we've had since
-- --
-- Why: the agent-hub Community detail page now has an Analytics tab
-- mirroring the listing edit hub. To populate it we need page_view /
-- card_view / video_complete rows attributable to a community (rather
-- than to a single listing inside that community). The public
-- `/c/[slug]` and `/c/[slug]/feed` routes will start emitting these.
--
-- Same pattern as 0029_leads_community: relax the NOT NULL on
-- `listing_id`, add `community_id`, enforce exactly-one-of via a check
-- constraint, extend RLS so the community's `created_by` agent can
-- read its own events.
--
-- Anon insert policy stays as-is — it's already `with check (true)`.
-- Validation in the events route (zod) is what enforces shape.

alter table public.events alter column listing_id drop not null;
alter table public.events
  add column if not exists community_id uuid
    references public.communities on delete cascade;

-- Exactly one of listing_id / community_id must be set on every row.
-- (The events route validates the same — defense in depth.)
alter table public.events
  drop constraint if exists events_target_chk;
alter table public.events
  add constraint events_target_chk check (
    (listing_id is not null and community_id is null)
    or (listing_id is null and community_id is not null)
  );

create index if not exists events_community_idx
  on public.events (community_id, created_at desc);

-- Owner-read RLS extension. The policy reads listing-events;
-- this one adds the community-events path. Both stay co-resident so a
-- single agent SELECT scans both worlds.
drop policy if exists "agent reads own community events" on public.events;
create policy "agent reads own community events" on public.events
  for select using (
    community_id in (
      select c.id from public.communities c
      join public.agents a on a.id = c.created_by
      where a.user_id = auth.uid()
    )
  );

-- ============================================================
-- 0036_community_metadata_fields.sql
-- ============================================================
-- community metadata expansion.
--
-- Adds 10 nullable fields to `communities` so agents can capture more useful
-- community context directly on the editor form. All optional — existing rows
-- stay valid. No new RLS needed; existing creator-only update policy covers
-- these columns.
--
-- Tier 1 (high-ROI buyer questions):
--   zip, county, hoa_fee_text, year_built_text, price_range_text,
--   property_types
--
-- Tier 2 (nice-to-have):
--   highlights, builder, website, tagline
--
-- Free-text "_text" suffix on numeric-ish fields is intentional: agents
-- routinely write things like "$450k–$1.2M", "2018–2024", "$220/mo +
-- one-time initiation" and forcing strict numeric types creates more
-- friction than it saves. We trade off filterability for input ergonomics.

alter table public.communities
  add column if not exists zip text,
  add column if not exists county text,
  add column if not exists hoa_fee_text text,
  add column if not exists year_built_text text,
  add column if not exists price_range_text text,
  add column if not exists property_types text[],
  add column if not exists highlights text[],
  add column if not exists builder text,
  add column if not exists website text,
  add column if not exists tagline text;

-- Keep arrays NULL when unset (not empty array) so the editor can distinguish
-- "agent never touched this" from "agent cleared it". updateCommunity() in
-- app/dashboard/communities/actions.ts maps `[]` -> NULL on save.

-- ============================================================
-- 0037_community_metadata_typed.sql
-- ============================================================
-- community metadata typing pass.
--
-- The 0036 migration introduced free-text fields (`year_built_text`,
-- `hoa_fee_text`, `price_range_text`) for input flexibility. Owner feedback
-- (qiaoxux, 2026-06-22): "year_built — see how it is done in my listing, you
-- should do the same for my community. Be consistent with all inputs."
--
-- Listing schema treats these as typed numerics (`year_built integer`,
-- `hoa integer dollars/month` displayed with `$` + `/month` adornments).
-- For UI parity we replace the `_text` columns with the same shape on
-- `communities`, plus split price into a min/max pair so the editor can
-- render two `$`-adorned number inputs instead of a free-text range.
--
-- 0036 was applied to prod only minutes before this migration and no agent
-- has had time to populate the new columns, so a clean drop+add is safe.
-- The columns being dropped here are the three text fields from 0036; all
-- the other 0036 columns (zip, county, property_types, highlights, builder,
-- website, tagline) stay untouched.

alter table public.communities drop column if exists year_built_text;
alter table public.communities drop column if exists hoa_fee_text;
alter table public.communities drop column if exists price_range_text;

alter table public.communities
  add column if not exists year_built integer,
  add column if not exists hoa_fee_monthly integer,
  add column if not exists price_min integer,
  add column if not exists price_max integer;

-- Year ranges that should never be valid (catch typos before they hit the UI).
alter table public.communities
  add constraint communities_year_built_range_chk
    check (year_built is null or (year_built between 1800 and 2100)) not valid;
alter table public.communities validate constraint communities_year_built_range_chk;

alter table public.communities
  add constraint communities_hoa_fee_monthly_nonneg_chk
    check (hoa_fee_monthly is null or hoa_fee_monthly >= 0) not valid;
alter table public.communities validate constraint communities_hoa_fee_monthly_nonneg_chk;

alter table public.communities
  add constraint communities_price_nonneg_chk
    check (
      (price_min is null or price_min >= 0)
      and (price_max is null or price_max >= 0)
    ) not valid;
alter table public.communities validate constraint communities_price_nonneg_chk;

alter table public.communities
  add constraint communities_price_min_le_max_chk
    check (price_min is null or price_max is null or price_min <= price_max) not valid;
alter table public.communities validate constraint communities_price_min_le_max_chk;

-- ============================================================
-- 0038_community_year_built_end.sql
-- ============================================================
-- year_built_end for phased-delivery communities.
--
-- Owner feedback after 50.5: "range makes sense for some fields in a
-- community, I agree, but make them easy to use, less friction as possible."
-- Translation: agents shouldn't be forced to drop community age into the
-- description because the schema only takes one int. NoVA / metro Atlanta
-- new-builds routinely deliver in phases (e.g. 2019–2024).
--
-- Friction-minimization: end year is opt-in in the UI (collapsed behind
-- a "+ Add end year" button), so 80% of communities still fill in one box.
-- The DB column is nullable to match.

alter table public.communities
  add column if not exists year_built_end integer;

alter table public.communities
  add constraint communities_year_built_end_range_chk
    check (year_built_end is null or (year_built_end between 1800 and 2100)) not valid;
alter table public.communities validate constraint communities_year_built_end_range_chk;

-- end year, when present, must be >= start year. NULLs on either side
-- mean "no constraint" — the agent only filled in the one they care about.
alter table public.communities
  add constraint communities_year_built_end_ge_start_chk
    check (
      year_built_end is null
      or year_built is null
      or year_built_end >= year_built
    ) not valid;
alter table public.communities validate constraint communities_year_built_end_ge_start_chk;

-- ============================================================
-- 0039_drop_community_tagline.sql
-- ============================================================
-- drop tagline.
--
-- Owner: "Remove tagline it is redundant with highlights and descriptions."
-- It was added in 50.4 as a "buyer-facing one-liner" but in practice it
-- ended up duplicating either the description's first sentence or one of
-- the highlights. Cutting it removes a maintenance ask from agents.

alter table public.communities drop column if exists tagline;

-- ============================================================
-- 0040_community_video_description.sql
-- ============================================================
-- 0040_community_video_description — --
-- Add an optional free-text description to community_videos so agents can
-- write a one-line context blurb under each video (e.g. "filmed at golden
-- hour from the corner of Main & 3rd"). Replaces the yellow "needs review"
-- callout that used to occupy that slot in the management UI.
--
-- Backwards compatible: column is nullable, no default. Existing rows
-- stay null and the UI shows a "Add a description" affordance instead.

alter table public.community_videos
  add column if not exists description text;

comment on column public.community_videos.description is
  'Optional free-text caption shown under the video in the agent management UI. Not currently rendered on the public community page.';

-- ============================================================
-- 0041_leads_cascade_on_listing_delete.sql
-- ============================================================
-- backfill ON DELETE CASCADE on leads.listing_id.
--
-- Bug: deleting a listing that had ever received a lead raised a FK
-- violation (server-side exception, digest 881108286) because the
-- original 0001_init.sql declared `leads.listing_id` as a plain FK
-- without `on delete cascade`. Every other listing-child table
-- (listing_videos, listing_photos, photos, events, favorites,
-- saved_listings, saved_social_drafts) was already cascade-deleted —
-- leads was the only oversight.
--
-- Product semantics: leads belong to a listing. If the listing is
-- gone, the lead has no upstream context (buyer is messaging about
-- an entity that no longer exists). Cascade-delete matches the rest
-- of the schema and matches what the DangerZone copy on the edit
-- page already promises ("Videos, photos, leads and analytics will
-- be removed").

alter table public.leads
  drop constraint leads_listing_id_fkey;

alter table public.leads
  add constraint leads_listing_id_fkey
    foreign key (listing_id)
    references public.listings(id)
    on delete cascade;

-- ============================================================
-- 0042_leads_agent_update_policy.sql
-- ============================================================
-- leads.UPDATE RLS policy
--
-- Bug: 0001_init.sql enabled RLS on public.leads and shipped SELECT + INSERT
-- policies, but NEVER an UPDATE policy. 0014_leads_followed_up.sql's header
-- comment claimed "existing per-listing policies on public.leads cover this
-- column — SELECT/UPDATE are already gated" — that was wrong. With RLS on
-- and no matching UPDATE policy, every UPDATE silently affects 0 rows.
--
-- Symptom: agent clicks "Mark as followed up" on /dashboard/leads (or the
-- detail page toggle); UI flips optimistically; fetch resolves; the API's
-- `update().eq(id).select().maybeSingle()` returns null (0 rows) → route
-- returns 404 → client reverts → row pops back to unfollowed-up. Looked
-- like "refresh and it goes back" but actually reverted on response.
--
-- Fix: add a per-agent UPDATE policy mirroring the SELECT policy. Match the
-- existing shape (agent_id IN (select id from agents where user_id = auth.uid())).
-- WITH CHECK identical to USING — agents can't reassign a lead to another
-- agent by editing agent_id, since the new value also has to satisfy the
-- check.
--
-- Scope: deliberately narrow. No DELETE policy added — leads are append-only
-- audit data; cleanup happens via the listing-cascade in 0041.

create policy "agent updates own leads" on public.leads
  for update
  using (
    agent_id in (select id from public.agents where user_id = auth.uid())
  )
  with check (
    agent_id in (select id from public.agents where user_id = auth.uid())
  );
