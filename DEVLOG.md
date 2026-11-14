# Percho — Development Log

> The product was renamed from **Vicinity** to **Percho** on **2026-07-11**.
> Historical entries below preserve the original name in-place — the DEVLOG is
> a record of what was worked on under the product's name at the time.


## Archive

Older entries are split by month so this file stays readable in one
sitting (it had grown to 1.0 MB / 14k lines, which no agent could load).
Same reverse-chronological format, same content.

The 2026-09 entries were condensed once, in phase184, when this file had
reached 861 KB. New entries are written at normal length; compress at
rotation, not on the way in.

- [`docs/devlog/2026-10.md`](docs/devlog/2026-10.md) — 10 entries
- [`docs/devlog/2026-09.md`](docs/devlog/2026-09.md) — 217 entries
- [`docs/devlog/2026-08.md`](docs/devlog/2026-08.md) — 208 entries
- [`docs/devlog/2026-07.md`](docs/devlog/2026-07.md) — 168 entries
- [`docs/devlog/2026-06.md`](docs/devlog/2026-06.md) — 54 entries

---

## 2026-11-14 10:40 UTC — phase310.1: iOS search and map show only communities with a video

**Objective**: Owner, after reviewing the phase310 preview: "iOS 搜索改" — the app's Search tab should follow the same rule. Northbrooke's logo-SVG cover: "先不改".
**Actions**: `lib/listings/search.ts` — `searchEntities` and `mapEntities` replace the content gate `cover_storage_path is not null` with `.in('id', videoCommunityIds())`, where the ids come from `fetchCommunityListCards()` (the cached web grid set). Header comment records the change. `search-listings-flag.test.ts` mocks the grid set and asserts both reads carry the `id` filter.
**Decisions**: Changed the map viewport read too, not just typed search — the file's own rule is that the two faces of the map agree on what a community is, and a text search returning 6 while the map draws thousands of dots would break it. Server-only change: `/api/mobile/search` and `/api/mobile/map` serve the phone, so it lands on iOS with the deploy, no app release.
**Issues**: None. Typecheck clean for web, biome 0 errors, vitest 1231/1231.
**Resolution**: The iOS map now draws only the filmed communities (6 today) — a much emptier map. Flagged to the owner.
**Learnings**: Northbrooke has a film but no `cover_storage_path`; on iOS search it now appears with no `heroUrl`.
**Next steps**: Owner to check Search on the phone.

## 2026-11-14 09:55 UTC — phase310: neighborhood grid and search show only communities with a video

**Objective**: Owner: "for neighborhood, 只显示有视频的" — the web Neighborhoods grid should list only communities with a video.
**Actions**: `lib/communities/list.ts` — `fetchActiveCommunitiesImpl` no longer reads the alphabetical head of all active communities or the listing-bearing ones. It reads three id sources — uploaded community videos (`community_video_membership`, playability checked in hydration as before), `fetchVerticalVideoCommunityIds()` (assembled tour / bucket video) and `fetchAiTourVideoByCommunity()` — fetches those rows, and keeps a card when `videoCount > 0` or it has a film. `searchCommunityListCards` now filters that cached set instead of four `ilike` reads (the set is complete for what a buyer may see, so the old "grid is only a slice" reason is gone). An agent's own inactive drafts are unioned only when `videoCount > 0`. `idsWithListingsOrVideos` → `idsWithVideos`; `PAGE` removed. Search page comment updated.
**Decisions**: "Has a video" = the same sources the community page (`lib/communities/detail.ts`) and the iOS `videosOnly` feed play, plus uploaded videos. Using only `community_video_membership` would have shown one community (Ashley Crossing) while iOS shows five films. `/api/communities/nearby` was already video-driven — unchanged. Dashboard "My communities" unchanged (agents still see their own without video).
**Issues**: `tsc` in this worktree (borrowed `node_modules`) reports four errors in `../mobile` (`@percho/shared/lenses` not resolvable without the workspace link) — environmental, none in web. Anon PostgREST reads of `generated_videos` hit `57014` too, but the film helpers use the service client.
**Resolution**: Grid payload drops from 1000 cards / 14 MB to the filmed handful; it now also fits `unstable_cache`'s 2 MB limit. phase309's index is no longer on this path (search used it too, and no longer does) — harmless, left in place.
**Learnings**: Three tables decide whether a community "has a video"; check `vertical-videos.ts` and `ai-tour-videos.ts`, not just `community_video_membership`.
**Next steps**: Verify the live grid's card count against the iOS film count after deploy.

## 2026-11-14 09:20 UTC — phase309: /communities threw on a statement timeout

**Objective**: Owner opened https://www.percho.co/communities and got "Application error: a server-side exception has occurred", digest 1774318519.
**Actions**: Signed the Vercel CLI in (device login, owner approved) and searched production logs. Seven days held exactly two errors, both `GET /communities` at 08:57:52 and 08:58:10 UTC, both digest 1774318519: PostgREST `57014 canceling statement due to statement timeout`, thrown raw by `if (head.error) throw head.error` in `fetchActiveCommunitiesImpl` (`lib/communities/list.ts`). Added `supabase/migrations/20261114090000_communities_active_name_idx.sql` — partial index `communities (name) where status = 'active'`.
**Decisions**: The head read is `status = active, name not in stubs, order by name limit 1000` over ~22.7k active rows with no index on either column, so every request scans and sorts the table. Warm it takes ~150 ms; cold or under load it crossed the anon statement_timeout. The index lets the sort walk the index. Kept the throw — it exists so `unstable_cache` never holds an empty grid.
**Issues**: Could not reproduce afterwards — 21 curl requests and two headless-Chrome loads (direct + client nav from /browse) all returned 200 with 1000 cards. The page is 14 MB of HTML (7 MB RSC), ~6 MB of it logo-SVG data URLs for 691 boundary-only cards; the card set is over `unstable_cache`'s 2 MB limit, so the 60 s cache never stores and every hit re-queries the DB.
**Resolution**: Index migration; needs `pnpm db:push` after merge.
**Learnings**: `vercel logs --environment production --query <digest> --since 24h` finds a Next.js digest directly. `vercel link` writes the project's env into a `.env.local` in the linked dir — delete it.
**Next steps**: Separate task — shrink the grid payload (logo SVGs) so it fits the data cache and the page is not 14 MB.

