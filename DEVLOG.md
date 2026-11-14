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

## 2026-11-14 21:30 UTC — phase314.1: dev client 1.0.0 (9) built; TestFlight upload blocked by an Apple agreement

**Objective**: Owner approved the dev-client build ("expo go - you have my approval").
**Actions**: Reference worktree fast-forwarded to `da098f0f` + `pnpm install`; Metro restarted with `--clear` (new native dep). `eas build --platform ios --profile development-testflight` from a clean worktree at `da098f0f` → `7f7a0e7f-9659-453e-ade5-c7c235d3ebae`, FINISHED, 1.0.0 (9), includes `@react-native-google-signin/google-signin`. `eas submit --id 7f7a0e7f… --profile production` with the ASC key added to `eas.json` locally (reverted after, tree clean) → submission `f3d22300…` failed: "A required Apple agreement is missing or has expired".
**Next steps**: Owner accepts the agreement at appstoreconnect.apple.com/business (and the Program License Agreement at developer.apple.com/account if prompted) — it may also gate the 1.0.0 (8) review/release. Then re-run the same submit; build 9 goes to the `Internal` TestFlight group. Build 9 is a DEV CLIENT: never attach it to an App Store version.

## 2026-11-14 20:50 UTC — phase314: Sign in with Google, web and iOS

**Objective**: Owner set up Google OAuth (Supabase `/auth/v1/settings` now shows `google: true`) and sent the two client ids: web `188846054900-8a8r…` and iOS `188846054900-8t6q…`.
**Actions**:
- iOS: `@react-native-google-signin/google-signin` **16.2.0** (`pnpm --filter @percho/mobile add` from the root; 17.0.0 was a two-week-old major, passed over). `app.json` plugin with `iosUrlScheme` = reversed iOS client id (introspected into Info.plist). `signInWithGoogle` in `lib/auth.ts`: `GoogleSignin.configure({ iosClientId, webClientId })` → `signIn()` → `signInWithIdToken({ provider: 'google' })`; `signOut` also signs out of Google so the picker shows next time. `auth.tsx` draws a white outlined "Sign in / up with Google" button (G mark rendered to `assets/google-g{,@2x,@3x}.png` — no SVG lib in the app) under Apple. Native module → dev client / store build only, not Expo Go.
- Web: `app/(auth)/_components/GoogleButton.tsx` (`signInWithOAuth`, redirect `/auth/callback?redirect=…`) above the login and signup cards. `/auth/callback` now also serves OAuth and sends a non-agent arriving with the default `/dashboard` redirect to `BUYER_HOME`.
**Verification**: web vitest 1248, tsc 0, biome 0 errors, `next build`; local `next start` → clicking the button lands on `accounts.google.com` with the web client id and `redirect_uri=https://tavmbcghxjeyaoptndvn.supabase.co/auth/v1/callback`. Mobile tsc 0, vitest 821, biome 0 errors; expo-doctor's only failure is the pre-existing "7 packages out of date" (expo 57.0.31 → 57.0.33).
**Decisions**: Google sign-ups land as buyers (`handle_new_user` default); agents still sign up with email + password to pick the role. Client ids are committed — they are public identifiers; the secret lives only in Supabase.
**Not verified**: a full Google round trip (needs a person at Google's screen) and whether Supabase's redirect allowlist holds `https://www.percho.co/**` — if not, web Google sign-in lands on the Site URL instead of the page that asked. Owner checks both.

## 2026-11-14 20:10 UTC — phase313: near places first; three pipeline bugs; web plays the film; area saves need an account; Expo Go

**Objective**: Owner: "距离上限7mi 没有问题 - 但是距离近的要有优先级 / 本地的expo go打不开了 - 修 / Google 登录 … 给详细步骤 / Web 社区页不播放影片 - 修 / iOS 保存区域（县）仍然不用登录 - 改 / 9 月遗留的三个流水线 bug - 修".
**Actions**:
- **Expo Go**: the phone's Expo Go is `Exponent/58.0.5` (ngrok request log) and the project is SDK 57 — Expo Go only opens its own SDK, so no Metro fix can open it. Metro (up since 2026-10-04, before the phase308 dependency bumps) restarted from the reference worktree with `--clear`; manifest `exposdk:57.0.0`, iOS bundle 200 / 11.4 MB / 1983 modules. No iPhone is registered on team `5C84L6M8HT`, so an ad-hoc dev client cannot install; `eas.json` gains `development-testflight` (`developmentClient: true`, `distribution: "store"`), `app.json` buildNumber 9 (`7f8ff21e`). **The `eas build` was refused by the auto-mode classifier** — the owner runs it (or allows it), then submits to TestFlight per `docs/ios-release.md`.
- **Area saves** (`cfbd69dd`): `state/saved.ts` gates every kind when signed out; Saved shows only the sign-in prompt when signed out, so area compare needs an account too. Areas stay device-local (no table).
- **Pipeline** (`2721da52`, `3e0fe1f9`): `failedShotKeys` requeues failed clips on each shot's own engine (was `forceEngine ?? 'seedance'`); `scripts/render-worker/storage_retry.py` backs Storage GET/POST/PUT off through 429/5xx and connection errors (1-2-4-8-16 s); page ingest dedupes content hashes across every POI of the community and `filenameWidth` collapses CMS widths baked into filenames (`_920` / `_1920`, known widths only, camera names exempt).
- **Near first** (`3e0fe1f9`): `preferNearPois` runs on every plan before the budget — a place beyond 4 mi (`NEAR_TIER_M`) stays only if its bucket has nothing within 4 mi; hand-approved POIs exempt; unknown distance counts as near. The 7-mile `MAX_DISTANCE_M` is unchanged; film ORDER (time-of-day acts) is unchanged.
- **Web film** (`824c439a`): `/c/[slug]` plays the film the app plays (`fetchVerticalVideos` with the uncached client, AI-tour fallback) via `attachHls`, with the Google Maps photo-credit line (the web was missing it — phase308.11 finding); the "No videos" box is hidden for a filmed community without uploads.
**Verification**: web typecheck 0, biome 0 errors (180 warnings; one new `useMediaCaption` on the film, same as the other players), vitest web 1237+ new (lib/poi 399); mobile tsc 0, vitest saved 8; worker pytest 134. Local `next start` against production data: `/c/northbrooke-cumming` video `readyState 4`, 76 s, `d9aedd34…` manifest, credit line present, no "No videos" text.
**Decisions**: Near-first is a selection rule, not an ordering rule — the scheduler's day-in-order acts stay. Existing six films are NOT re-planned (no backfill without the owner's word); Northbrooke would lose Ducktown Park, Poole's Mill Park and probably NoFo under the new rule.
**Next steps**: Owner: run the dev-client build; Google OAuth setup (steps in chat); say whether to re-plan Northbrooke as the first film under near-first. Restart the render workers after this merge (worker.py changed).

