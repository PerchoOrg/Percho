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
