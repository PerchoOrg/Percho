# Vicinity — Implementation Plan

> Read `CLAUDE.md` first. Then this file.
>
> Pick the first unchecked task in the current phase. One task = one PR.
> When a task is done, check the box and add a one-line note. Append a
> session log at the bottom of this file (see "Session log" template).

**Rule of progression**: do not start a phase until the previous phase is
fully checked off. If a task is blocked, write the blocker into the task
line itself and move to the next task in the *same* phase.

---

## Phase 0 — Scaffold (delivered as initial commit; no Claude Code work)

This phase is pre-built. Verify locally and on Vercel before starting Phase 1.

- [ ] Owner: clone repo, `pnpm install`, `pnpm dev` — landing page renders.
- [ ] Owner: copy `.env.example` to `.env.local`, fill all keys.
- [ ] Owner: connect Vercel to GitHub repo, set all env vars in Vercel UI.
- [ ] Owner: `supabase login`, link project: `supabase link --project-ref <ref>`.
- [ ] Owner: `pnpm db:push` — both migrations applied (verify in Supabase Studio).
- [ ] Owner: `pnpm db:types` — regenerate `lib/supabase/database.types.ts`,
      commit the result.
- [ ] Owner: push to `main`, Vercel deploys green, landing page live.

**Definition of done**: deployed URL shows the "Vicinity / Agent Login" landing
page; Supabase Studio shows all 9 tables with RLS enabled.

---

## Phase 1 — Auth + Dashboard skeleton

Goal: Vivian can log in via magic link, lands on an empty dashboard.

- [x] **1.1** `app/(auth)/login/page.tsx` — magic-link form, Supabase
      `signInWithOtp`. Redirect target from `?redirect=` query param.
- [x] **1.2** `app/(auth)/auth/callback/route.ts` — exchange code for session.
- [x] **1.3** Verify the `handle_new_user` trigger creates an `agents` row
      after first login. Add an integration test (or a documented manual
      check) confirming this.
- [x] **1.4** `app/dashboard/layout.tsx` — auth-gated; renders top bar with
      agent name + "Sign out" button.
