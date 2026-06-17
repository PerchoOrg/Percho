# UX_AUDIT_34a — Foundation

**Branch**: `phase34a/foundation`
**Plan**: see `PHASE34_PLAN.md` for the 3-phase split rationale.
**Audience**: All-US English buyers. No `_zh`, no WeChat, no 小红书. (CLAUDE.md §1)
**Don't push to main.** Push to `phase34a/foundation`. Hermes ff after review.

---

## Goal

Ship the invisible plumbing + global hygiene that 34b/34c depend on. Nothing flashy — user should perceive "things feel right", not "new feature".

---

## Locked tasks (P0 — must ship)

### T1 · Listing → Community auto-attribution by geo

**Why**: 34b's community chip on a listing video needs `listing.community_id` populated. Today most listings don't have it (or only have it if the agent set it manually). Without this, A1 chip can't render.

**What**:
1. **Schema check**: confirm `listings.community_id` column exists. If not, add it (`alter table listings add column community_id uuid references communities(id)`). Index it.
2. **Geo source of truth**: communities have geo polygons (or center + radius — discover which). Listings have `lat`/`lng` (see `0011_listing_photos_and_geo.sql`).
3. **Backfill migration**: write a SQL migration that, for every listing where `community_id is null` and `lat/lng is not null`, assigns the community whose geo contains the listing's point. If multiple match, pick smallest area. If none match, leave null (do not invent).
4. **Insert/update trigger**: when a listing is inserted or its lat/lng changes, re-run the same attribution logic (`before insert or update of lat, lng on listings`).
5. **Reporting query**: include in the migration a `select count(*) filter (where community_id is null) as orphans, count(*) as total from listings where status = 'active'` so we can see the orphan rate after backfill.

