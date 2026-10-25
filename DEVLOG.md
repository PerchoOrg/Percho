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

- [`docs/devlog/2026-09.md`](docs/devlog/2026-09.md) — 217 entries
- [`docs/devlog/2026-08.md`](docs/devlog/2026-08.md) — 208 entries
- [`docs/devlog/2026-07.md`](docs/devlog/2026-07.md) — 168 entries
- [`docs/devlog/2026-06.md`](docs/devlog/2026-06.md) — 54 entries

---

## 2026-10-25 01:52 UTC — phase308.2–4: development build, communities-only iOS mode, agents privacy fix

**Objective**: owner — "现在的重点是如何尽快上线ios" (route A: communities
only, listings in a later version); Expo Go on the phone stopped opening the
project ("incompatible version sdk 58 vs sdk 57"); `eas build` approved for
the agent.

**Actions**:
- `9ffbd6d7` phase308.2 — App Store Expo Go only runs the newest SDK (58).
  Added `expo-dev-client` ~57.0.19 for the `development` EAS profile instead
  of a pre-launch SDK upgrade; aligned the six SDK 57 patches expo-doctor
  flagged on main too (expo 57.0.31, expo-router 57.0.29, …) and
  `babel-preset-expo` 57.0.16 so the tree keeps one copy. expo-doctor 21/21
  on the merge result and in the reference worktree.
- `d886d86c` phase308.3 — `apps/mobile/lib/listings-in-app.ts`
  (`LISTINGS_IN_APP = false`). Feed / search / map send `listings=0`; the
  three mobile endpoints then skip the listing READ (`lib/zod/mobile-listings.ts`;
  no flag = old behaviour for builds already on phones). Deck =
  `COMMUNITY_ONLY_MIX` through a new `listings` input to `generateFeed`
  (default unchanged, so the existing deck tests stand); a one-fill mix gets
  no run limit — the ceiling of 3 stopped the deck at card 3. `/listing/[id]`
  and `/compare` redirect to the feed; Saved hides saved homes (kept on the
  account) and the Homes filter; You hides listing entries in Recent and the
  FMLS Technical Entity line; copy fixed where it said "homes".
