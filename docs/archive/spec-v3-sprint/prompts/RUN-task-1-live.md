You are working in the Percho repo (`~/Percho`). Read these files IN FULL, in order, before doing anything:

1. `CLAUDE.md` — all rules. Especially: no false completion claims (quote real SHAs), DEVLOG.md is reverse-chronological (newest at TOP), one branch per phase, never a personal Anthropic key / opus-5 only.
2. `DEVLOG.md` — top 3 entries.
3. `docs/design/spec-v3/prompts/_MASTER.md` — the 8 non-negotiable hard rules + delivery protocol.
4. `docs/design/spec-v3/prompts/task-1-feed.md` — your task.
5. `docs/design/spec-v3/00-overview.md` — full text (global contracts).
6. `docs/design/spec-v3/01-feed.md` — full text (this screen's spec).

## Starting state (verified, do not re-derive)

- `origin/main` = `26d3f8b`. Task 0 (foundation) is merged. You are ALREADY on branch `phase-ios1/discovery-feed` — do not create another branch.
- Task-0 verification gate currently GREEN in `apps/mobile`: `pnpm test` 26/26, `pnpm typecheck` 0, `pnpm lint` clean.

Already delivered by Task 0 in `apps/mobile/` — **reuse all of it, do not build a second version of any of it**:

- `theme/tokens.ts` — the ONLY source of colors / radii / spacing. No hex literals anywhere else.
- `theme/typography.ts` — type scale.
- `lib/haptics.ts` — 4 semantic haptics (`pass` is intentionally silent).
- `lib/gesture/decide-swipe.ts` — pure swipe-decision function (+ 19 contract tests: 35% width threshold, 800pt/s velocity, ±30° sector).
- `hooks/use-swipe-card.ts` — pan handler with ±8° follow rotation and threshold haptic.
- `state/sound.ts`, `state/funnel.ts` — sound pref + funnel stage machine (monotonic advance guard, `hydrated` gate, AsyncStorage-persisted, 7 tests).
- `components/` — `CardVideo` (top-card-only playback, 82% once-latch, mute-retry), `SwipeStack` (item-keyed 3-layer slice window 0.94/0.88), `MatchBadge` (stage 4 + score ≥60 only), `BottomSheet` (2 detents), `CardFoot`, `KindChip`, `ExploreButton`, `SoundToggle`, `TabBar` (62 + insets.bottom, exactly-4-tab tuple type).

`apps/mobile/app/(tabs)/feed.tsx` is the **pre-v3 legacy implementation** (25% threshold, hardcoded hex). Task 1 replaces it per spec.

## Data-gap situation (already investigated — this is fact, don't re-query blindly)

Supabase live counts, per-column (service role, verified 2026-07-26). These are measured, not guessed — build against exactly this.

`communities` — 8680 rows, all state=GA (Atlanta metro Nextdoor seed):

- POPULATED: `name`/`slug`/`city`/`state`/`status`/`source` 8680 · `lat`/`lng` 8679 · `boundary` 8679 (+`boundary_source`) · `hero_image_url` 8679 · `description` 8581 · `residents_count` 7170 · `avg_income`/`avg_age`/`homeowners_pct`/`attributes`/`interests`/`nearby` present · `nextdoor_*` present.
- **ENTIRELY NULL (0 of 8680)**: `zip`, `county`, `median_home_value`, `price_min`, `price_max`, `highlights`, `year_built`, `property_types`, `hoa_fee_monthly`, `builder`, `website`, `cover_video_id`.
- 88 distinct cities. Top: Atlanta 468, Marietta 44, Alpharetta 31, Cumming 22, Lawrenceville 22, Woodstock 15, Duluth 14, Acworth 13, Decatur 13, Buford 12.

`listings` — 265 rows:

- POPULATED: address/city/state/description/slug 265 · `zip` 262 · `price` 261 · `cover_url` 259 · `beds`/`baths` 257 · `sqft` 258 · `year_built` 254.
- NEARLY EMPTY: `lat`/`lng` only 13 · `community_id` only 4 · `neighborhood` 2 · `hoa` 10 · `lot_size` 11 · `published_at` 11.
- Cities: Alpharetta 52, Suwanee 51, Sandy Springs 50, Johns Creek 50, Duluth 50, rest ≤3.

Other tables: `community_videos` 4 · `generated_videos` 15 · `k12_schools` 15 · `external_listings` EMPTY · `community_pois` EMPTY.

Consequences you must design around — do NOT design around the optimistic version:

1. **There is no area/city/zip table at all.** Stage 1–2's main card types (area ×5 per 10, zip ×4 per 10) have no data source today.
2. **Zip-level geo units cannot be derived from `communities`** — `communities.zip` is 100% NULL. The only zip signal in the DB is `listings.zip` (262 rows across ~6 cities). So Stage-2 zip cards have essentially no inventory. Say so in the plan and propose the cheapest honest path (e.g. reverse-geocode communities' lat/lng to zip as a separate backfill task, out of task-1 scope).
3. **City-level units CAN be derived** (88 cities × community counts + lat/lng centroid + a real hero_image_url picked from a member community).
4. **No price/median stat is derivable for a city from `communities`** (all price columns NULL). `listings` can give a real median price for exactly the 5 cities with ~50 listings each, and nothing for the other 83.
5. `communities.lat/lng` is 8679/8680 but `listings.lat/lng` is 13/265 — do not plan any listing↔geo spatial join.

Owner's decision (do not re-ask, but DO flag anything you think he got wrong):

> Do not block task-1 on the geo dataset. Build the full engine + all 8 card types + swipe machine + telemetry against a typed geo-unit contract. Geo units themselves are to be DERIVED from real data (aggregate the 8680 communities by city; use `listings` for the 5 cities that have real price stats) — never invented. Editorial atmosphere copy may be LLM-generated from real aggregates later; hero imagery reuses the real `communities.hero_image_url` or the existing Google Places key. NO fabricated median / school / commute numbers anywhere, not even as a placeholder — a missing stat must render as absent, not as a fake number. Any dev-time fixture must live on a gitignored path. Zip-level backfill is a separate task; design the contract so zip units slot in without a rewrite, and let Stage 2 degrade gracefully (document exactly how) until they exist.

## First deliverable: PLAN ONLY

Per `_MASTER.md` delivery protocol step 1, output ONLY an implementation plan. **Do not create, edit, or delete a single file in this step.** The plan must contain:

1. **Component tree** — every new file and its responsibility, showing which task-0 component each card type composes from.
2. **State + data flow** — where `state/funnel.ts` plugs in; how `generateFeed(funnelStage, state, N)` and `evaluateStageAdvance` stay pure; pagination (first page 12, prefetch at 5-from-end, seenIds dedupe); how signals queue offline.
3. **The geo-unit contract** — the exact TypeScript shape you propose for area/city/zip units, and precisely which fields you can populate from the aggregate today vs. which must render as absent.
4. **Server plan** — what `/api/mobile/feed` must change to (it currently projects BrowseCard → thin FeedCard and does NOT inject ask cards).
5. **Test plan** — which pure functions get unit tests, and the specific boundary cases (city right-swipe 2 vs 3, listing hard gate in stage 0–2 except tease, 15-swipe layer fatigue).
6. **Ambiguity list** — every place the spec is underspecified, each with the default you propose. Be exhaustive; this is the step that prevents rework.
7. **Sequencing** — what order you'd land it in, and which items are visually verifiable only on the Mac (mark `PENDING-SIM`, this box is Linux with no iOS simulator).

Then STOP and wait. Do not write code.