- [x] **1.5** `app/dashboard/page.tsx` — empty-state listing list ("No
      listings yet · New listing").
- [x] **1.6** `app/api/auth/signout/route.ts` — POST clears session, redirects
      to `/login`. (Shipped in 1.4 alongside the TopBar form; verified Mac-side
      on 2026-06-08.)
- [x] **1.7** Sign-in flow E2E manual test documented in `docs/manual-tests.md`.
      Happy path (8 steps) + 3 negative cases (expired link, unauthenticated
      dashboard access, open-redirect guard) covering the full Phase 1 surface.
      Doc-only; no code change. (2026-06-08)

**Definition of done**: a fresh email signs up via magic link → lands on
empty `/dashboard` → `agents` table has the new row.

---

## Phase 2 — Video upload pipeline

Goal: an agent can upload a video from the dashboard and see it transition
from `processing` → `ready` automatically.

- [x] **2.1** `app/api/video/create-upload/route.ts` — POST, zod-validated,
      auth-gated. Calls `createDirectUpload()` from `lib/cloudflare/stream.ts`.
      Pre-creates the `listing_videos` row. (Phase 2 scope: listings only;
      `scope='community'` is rejected for V2.) (2026-06-09)
- [x] **2.2** `components/dashboard/VideoUploader.tsx` — Client Component.
      tus-js-client, progress bar, retry on disconnect. Standalone test
      harness at `/dashboard/upload-test` with idempotent fake-listing seed
      (slug `__upload_test__`). (2026-06-09)
- [x] **2.3** `app/api/webhooks/cloudflare-stream/route.ts` — POST. Verifies
      HMAC signature using raw body. Updates `status='ready'` on the matching
      row by `cf_video_id`. **Must use service role client** (webhooks have
      no auth.uid()).
- [x] **2.4** Realtime subscription on `listing_videos` in dashboard so
      the UI reflects status flips without refresh.
- [x] **2.5** Hard guard: reject uploads >2 GB and >5 min duration server-side
      *before* hitting Stream API.
- [x] **2.6** Tests: signature verification (good + bad signature, time skew),
      `createDirectUpload` happy path with mocked fetch.

**Definition of done**: uploading a 30-second 1080p mp4 from the dashboard
results in a row that goes processing → ready within ~60s, and the dashboard
UI reflects this without manual refresh.

---

## Phase 3 — Public listing page (video feed)

Goal: a published listing has a public URL with the demo's vertical-feed UX,
all video, with overlay cards for community context.

- [ ] **3.1** `app/(public)/v/[agentSlug]/[listingSlug]/page.tsx` —
      Server Component. Fetches listing + agent + community + listing_videos
      + community_videos + schools + pois.
      ISR `revalidate = 3600`. Returns 404 if listing not published.
- [ ] **3.2** `generateMetadata()` — OG title, description, image (cover or
      first video thumbnail).
- [ ] **3.3** Migrate `VideoFeed` + `Card` + `ActionRail` from the existing
      demo (`vicinity-app`). Convert .jsx → .tsx. Replace mock data with
      props. Replace Pexels URLs with Cloudflare HLS URLs.
- [ ] **3.4** hls.js integration in `Card` for video playback. iOS Safari
      uses native HLS; everywhere else uses hls.js. Max 3 videos mounted.
- [ ] **3.5** Build feed composition logic per ARCHITECTURE.md §5: interleave
      listing_videos + community_videos with structured overlays
      (SCHOOL/POI/NEIGHBORHOOD).
- [ ] **3.6** `LeadModal` component (UI only, wires up in Phase 5).
- [ ] **3.7** Event tracking: emit `page_view` on mount, `card_view` on
      each card visible, `video_complete` on playback end. Buffered batch
      POST to `/api/events` to avoid request storms.
- [ ] **3.8** Tests: feed composition function (unit test for interleave
      ordering and overlay text formatting).

**Definition of done**: a published listing URL plays vertically swipeable
video on iPhone Safari and Android Chrome; OG preview shows in iMessage
and Slack.

---

## Phase 4 — Listing CRUD + community editor

Goal: Vivian creates a complete listing in <30 minutes (PRD's hard UX target).

- [ ] **4.1** `app/dashboard/listings/new/page.tsx` — new listing form.
      Address field uses Google Places Autocomplete (server-side proxy
      route to keep `GOOGLE_PLACES_API_KEY` off the client).
- [ ] **4.2** Geocode address → fill `lat/lng/city/state/zip/neighborhood`.
- [ ] **4.3** `app/dashboard/listings/[id]/edit/page.tsx` — edit all fields,
      reorder videos (dnd-kit), set cover photo.
- [ ] **4.4** `app/dashboard/communities/[id]/page.tsx` — Community editor.
      List + add schools and POIs with **mandatory** `source_url`. UI
      enforces the constraint with a clear "data source URL is required
      for fair-housing compliance" hint.
- [ ] **4.5** Community video upload (kind: school/poi/neighborhood) with
      optional school/poi linkage.
- [ ] **4.6** Publish action: validates required fields (≥1 listing video,
      address, price, beds/baths), sets `status='published'` and
      `published_at=now()`, calls `revalidatePath()` on the public route.
- [ ] **4.7** Soft delete: archive sets `status='archived'`, hides from
      public + dashboard list (toggle to show archived).
- [ ] **4.8** End-to-end timing test: owner walks Vivian's path with a
      stopwatch. Target: 30 minutes for one full listing including 5 home
      videos and 3 community videos. Document the time in
      `docs/manual-tests.md`.

**Definition of done**: a fresh agent can create a published listing in
under 30 minutes including video upload time.

---

## Phase 5 — Lead capture + email notification

Goal: a buyer fills the lead form, agent receives email within 5 seconds,
dashboard shows the lead live.

- [x] **5.1** Wire up `LeadModal` (built in 3.6) to POST `/api/leads`.
- [x] **5.2** `app/api/leads/route.ts` — POST, zod-validated, anon-key insert
      (RLS allows public insert).
- [x] **5.3** `supabase/functions/notify-lead/` Edge Function — fires from
      a Postgres trigger on `leads` insert. Calls Resend, sets `notified_at`.
- [x] **5.4** Resend email template (English only, no WeChat field). Subject:
      `New inquiry · {address}`. CTA → `/dashboard/leads/{id}`.
- [x] **5.5** `app/dashboard/leads/page.tsx` — list view with Realtime
      subscription. New leads appear without refresh.
- [x] **5.6** `app/dashboard/leads/[id]/page.tsx` — detail view with full
      message + buyer contact info + reply-by-email shortcut.
- [x] **5.7** Idempotency: trigger only fires once per lead row;
      Edge Function checks `notified_at IS NULL` before sending.
- [x] **5.8** Tests: zod schema validation; manual test: submit a lead,
      confirm email lands in inbox (not spam) within 5s.

**Definition of done**: a real-world test from a non-vicinity email
delivers to the agent's primary inbox in <5 seconds.

---

## Phase 6 — AI copy + analytics dashboard

- [x] **6.1** `app/api/generate-copy/route.ts` — POST listing fields →
      `generateListingCopy()` → returns 3-paragraph English description.
      Auth-gated. Rate-limit per agent (e.g. 10/min).
- [x] **6.2** Edit form button "Generate description" → fills `description[]`
      with returned paragraphs as editable text.
- [x] **6.3** `app/api/generate-social/route.ts` + UI for Facebook + Instagram
      copy. (Xiaohongshu deliberately omitted — see CLAUDE.md §1.)
- [x] **6.4** `app/dashboard/listings/[id]/analytics/page.tsx` — per-listing
      view: total views, unique sessions, lead conversion %, video
      completion rate. Read from `events` table.
- [x] **6.5** `app/dashboard/page.tsx` rollup: total views/leads across
      agent's published listings.

---

## Phase 7 — Internal beta with Vivian

- [x] **7.1** Owner: add `vicinities.cc` as Vercel domain alias, verify HTTPS.
      (done earlier — prod serves `https://www.vicinities.cc` with apex 308→www;
      verified by `scripts/admin/production-smoke.sh` 2026-06-09)
- [ ] **7.2** Owner: walk Vivian through the dashboard live, take notes on
      every friction point.
- [ ] **7.3** Vivian uploads 3 real listings end-to-end.
- [ ] **7.4** Triage bugs from internal beta — log in this file under a new
      `## Phase 7.5 — Beta fixes` heading, prioritized by Vivian's pain.

---

## Cross-phase: ongoing

- After every PR merge: deploy lands on production via Vercel. Owner
  smoke-tests the public landing page + login + dashboard.
- Weekly: review Anthropic + Cloudflare + Resend usage in their dashboards.
  Flag any 5x cost spike before it's a 50x cost spike.
- Backups: Supabase Pro auto-backups daily. Owner exports manually on
  any phase boundary (between phases).

---

## Session log

Append a session entry every time you stop work. Format:

```
### YYYY-MM-DD (claude-code session)
Shipped:
- 1.1: login page with magic link
- 1.2: auth callback route
Blocked:
- 1.3: integration test framework not yet set up; tracked under task 1.3
Next:
- 1.3 (fix), then 1.4
```

<!-- session log entries below -->

### 2026-06-26 (phase62)
Shipped:
- phase62: CommunityListingCarousel rewrite — vertical FeedShell + Like/Save/Contact rail. Now matches BrowseFeed and CommunityVideoFeed gesture/affordance shape.
Next:
- none queued.

### 2026-06-26 (phase63)
Shipped:
- phase63: L3 listing carousel — added Share button on the right rail (uses `navigator.share` with clipboard fallback; URL is `/v/[agentSlug]/[listingSlug]`); removed the top segmented progress bar (it implied horizontal pagination; the surface is now vertical).
- Plumbed `agentSlug` through `CommunityListingItem` via an `agents.id → slug` lookup in `page.tsx`.
Next:
- Wait on Vercel preview sign-off; consider extracting `useNativeShare(title, url)` if Share appears on a 3rd surface.

### 2026-06-26 (phase64)
Shipped:
- phase64: L3 listing carousel video / photo fallback now use `object-cover md:object-contain` (was `object-contain` on all breakpoints) — fixes letterbox bars on mobile that made the same video look smaller/cropped vs the L0 community video feed.
Next:
- none queued.

---

## Phase 21 — Persistent Save (anonymous device-id, scope C+X) — ✅ done 2026-06-13

**Scope choice 2026-06-13**: C (anonymous device-id with future buyer-login merge path) + X (Save persists, Like stays in-memory animation). Rationale: Vicinity has no buyer auth yet (Phase 22+); a login wall on Save would gate the most-engagement-positive action behind the highest-friction step. device_id gets us "saves persist across reloads on the same browser" today, and the schema (`user_id` nullable) makes the eventual login merge a one-line `update`.

- [x] **21.1** Migration `supabase/migrations/0016_saved_listings.sql` — `saved_listings(device_id, listing_id, user_id null, created_at)` + RLS deny-all + `saved_listing_counts` aggregate view + indexes.
- [x] **21.2** `lib/buyer/device-id.ts` — localStorage UUID v4 with `crypto.randomUUID` + RFC4122 fallback. Validated on read.
- [x] **21.3** `app/_actions/saved-listings.ts` — `saveListing`, `unsaveListing`, `listSavedListingIds`, `listSavedListings`. Service-role client bypasses RLS; zod validates `device_id` shape and `listing_id` UUID; `saveListing` confirms listing is published before insert.
- [x] **21.4** `app/(public)/browse/_components/BrowseFeed.tsx` — `useEffect` mount hydrates saved set; `toggleSave` does optimistic flip + server action + revert on failure.
- [x] **21.5** `/saved` page rewritten — server `page.tsx` shell + client `SavedClient.tsx` reading device_id and fetching via server action `fetchSavedCardsAction` → reuses `/browse` grid layout (Pinterest cards).
- [x] **21.6** `lib/feed/browse-cards.ts` — added `fetchBrowseCardsByIds()` to render saved set with the same card shape as the explore grid.

**Owner action required**:
1. Apply migration: `supabase db push` (or run `0016_saved_listings.sql` in Studio SQL editor).
2. No bucket / no env var changes (uses existing `SUPABASE_SERVICE_ROLE_KEY`).

**Honest caveats baked in to V1** (tell Vivian):
- Saves are **per-browser**: clearing site data, switching browsers, or Incognito = different `device_id` = saves not visible.
- Saves do **not** sync across phone ↔ laptop (no buyer login yet).
- Like is **in-memory only** (intentional — pure double-tap reaction animation, not a list surface).

**Definition of done**: a buyer hits Save in `/browse/feed`, reloads the tab, and the heart is still filled. /saved page lists the same listings in newest-first order. ✅

---

## Phase 20 — Photo listing parity + community photo upload

Goal: photo-only listings get the same buyer-side richness as video listings (Like/Save/Share/Contact + LeadModal + description + full-screen carousel). Community editor gains photo upload as a future-AI-video raw-material library. **Swipe feed (`/browse/feed`) stays video-only — Phase 10 decision preserved.**

### 20.1 — Listing detail photo parity (A1.lite)

**Architecture chosen 2026-06-13: B2 (extend BrowseFeed)** — instead of mirroring BrowseFeed into a separate `<PhotoFeed>` component (B1, original plan), we extended `BrowseFeed` itself to route `mediaKind === 'photo'` cards to a new `PhotoCard` sub-component within the same file. Same Like/Save/Share/Contact action bar + LeadModal flow. Single-source-of-truth for the swipe / cycle / keyboard state. Right rail is hidden for photo cards (no source to switch to, no audio to mute); schools + POIs surface as a plain text strip in the photo caption. Trade: touched the 1015-line BrowseFeed, but the long-term cost of two parallel rails would be higher (Phase 21 persistence would have to dual-update).

- [x] **20.1.1** ~~Extract photo branch into `<PhotoFeed>`~~ → **B2**: added `PhotoCard` inside `BrowseFeed.tsx`; detail page builds a photo `BrowseCard` and feeds existing `<VideoFeed>` (which is itself a thin pass-through to `BrowseFeed`).
- [x] **20.1.2** Full-screen photo carousel (horizontal swipe + ‹/› desktop arrows + `3/12` counter). Reuses `cycleByCard` plumbing — keyboard ←/→ already work via existing handler.
- [x] **20.1.3** Action bar (bottom): Like / Save / Contact — same code path as video cards, no fork.
- [x] **20.1.4** Bottom overlay: address · price · beds·baths·sqft · expandable `DescriptionBlock` (reused).
- [x] **20.1.5** Bottom text strip: schools (name · rating) + POIs (name · distance). No video-jump affordance.
- [x] **20.1.6** Zero-video + zero-photo fall-through: `<VideoFeed cards={[]}/>` empty state preserved.
- [ ] **20.1.7** Verification: real-device test on Vivian's photo-only listing (Lighthouse ≥85, LCP < 2.5s on a 12-photo listing, LeadModal email lands).

**Definition of done**: a buyer landing on a photo-only listing URL has the same "I can like, save, share, and contact the agent" affordances as a video listing.

### 20.2 — Community photo upload (raw-material library) — ✅ done 2026-06-13

Buyer surfaces stay byte-for-byte unchanged; this is dashboard-only ingestion for future AI video generation.

- [x] **20.2.1** Migration `supabase/migrations/0015_community_photos.sql` — `community_photos` table + storage RLS + Realtime publication. Bucket `community-photos` MUST be created public-read=OFF in Supabase Studio before applying.
- [x] **20.2.2** `lib/supabase/storage.ts` — added `COMMUNITY_PHOTOS_BUCKET` + `nextCommunityPhotoStoragePath()`. Signed URL minting lives in the server action (`signCommunityPhotoUrls`) instead of a client helper because the bucket is private.
- [x] **20.2.3** `app/dashboard/communities/[id]/CommunityPhotoPanel.tsx` — client uploader with optional kind / school / poi tagging.
- [x] **20.2.4** `app/dashboard/communities/[id]/photo-actions.ts` — `recordCommunityPhoto` / `deleteCommunityPhoto` / `signCommunityPhotoUrls`.
- [x] **20.2.5** Mounted at `/dashboard/communities/[id]/photos` (separate page following the Phase 17 split, not in-page on the editor). Editor header now has both `+ Add photos` and `+ Add video`.
- [x] **20.2.6** Buyer-surface no-op verification: `lib/feed/browse-cards.ts`, `app/(public)/browse/**`, `app/(public)/v/[a]/[l]/page.tsx` — all untouched.

**Owner action required** before this is usable:
1. Apply migration: `supabase db push` (or via Studio SQL editor).
2. Create bucket `community-photos` in Supabase Studio: public-read=OFF, 10 MB, MIME jpeg/png/webp.

**Definition of done**: Vivian can upload, thumbnail-preview, and delete community photos in the dashboard. Buyer-facing pages render byte-for-byte identical to main on a representative listing. ✅

### 20.3 — DEFERRED: community photo buyer surface / AI video generation

Explicitly out of scope. Photos sit in `community_photos` as raw material. When we wire AI video generation (Phase 2x or later), we revisit display.



---

## Phase 39 — Showcase poster pages (`/s/`)

Goal: agents can share a listing as a single, beautiful, mobile-first landing page — designed to be screenshotted, forwarded in DMs, posted to socials. Picks deliberately different visual idioms so Vivian can choose per-listing.

- [x] **39.1** New route `app/(public)/s/[agentSlug]/[listingSlug]/page.tsx` with `?style=1|2|3|4` query (default 1). Reuses `loadListingFeedBySlug` + `loadListingPhotos`. Style 1 = Editorial Magazine (serif title, hero image/video, 3-col spec strip, magazine pull-quote for community).
- [x] **39.2** Style 2 = Cinematic Story — scroll-snap full-viewport sections, IG-story pacing.
- [x] **39.3** Style 3 = Minimal Poster — single static screen, screenshot-friendly.
- [x] **39.4** Style 4 = Luxury Brochure — paper bg, framed video card, two-column on tablet+, follows luxury-redesign-playbook three-tier rule.
- [x] **39.5** OG image generator at `app/(public)/s/[agentSlug]/[listingSlug]/opengraph-image.tsx` — `next/og` ImageResponse, 1200×630, single shared OG across all 4 styles.
- [x] **39.6** Dashboard share modal — "Share as poster" entry on listing edit page; modal with 4 style cards; click → copies `/s/<slug>?style=N` URL.

Design rules: light-only, mobile-first, all media via `lib/demo-media.ts` helpers, English copy only, no `_zh`/WeChat/Xiaohongshu refs, no gold accents (Style 4 follows three-tier rule).
