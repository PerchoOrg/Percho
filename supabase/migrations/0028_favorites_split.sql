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