**Stop and ask if**:
- Communities don't have geo polygons (they may only have center+radius — adapt accordingly, or surface that we need polygons before this works)
- More than 30% of active listings end up as orphans (something's wrong with the geo)

**Files**: new `supabase/migrations/00XX_listing_community_attribution.sql`. Existing trigger functions in earlier migrations are precedent — match style.

**Acceptance**: After migration runs locally, `select count(*) filter (where community_id is null) from listings where status='active' and lat is not null` is < 5% of total. Trigger fires on a manual `update listings set lat = lat + 0.0001 where id = '<test>'` and re-attributes.

---

### T2 · Default sound on, remove top mute toggle

**Why**: TikTok mental model — autoplay with sound, tap-to-mute per video. Current player has a top-bar mute that defaults to muted (anti-pattern for a video-first app).

**What**:
1. Find every `<video>` player wrapper. Known files: `app/(public)/c/[slug]/feed/CommunityVideoFeed.tsx`, `app/(public)/browse/_components/BrowseFeed.tsx`. There may be more — grep for `muted`.
2. Default `muted = false`. (Browser autoplay policy: `muted` is required for autoplay on first load. Workaround: start muted, unmute on first user interaction OR after explicit "tap to enable sound" tooltip. Pick the less janky path — **stop and ask if uncertain**.)
3. Remove the top-bar mute toggle button. Mute is per-video, controlled by tapping the video itself.
4. On tap-to-mute: show a brief overlay icon (🔇 / 🔊) that fades in 600ms, fades out 600ms.
5. Persist mute preference per session in `sessionStorage` (not localStorage — fresh state next visit).

**Stop and ask if**:
- Browser autoplay policy blocks unmuted autoplay even after first interaction (might need a one-time "tap to start" gate)

**Files**: video player components (find all). Remove the mute button from top-bar UI; add tap handler on video element.

**Acceptance**: open any video feed in Chrome mobile emulator → first video starts (muted is OK if browser forces it) → tap video once → unmuted; tap again → muted; reload → starts fresh per autoplay rules.

---

### T3 · Nav: cut tabs, dedupe Public Profile

**Why**: Linear-minimal IA. Current tabs likely include redundancy (Profile vs Public Profile vs Me, etc).

**What**:
1. **Audit step (write before changing)**: list every nav surface in the app — bottom tab bar, top header items, dashboard sidebar, profile dropdown. Output as a markdown table in the PR description: `Surface | Item | Route | Purpose | Duplicate of?`.
2. **Decide minimal set**: bottom-bar tabs target = 4 (For You / Browse-or-Search / Saved / Me). Anything beyond gets folded under Me or removed.
3. **Public Profile dedup**: if there's both `/profile/[id]` and `/u/[username]` and `/me` — pick one canonical public route, redirect the others.
4. **Implement**: remove the redundant tabs/items, add 301-style redirects for old paths (Next.js `redirect()` in route handler or `next.config.js` redirects).

**Stop and ask if**:
- Audit reveals more than 2 routes that look like "public profile" (need product call on which is canonical)
- Removing a tab would orphan content that has no other entry point

**Files**: bottom tab bar component (find it), affected page files.

**Acceptance**: bottom bar has ≤4 tabs; only one route serves "public profile"; old routes 301 to canonical.

---

### T4 · Site-wide font / touch-target audit

**Why**: Hygiene. WCAG-recommended touch target = 44×44px; many of our buttons may be smaller.

**What**:
1. **Audit step**: grep for `<button`, `Tailwind h-` and `w-` classes < `h-11`/`w-11` (44px = 11×4 in default Tailwind). List every button/link/interactive element below threshold.
2. **Fix**: bump to min 44×44 by adding padding, not by enlarging visible chrome. Use `min-h-[44px] min-w-[44px]` on tap targets where the visible element is smaller.
3. **Font scale**: confirm body text ≥ 14px, headings ≥ 18px. Anything 12px or smaller → either bump or justify in PR description.

**Stop and ask if**:
- A design intentionally uses small text (timestamps, captions) — pick a global "caption" size and apply consistently rather than ad-hoc

**Files**: Tailwind classes across components — touch broadly but make changes minimal (just size bumps, no restructure).

**Acceptance**: `grep -r 'h-[0-9]' --include='*.tsx'` shows no tap targets below `h-11` without an explicit `min-h-[44px]` override. Visual smoke test: every button feels comfortably tappable on iPhone 12 mini (smallest common screen).

---

## Cross-cutting

- **CSV4 telemetry**: out of scope for 34a. Will add in 34b.
- **No new buyer-visible features.** If you're tempted to add UI flair — STOP, this is plumbing.
- **DEVLOG.md entry per task**: T1, T2, T3, T4 each get an entry at the top of DEVLOG.md.
- **RELEASE.md**: only T2 (sound default) and T3 (nav simplification) are user-visible; combine into one release note. T1/T4 are invisible — skip RELEASE.md.

---

## Acceptance for the whole phase

PR ready to ff to main when ALL true:

1. `tsc --noEmit` clean
2. `pnpm build` (or repo's build cmd) green
3. Migration runs cleanly on a fresh DB *and* on a copy of prod (test against `~/Vicinity/.env.local` Supabase staging if available)
4. Listing orphan rate (active listings with null `community_id` and non-null lat/lng) < 5%
5. Video plays with sound on first tap; mute is per-video, not global
6. Nav has ≤4 bottom tabs, single canonical public-profile route
7. No tap target < 44×44 without an explicit override
8. No regressions on `/`, `/browse/`, `/c/[slug]/feed`, `/dashboard` (smoke test all)
9. DEVLOG.md updated (newest at top), RELEASE.md updated for T2+T3

---

## When to stop and ask

- Communities lack geo polygons → T1 partially blocked, surface and discuss
- Browser autoplay-with-sound policy forces a "tap to start" gate → T2 needs UX call
- Audit (T3) reveals >2 public-profile routes or orphan tabs → product call needed

---

## Don'ts (CLAUDE.md §2.1)

- ❌ Don't push to main. Push to `phase34a/foundation`.
- ❌ Don't claim done with red tsc/build.
- ❌ Don't refactor unrelated code. Surgical only.
- ❌ Don't add buyer-visible features that aren't on this list (those are 34b).
- ❌ Don't add Chinese / WeChat / 小红书 references.

---

_Spec author: Hermes. Implementer: Claude Code. Reviewer: Hermes. Approver: Tianrou._
