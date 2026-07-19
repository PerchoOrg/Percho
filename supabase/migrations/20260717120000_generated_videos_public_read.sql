-- Phase 103 (2026-07-17): expose nearby videos to buyers.
--
-- generated_videos has agent-scoped SELECT policies only. The public listing feed at /v/[agent]/[listing] runs under the anon
-- SSR client and therefore sees `[]` for any listing-scoped or
-- community-scoped bucket video — the union code lib/listing-feed/load.ts
-- returns empty even when a `ready` row exists (5122 Lower Creek Street).
--
-- Mirror the existing listing_videos / community_videos public-read stance:
-- anon may SELECT a generated_videos row iff it belongs to an active
-- listing OR an active community. Insert/update policies unchanged.

create policy "public reads generated_videos for active listings"
  on public.generated_videos
  for select
  using (
    (
      listing_id is not null
      and listing_id in (select id from public.listings where status = 'active')
    )
    or (
      community_id is not null
      and community_id in (select id from public.communities where status = 'active')
    )
  );
