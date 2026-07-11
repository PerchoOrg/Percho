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