- `6c32e111` phase308.4 — migration
  `20261025015500_agents_public_read_listing_agents_only.sql`: "public reads
  agent profile" (`using (true)`) → "public reads listing agents" via
  SECURITY DEFINER `agent_is_public(id)` (active listing or created a
  community; inline would recurse through listings' policy). `echo | pnpm
  db:push` from the reference worktree: "Applying migration
  20261025015500_agents_public_read_listing_agents_only.sql... Finished
  supabase db push."

**Verification (live)**:
- Vercel picked up `d886d86c` at 01:48:49 UTC. `/api/mobile/feed?…&videosOnly=1`:
  6 listings + dimPhotos/roomPhotos without the flag; **0 listings, no door
  photos** with `listings=0`; 5 communities either way, all with a film.
  `/search?q=mountain` 1 → 0 listings, `/map` (metro box) 2 → 0.
- Anon key (the one in `app.json`): readable `agents` rows 3 → 1 (count
  only, `Prefer: count=exact`). `/browse`, `/communities`, `/search`, the
  visible agent's `/a/` → 200; unknown slug → 404; mobile feed unchanged.
- Gates on each push: typecheck 0, lint 0 errors, mobile 820 / web 1224
  tests, `expo export`, `next build`.

**Decisions**:
- Kept the owner's 2026-08-21 rule "on ios, only show cards with videos"
  (`videosOnly: true`). I had told the owner photo-only communities would
  join the deck; reverted that before writing it, because the rule is the
  owner's. Consequence: **v1.0's deck is 5 films on a loop** — the owner's call
  whether to relax it (one line in `hooks/use-feed-pool.ts`).
- No trade-off cards in the communities-only deck: house questions, listing
  photos.
- Agents fix is row-level only. Column grants for anon were rejected: other
  tables' policies read `agents.user_id` / `is_admin` as the caller.

**Issues**:
- `pnpm add` run inside `apps/mobile` picked up its `node-linker=hoisted`
  and flattened the WORKSPACE root (the July `26d3f8b4` failure mode);
  caught by expo-doctor's duplicate check, fixed by a clean root install.
  Always install from the repo root.
- The agent could not write the `eas` allow rule (auto-mode classifier:
  self-modification) — the owner adds it via `/permissions`.

**Next steps**:
- Owner: `/permissions` allow `Bash(npx eas-cli build:*)` /
  `Bash(npx eas-cli submit:*)`; register the iPhone (`npx eas-cli
  device:create`) and turn on Developer Mode; then the development build.
- Store copy in `docs/ios-release.md` still sells homes and "real photos".
- MacLeod credit; Google Places author credit on community films.
- iOS sign-ins create `agents` rows (no role sent) — an auth-flow change,
  owner's call (CLAUDE.md §8).

## 2026-10-25 00:40 UTC — phase308: FMLS contract read; iOS ships first without listings (route A); phase306 merged

**Objective**: owner — FMLS sent a $5,000 invoice; plan iOS first, pay FMLS
after, market after go-live, and get the most out of the licence year. Then:
"现在的重点是如何尽快上线ios".

**The signed contract** (FMLS Licensed Content Third Party Vendor agreement,
signed by both sides 2026-10-22; the PDF is attached to the Remine "summary of
your activity" email — not committed, it carries personal contact details):
- Effective Date **2026-10-12**; §12 one-year Initial Term, auto-renews yearly
  unless either side gives notice ≥60 days before term end (2027-08-13).
- **Appendix B: the $5,000 is due "at the time access to 'live' listing
  content is provided to and displayed by Vendor"**, first month prorated —
  not at signing. FMLS's Square invoice #20230 says "due 2026-10-22", which
  contradicts it. The 10-06 email ("paid once the contract is signed") is
  superseded by the contract (§23 complete agreement).
- Appendix A Authorized Purpose: "A lifestyle exploring app with housing
  information. Uses media to generate an animation video with zooming and
  panning effects." **Vendor System: https://www.percho.co/ only** — the iOS
  app needs a signed amendment (§1.7, §3.8, §23) before it shows FMLS data.
- §3.7 is the AI ban the emails called 4.11 (material breach). §3.1(vii): no
  Licensed Content in advertising without FMLS's written consent — marketing
  uses community films, not FMLS listings. §3.1(iii): no processing with
  other-source data "except as expressly authorized" (grey for a lifestyle
  app; owner's call). §3.5(d): FMLS may cut access if Licensed Data appears
  next to IP-infringing content. §3.6 written infosec program + 48 h breach
  notice. §24 WCAG 2.1 AA. §13.4 destroy Licensed Content and derivatives
  within 10 days of termination.
- Reply drafted in Gmail (not sent): pay at live access with 12 months from
  then, add the iOS app to Appendix A, keep test data alive until then.

**Decisions**:
- iOS v1.0 ships with communities only; FMLS listings come in a later app
  version (v1.1, through review — not a server switch, Guideline 2.3.1).
- Owner chose **route A**: ship the community layer as it is. Route B (a
  small launch set filmed by us) was offered because the contentful
  communities are the Nextdoor-scraped 8,678 and the films are built from
  Google Places / builder photos (`docs/references/content-provenance.md`).
  Owner: the Google photos were bought through the API and may be used.
  Recorded against that: Google's Places policies say "You must not
  pre-fetch, cache, or store Places API content" (only `place_id` is exempt)
  and "You must always credit the author when displaying photos". Route A
  stands; author credit for Places photos is added as the cheap half.

**Actions**:
- Merged `origin/phase306/audit-and-refactor` (2026-10-05) → `f5f9ce0f` on
  main. Conflicts: DEVLOG/RELEASE kept both sides newest-first; browse-cards
  selects carry both `ai_style` (306.5) and `mls_number` (307.1); search page
  `searchCommunityListCards` + `linkForCard`; carousel keeps
  `fmlsNumberLabel`, drops the unused `hls.js` import; devlog-order test keeps
  the index-driven archive read. Gates on the merge result: typecheck 0, lint
  0 errors, mobile 813 / web 1217 tests, `next build` compiles, every select
  column in the 121 touched files exists in `database.types.ts`.
- `echo | pnpm db:push --include-all` from the reference worktree: "Applying
  migration 20261005000000_tighten_admin_flag_and_anon_writes.sql... Finished
  supabase db push." (`--include-all` because it predates the applied
  20261018 migration.)
- Reference worktree fast-forwarded to `f5f9ce0f` + `pnpm install`.
- `com.percho.seedance-worker` restarted (`launchctl kickstart -k`) — it was
  the Aug 30 process; idle (0 jobs) before and after.

**Issues**: the first `next build` on the merge result died inside webpack
("Cannot read properties of null (reading '1')"); the second run on the same
tree compiled clean. Not reproduced, not investigated further.

**Next steps**:
- Mobile community-only mode (listing surfaces hidden, mobile API returns no
  listings), store-copy fix, MacLeod credit, Google author credit.
- `agents` is publicly readable — every app user's email — a privacy
  blocker for the store; needs an RLS change.
- Owner: build 6 / TestFlight (or allow `eas build` for the agent), App Store
  Connect forms, rotate the Supabase service-role key, D-U-N-S in parallel;
  check `select email from agents where is_admin` for use of the closed
  self-grant (phase306 next step).

## 2026-10-19 04:07 UTC — phase307: owner leaves the Gemini-tagged FMLS rows as they are (demo stage)

**Decision**: owner, on the licence §4.11 / §4.4 finding in the entry below —
「AI的问题暂时不用改动 还在demo阶段」. The six `fmls_bridge` sandbox listings
keep their `ai_tags` / `ai_style` and their films; the tour pipeline is not
changed.

**Implication**: this is a deferral, not a ruling that the use is allowed.
Revisit before the licence is signed or real FMLS listings are imported. A
real-feed import must not run the tagger without the owner deciding again.
The FMLS reply should not repeat the 10-08 "no AI tools" line as a statement
of current fact.

## 2026-10-18 23:40 UTC — phase307: FMLS IDX disclosures on web and mobile; listings carry the FMLS number

**Objective**: FMLS Data Services (licence thread, 2026-10-12) listed the IDX
rules Percho must show before the licence is approved — 13.7.b the FMLS
listing number with each listing, the 13.7(d)/(e) disclosures, 13.8 the
Technical Entity. On 10-15 they refused "we'll add them at launch": "In order
to be approved, we must see this implemented." Owner picked (e), "only FMLS
IDX content", approved the backfill of the six sandbox rows, "开始做吧".

**Actions**:
- `20261018120000_listings_mls_number.sql`: `listings.mls_number text` plus a
  backfill of the six phase304 Bridge rows by id — five ListingIds from their
  slugs, Fairmount (slug predates the number) = 5893300 from the phase304
  import log. `database.types.ts` hand-edited (`db:types` is stale-local).
  `import-bridge-listings.ts` now writes `mls_number = ListingId`.
- `packages/shared/src/fmls.ts`: FMLS's (e) text verbatim, split around
  "click here"; DMCA URL; Technical Entity statement; `fmlsNumberLabel`.
  Pinned word-for-word by `apps/web/lib/mls/fmls-display-rules.test.ts`.
- Web: `app/_components/FmlsDisclosure.tsx` (results | detail).
  `ListingGrid` — /browse, /nearby, /saved, /search, community listings tab —
  prints "FMLS #…" as a fourth caption line (`GridCardCaption` `sub3`) and puts
  the results disclosure under the grid when any card has a number.
  `CaptionCard` (swipe feed, every `/v/*` page): number on the overlay and in
  More, detail disclosure closing More. Community feed sheet + carousel: number,
  results disclosure in the sheet. `SiteFooter`: Technical Entity line.
- Mobile API: `mlsNumber` on `PoolListingDTO`, `SearchListingDTO`,
  `ListingSummaryDTO`. `ListingDetailDTO.mlsNumber` now comes from
  `listings.mls_number` — it was `mls_listings.listing_key`, Bridge's record
  hash, never the number — plus new `listAgentName` / `listOfficeName`.
- Mobile: number on the feed card face, Saved shelf cards, Search rows,
  Compare headers; Saved / Search / Compare end with the results disclosure;
  the listing screen shows the number and "Listed by agent · office" under the
  address and closes with the detail disclosure; You tab footer carries the
  Technical Entity line. New `components/FmlsDisclosure.tsx`.
- DEVLOG rotated: September's 217 entries → `docs/devlog/2026-09.md`.

**Issues found on the way (fixed)**:
- `feed-load.ts` `buildListingCards` video branch dropped `source`,
  `sourceId`, `office` and `isExternal`. Every Bridge listing has a film, so
  the head card of every `/v/fmls/<key>` page rendered "Listed by Mark
  Stewart ›" as a link to `/a/` (empty slug) with no brokerage. The live HTML
  showed `isExternal:true` on the five tail cards only.
- `/search` sent FMLS hits (no agent slug) to `/browse`; now `linkForCard` →
  `/v/fmls/<key>`.
- `lib/docs/devlog-order.test.ts` read DEVLOG.md alone, so this rotation left
  it one entry and "has entries to check" failed on the merge result. It now
  reads DEVLOG.md plus every archive the index lists, newest first, so the
  month boundary is checked too.

**Decisions**:
- The swipe feed is one listing per screen, so it is treated as a detail view:
  number on the card face, the full detail disclosure in More — not the
  ~250-character results text laid over every card. An interpretation; say so
  in the FMLS reply and change it if they disagree.
- DMCA link: FMLS's email says "false.com/dmca", a broken placeholder;
  https://www.fmls.com/dmca is the live policy page. Ask FMLS to confirm.
- Technical Entity = "Percho, Inc." + hello@percho.co; no mailing address,
  because the contact page publishes none.
- Everything gates on `mlsNumber` being present — only FMLS rows have one.
- Mobile facts row "MLS · FMLS n" kept; until now it never rendered for these
  rows because the mirror is empty for them.
- Release order: the migration merges and is pushed BEFORE the code, because
  `browse-cards.ts` selects `mls_number` and a missing column 500s the feed.

**Not covered (owner call)**:
- Mobile trade-off "door" cards show FMLS listing photos as style imagery with
  no listing identity; the You-tab recent strip shows FMLS homes without the
  number. Whether photos may be used outside their listing at all is a licence
  question, not a label.
- Web fullscreen video mode hides `CaptionCard` (pre-existing), so nothing is
  shown there; OG/Twitter descriptions unchanged.
- `origin/phase306/audit-and-refactor` (12 commits, 2026-10-05, unmerged)
  writes October DEVLOG entries and will conflict with this rotation.

**Verification (branch)**: typecheck 0; lint 0 errors (mobile 8 / web 181
warnings, none new); web 1209 / mobile 809 tests (on the merge result); `next build` compiles and
type-checks (prerender of `/communities` logs "supabaseUrl is required" — no
`.env.local` in this worktree).

**Release**: `4c7a2e3f` (phase307.1, migration only) on main →
`echo | pnpm db:push` from the reference worktree: "Applying migration
20261018120000_listings_mls_number.sql... Finished supabase db push." Then
`2dc582e2` (phase307.2–4) on main; gates re-run on that merge result; reference
worktree fast-forwarded + `pnpm install`, so Metro serves the mobile changes.

**Verification (live, Vercel ~100 s after push)**:
- `/api/mobile/feed?stage=4`: all six listings carry `mlsNumber` — 6755168,
  5303661, 7049147, 6826677, 7404568, 5893300 (Fairmount), each matching its
  slug. `/api/mobile/listing/90871e1e…`: `mlsNumber` 5893300, `listAgentName`
  Mark Stewart, `listOfficeName` FIRST MULTIPLE LISTING SERVICE.
  `/api/mobile/search?q=cookaburra` → 5303661.
- Headless Chrome, 390×844: `/browse` 6 × "FMLS #…", one results disclosure +
  Technical Entity line below the grid (clear of the tab bar at full scroll),
  "click here" → https://www.fmls.com/dmca. `/v/fmls/d9e2c4cd…`: "FMLS
  #5893300" on the overlay; More shows "Listed by Mark Stewart · FIRST
  MULTIPLE LISTING SERVICE" as plain text (0 links to `/a/`) and closes with
  the detail disclosure. `/search?q=lost mountain`: the hit links to
  `/v/fmls/d9e2c4cd…`, number + disclosure present. `/about` footer carries
  the Technical Entity line.
- Mobile not device-checked here — owner's phone (Metro / next build).

**Finding — licence §4.11 / §4.4 (owner call, nothing changed)**: the
phase304 home-tour run put the FMLS sandbox photos through the `tag` step,
which is `scripts/render-worker/photo_tagger.py` — Gemini 2.5 Flash vision.
So FMLS photos went to a third-party AI model, and `listing_photos.ai_tags` /
`listings.ai_style` on those rows are AI output from Licensed Data. The 10-08
reply to FMLS said Licensed Data "will not be shared with any third party or
used with any AI tools". Before the FMLS reply goes out: decide whether to
purge those columns for `fmls_bridge` rows, make the tour pipeline skip the
tagger (and any AI planning) for FMLS listings, and re-cut the six films.

**Next steps**: settle the §4.11 finding first, then the FMLS reply — answer
(e), the URLs to check, the swipe-feed interpretation, the DMCA link, the two
blank contract fields (Authorized Purpose, Vendor System), and the 401 on the
`fmls` test dataset.

## 2026-10-05 15:16 UTC — phase306: repo-wide audit and refactor — an admin self-grant closed, eleven live bugs, 170 `any` casts gone

**Objective**: owner — "Go through the Percho code base and do an audit and
refactoring", then "You have permission to fix and refactored".

**Actions**: five read-only audit agents (API/security, web lib, web app,
mobile + shared, scripts), every finding re-read before acting; knip for dead
code. Ten commits, `a1255e72`…`7052f6a4`:
- 306.1 — September rotated out of `DEVLOG.md` (572 KB, 217 entries) into
  `docs/devlog/2026-09.md`, byte-identical. `devlog-order.test.ts` now reads
  the archives too; it failed on the rotation itself.
- 306.2 — security. Migration `20261005000000_tighten_admin_flag_and_anon_writes`
  (only removes capability): a trigger stops anon/authenticated changing
  `agents.is_admin`; communities DELETE/UPDATE scoped `to authenticated`; the
  anon `leads` INSERT policy dropped. Code: POI server actions no longer
  forward a client `actor` or Places options; waitlist page requires admin;
  `admin-nearby-photos` is not a server action; `safeRedirectPath`; CSV
  formula guard on the leads export.
- 306.3 — seedance worker off `dotenv`, never re-submits a paid clip; bgm
  sync fails closed; two maintenance scripts' `.env.local` path.
- 306.4 — deleted what the monorepo merge resurrected: five AI routes,
  `lib/ai/gemini.ts`, `social-cache.ts`, `lib/log.ts`; plus the broken
  `generate-nearby` route + `scripts/pipelines/`, phase212 scratch files.
- 306.5 / 306.6 — eleven live bugs (below); `createClient()` returns
  `TypedClient`, 170 `noExplicitAny` suppressions removed (205 → 35, the rest
  are dynamic table names and test fakes).
- 306.7 — `attachHls` (4 copies), uncached clients (6), haversine (3).
- 306.8 — mobile: event-queue hot loop, identity-based drain, poison chunks,
  set-password timer.
- 306.9 / 306.10 — `relink-listings` paging, Gemini key as a header;
  ARCHITECTURE.md rows for five undocumented lib folders and the scripts
  drift; `.env.example` drops `ANTHROPIC_*`.

**Findings — security** (verified against the migrations, not production):
1. **Any signup could make itself admin.** "agent updates own profile" has
   no column list, `is_admin` was added later unguarded, and every signup —
   every app user — gets an `agents` row. One PostgREST PATCH with the anon
   key, and `requireAdmin()` reads the column back.
2. **Anonymous DELETE of unclaimed communities** — the `created_by is null`
   branch had no `to` clause; cascades take videos, tours, leads.
3. `fetchPhotosForCommunityPoi` accepted `{ actor: 'service' }` from the
   browser and ran on the service role with no session.
4. `/dashboard/agents/waitlist` showed every waitlist name/email/phone/licence
   to any signed-in user; `?redirect=/\evil.com` passed the login guard.

**Findings — live bugs the `as any` casts hid**:
- `community_photos.poi_id` / `community_videos.poi_id` were dropped on
  2026-07-14 and still named in five places: community photo upload and
  list, **community video upload** (`/api/video/create-upload` — failed after
  reserving the Cloudflare slot), `/api/video/list?community_id`, and the
  browse/listing-page community-video reads (Nearby pool always empty).
- Dashboard fallback covers ordered by a column `ord` that never existed.
- 23,773 active communities behind one 1000-row read: `/communities`,
  `/search` and `/api/communities/nearby` saw only the front of the
  alphabet. Relevant ones are now fetched explicitly; search runs `ilike`.
- Stub communities named "Untitled neighborhood" since phase66; every gate
  checked "Untitled community".
- The listing editor's publish flusher was registered once at mount and
  saved the mount-time form over the agent's edits.
- `startAsyncTransition` dropped the promise; the bundled React canary has
  `enableAsyncActions = true`, so `isPending` now covers the work.
- `cleanup/refs.ts` read six tables unpaged — a short read would have
  offered live videos for deletion.
- Seedance: a crash after the paid submit put the row back to `pending`.

**Decisions**:
- Typed the ssr client with ONE assertion in `server.ts` rather than
  bumping `@supabase/ssr` 0.5.2 → 0.12.7: no runtime change on the auth path.
  This was decision 4 of phase252, deferred in phase184; the owner's
  "permission to fix" this round is what it was waiting on.
- A select naming a missing column does not fail `tsc` (it types as
  `SelectQueryError`), so every select string in apps/ and scripts/ was
  checked against `database.types.ts` by script: none left.
- Seedance stale rows FAIL with "check OpenRouter before regenerating"
  rather than retrying — the never-auto-regenerate rule.
- Not done, owner's call: ZIP on mobile cards (the server never sent it; the
  card would read "· 30144"); hiding agents' own untitled stubs on the
  dashboard; scope sheet / area cards (unreachable since 09-09).

**Issues**: the harness classifier refused the first deletion batch, then
`git status`, reads and formatting until the owner granted permission.

**Verification**: typecheck 0; lint 0 errors (web 179 warnings, was 181;
mobile 5, was 8); web 1206 + mobile 812 tests (+12 new); render-worker
pytest 129.

**Next steps**:
- **Owner: merge, then `pnpm db:push`** — the admin self-grant stays open
  until the migration is applied. Then `select email from agents where
  is_admin` in production to see whether anyone used it.
- Restart `com.percho.seedance-worker` after merge — it is the Aug 30 process
  and still has the removed `dotenv` loaded in memory.
- Still open: `agents` is publicly readable (every app user's email);
  community_pois / generated_videos writes open to any signed-in user;
  `notify-lead` never emails for community leads; `/api/leads` unrate-limited;
  render-worker `generate.py` has no subprocess timeout; CI runs neither
  `scripts/` typecheck nor the Python tests; ~100 hand-written row types.