## 2026-11-14 18:50 UTC — phase312: Northbrooke's film had its place labels burned in — stale render worker; film reads skip Next's fetch cache

**Objective**: Owner: "Northbrooke 视频的左上角和右上角都有位置label fix it，看看还有别的落后的版本问题吗，有几个地理位置都是4mile以外 这是最新编排版本预期的结果吗".
**Findings**:
- Two labels = the app's own place chip (top-left, `CommunityFace`, since phase174 on 2026-09-05) + a white pill burned INTO the Northbrooke film (top-right). phase174 removed the burn-in from `worker.py` and re-assembled the five films of that day; Northbrooke was assembled on 2026-09-23 by `render-worker-2`, whose process predated phase174 — its log shows `label_00.png`… overlays for assembly `e14ef3f1`. The other five films' frames are clean.
- Running workers were started 2026-09-26 01:04 and never restarted since — missing phase306.9's `photo_tagger.py` change (Gemini key as a header). Seedance worker started 2026-10-24, current. Migrations: remote == local through `20261114090000`.
- Distance: `MAX_DISTANCE_M` = 7 mi (owner 2026-08-19, 15-minute drive; 4 mi was the 08-18 rule), with `distanceWeight` decaying to 0.4 at the ceiling. Northbrooke's farthest are Ducktown Park 6.7, Poole's Mill 5.8, NoFo 4.6 — inside the rule; the 09-05 films have the same pattern (Ashley Crossing: H Mart 6.5, Newtown Dog Park 6.3; Aberdeen: Halcyon 4.8, Cherry Street 4.9). No planning code changed after 09-23 (only phase306 refactors), so the cut IS the current planner's output.
- Still open from 09-21/09-23: `generate.ts:322` failed-clip requeue keys on `forceEngine ?? 'seedance'`; worker storage calls have no 429 backoff; ingest dedupes per POI, not per community (Northbrooke needed a one-off dedupe of 53 photos).
**Actions**: Queues empty → `launchctl kickstart -k` all three `com.percho.render-worker*` (now 2026-11-14 10:22 local). `pnpm tour northbrooke-cumming --steps assemble` (stored shots, all clips reused, only narration TTS re-run) → assembly `69b5a53c`, `cf_stream_uid d9aedd3423f83b37e69e60243e3a6937`; frames at 1/8/12/30 s carry no pill. The feed served the new uid at once, but `/api/mobile/community/northbrooke-cumming` kept returning the old `3a330951` on fresh CDN misses — the same Next fetch-cache pin as phase311.2. `fetchVerticalVideos` now takes a client; the feed route and `fetchCommunityDetail` pass `createUncachedServiceClient()`, `lib/communities/list.ts` (inside `unstable_cache`) keeps the default.
**Learnings**: After merging anything under `scripts/render-worker/` or `scripts/ken-burns/`, restart the three render workers — a Python worker keeps the code it booted with, which is how a 09-23 film shipped a 09-05-removed feature.
**Next steps**: Owner decides whether 7 mi stays or tightens before the Atlanta batch; fix the three open pipeline bugs before that batch.

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

