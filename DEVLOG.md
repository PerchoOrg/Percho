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

## 2026-11-14 18:45 UTC — phase311.3: iOS sign-in screen reworked; phase311 live

**Objective**: Owner: "sign in 方式不自然：登录框下面应该是注册 不要写new here? email me a code stuff.... 或者用google /apple id 登录".
**Actions**: `apps/mobile/app/auth.tsx` now has three modes. Sign in: Apple, or email + password, "Forgot password?" under the password, "Don't have an account? Sign up" at the foot. Sign up: Apple (SIGN_UP button) or email + password via new `signUpWithPassword` (`lib/auth.ts`) — production `mailer_autoconfirm: true` (read from `/auth/v1/settings`), so `signUp` returns a session and the screen dismisses; "already registered" maps to "sign in instead". Forgot password: email → `requestEmailCode` (now `shouldCreateUser: false`, error text no longer passed through) → code → `router.replace('/set-password')`. `passwordFailureHint` points at "Forgot password?". Merged `4a5065d2`; reference worktree fast-forwarded + `pnpm install`.
**Decisions**: Web login already had this shape (form → Forgot password? → Sign up), so only iOS changed. Google is NOT added: `/auth/v1/settings` shows only `apple` and `email` enabled, and the iOS path needs a native Google module (new build) plus OAuth clients the owner must create. A Google button before that would fail App Review 2.1.
**Verification**: mobile typecheck 0, biome 0 errors, vitest 820. No simulator on this host — the owner checks on device. Production after `afff8cd7`: `/browse`, `/v/fmls/…` → 307 `/communities`; `/compare` signed out → 307 `/login?redirect=…`; iOS feed (`stage=3&videosOnly=1&listings=0`, CDN-bypassed) now lists 6 films including Northbrooke.
**Next steps**: Owner: device pass on sign-in / sign-up / forgot password (Metro, or build 9 when wanted); Google OAuth setup; then the video content work.

## 2026-11-14 18:20 UTC — phase311: web matches iOS — no listings, saves and compare need an account; Northbrooke cover

**Objective**: Owner, after an audit of iOS vs web: "web上不要显示房子 并且保存 和对比要求登录"; "给Northbrooke加上封面 保持一致". (Sign-in screen rework is the next step — not in this entry.)
**Audit (before)**: iOS 1.0.0 (8) already matched — `LISTINGS_IN_APP=false`, browse without login, community saves and compare gated by sign-in. One exception left as is: **area** saves (county lenses) stay device-local and need no account, so area compare doesn't either. Web did not match: `/browse` (For You, default tab and post-login landing) showed the 6 FMLS demo listings, `/search` returned them, `/saved` defaulted to listings, community pages had a listings toggle and carousel; saves were anonymous `device_id` rows written with the service role (never visible on the phone); there was no compare.
**Actions**:
- Northbrooke (`c7e84b7c…`) had a film but no `cover_storage_path`, so `fetchCommunityPool*` (`.not('cover_storage_path','is',null)`) dropped it from the iOS feed. Uploaded the source photo of its film's pool/clubhouse shot (`poi_photos e4c303bc…`, Toll Brothers site photo, 1920×1080, the same image the film shows) to `community-covers/c7e84b7c…/9efb59ac….jpg` and set the column (service role, `where cover_storage_path is null`).
- `lib/listings/listings-on-web.ts`: `LISTINGS_ON_WEB=false`, `BUYER_HOME`, `isListingRoute`. Middleware 307s `/browse*`, `/nearby`, `/v/*`, `/a/*` to `/communities`. Nav drops For You and the Saved Listing sub-tab; landing, login/signup defaults and the agents page point at `BUYER_HOME`; search skips public listing hits (an agent's own inactive drafts stay); `/c/[slug]` hides "Live here →" and skips the listing read; `/c/[slug]/feed` skips its listing query. Landing subtitle "Listings that feel…" → "Neighborhoods that feel…".
- Saves: `saved-communities.ts` / `saved-listings.ts` now use the cookie client and RLS and write `user_id = device_id = auth.uid()` exactly as iOS does (`20260904090000_mobile_auth_saves.sql`); signed out they return `not_signed_in` and callers go to `/login?redirect=…` (`lib/auth/login-href.ts`). Favorites shows a sign-in prompt when signed out. The community page hero gained a Save button (`SaveCommunityButton`) — before, the only web Save was in `/c/[slug]/feed`, which plays uploaded clips only and is empty for 5 of the 6 filmed communities.
- Compare: the iOS community compare (`compare-communities.ts`, `take.ts`) moved to `packages/shared` together with `compare/table`, `compare/take`, `reviews/dimensions`, `priorities`, `community/tour-buckets`; mobile imports them from `@percho/shared/*` (24 files, import paths only). `community-compare.ts` takes a structural `CompareCommunity` so both DTOs fit. Web `/compare?ids=` (server page, `lib/zod/compare.ts`) needs an account and draws the same take + aspects + basics; Favorites has a Compare mode (pick 2–5).
- `lib/feed/community-pool.ts` → `createUncachedAnonClient`. After the cover was set, a CDN-bypassing feed request still had no Northbrooke while PostgREST and `/api/mobile/community/northbrooke-cumming` both showed the cover: Next's fetch cache had pinned the by-ids pool read (same URL since the film existed) — the trap `lib/supabase/server.ts` documents.
**Decisions**: Redirect rather than 404 for listing routes, temporary (307), since listings return with the iOS homes version. `/a/*` is included — it is a listing portfolio. The agent dashboard is untouched. Old anonymous device-id saves stay in the table, unread (no owner to map them to; no backfill). Shared move instead of a web copy of the compare so the two screens cannot drift. Web has no stated priorities, so its rows keep default order.
**Verification**: typecheck web/mobile/shared 0; biome 0 errors (web 179 / mobile 5 warnings, unchanged); vitest web 1237, mobile 820; `next build`, `expo export --platform ios`. Preview of `d8952bdd`: `/browse`, `/browse/feed`, `/v/fmls/…`, `/a/vivian` → 307 `/communities`; search for "a" returns only the 6 `/c/` links; nav has no `/browse`; signed-out `/saved` shows the sign-in prompt (headless Chrome).
**Issues**: Web `/c/[slug]` plays no film — its videos grid reads `community_video_membership` only, and `/c/[slug]/feed` says "No videos in this neighborhood yet" for Windward. iOS plays the assembled film. Not fixed here; raised with the owner. `lib/feed/vertical-videos.ts` reads with the plain service client and may be pinned the same way — watch whether today's new films reach the feed.
**Next steps**: Signed-in checks need the owner (save → shows on phone; compare). Sign-in screen rework (iOS build + web). Google sign-in needs the owner's Google Cloud OAuth client and the Supabase provider switched on.

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

