# Vicinity Release Notes

Newest at the top. Each release covers a meaningful product change visible to users.
Format matches the standard release template (Features / Improvements / Bug Fixes / Technical / Known Issues / Metrics).

---

## Release Notes - v0.12.1

**Release Date:** 2026-06-13

Quick follow-up to v0.12.0 based on owner feedback after kicking the tires.

### ✨ Improvements

**Buyers now land on Explore after sign-in/sign-up**
v0.12.0 sent buyers to /profile after authentication. Profile is a settings surface, not a landing surface — buyers come to look at homes. Sign in or sign up as a buyer now drops you straight into the Explore grid. Agents still land on /dashboard. (Profile remains one tap away via the bottom nav.)

**Trimmed lingering "coming soon" copy**
Removed two strings that read as broken UX rather than helpful framing:
- The "Buyer profiles — saved listings, messages with agents, preferences — are coming soon" notice on the logged-in buyer Profile view. The identity card + Explore CTA + Sign out are self-explanatory.
- The "Video walkthrough coming soon" tail on the photo-only fallback view of public listing pages. Photos already render; the page no longer makes a promise it can't keep.

### 🔧 Technical

- `app/(auth)/login/login-form.tsx`: buyer redirect target `/profile` → `/browse`.
- `app/(auth)/signup/signup-form.tsx`: same.
- `app/(public)/profile/page.tsx`: dropped logged-in buyer info box.
- `app/(public)/v/[agentSlug]/[listingSlug]/page.tsx`: shortened photo-fallback footer.
- No schema or migration changes.

### ⚠️ Known Issues

None new. Buyer accounts still cannot save listings or message agents — those land in v0.13.x and v0.14.x respectively.

---

## Release Notes - v0.12.0

**Release Date:** 2026-06-13

Buyer accounts arrive in their first form: anyone can sign up as a homebuyer, not just agents. The signup screen now asks who you are; the home screen and login screen drop the "agent" framing.

### ✨ Features

**Buyer signup**
The signup form now starts with a two-up choice: **Homebuyer** or **Agent**, defaulting to Homebuyer. Buyers create an account in seconds, no agent fields, no slug. After signup they land on Profile (where they can already adjust the Nearby search radius from v0.11.0). Agents continue to land on /dashboard exactly as before — their flow is unchanged.

**Login and home screen are role-neutral**
The home page CTA changed from "Agent Login" to "Login." The login form heading changed from "Agent login" to "Login," subtitle from "Sign in to your agent dashboard" to "Sign in to your account." After signing in, the app figures out your role automatically: agents go to /dashboard, buyers go to /profile.

### 🛠️ Improvements

**Profile screen — anonymous view simplified**
Removed the three-line explanatory paragraph and the "For homebuyers (coming soon)" info box. The screen is now a clean Welcome heading + Sign in / Create account buttons + Nearby radius preference. Less reading, the same actions.

### 🔧 Technical

- New `public.buyers` table (user_id PK → auth.users) with RLS: buyers can read/update their own row, no public read, no anon insert. INSERT goes through the security-definer trigger.
- `handle_new_user` trigger now branches on `raw_user_meta_data->>'role'`: `'buyer'` inserts into `buyers`, anything else (default `'agent'`) into `agents`. Backward compatible — any signup that doesn't pass role is treated as an agent.
- `lib/zod/auth.ts` `SignupWithPassword` now requires `role: 'agent' | 'buyer'`. Login form does a single `agents` lookup post-`signInWithPassword` and falls back to /profile if no agent row is found.
- Migration `0012_buyer_accounts.sql` must be applied before this release goes live.

### 📋 Known Issues

- **Buyer features are still limited**: a logged-in buyer can adjust the Nearby radius but can't yet save listings or message agents. Saved listings ship in v0.13 (Phase 15.2), messaging in v0.14 (Phase 15.3). The lead form on listing pages still works for unauthenticated buyers exactly as before.
- Email confirmation is intentionally **OFF** for both roles in this internal-beta release. Will flip to ON before GA.

### 📊 Migration Required

Run `supabase db push` to apply `0012_buyer_accounts.sql` before deploying this release. Without it, buyer signups will fail at the database trigger.

---

## Release Notes - v0.11.0

**Release Date:** 2026-06-13

Nearby is now a true twin of Explore — same Pinterest-style grid, same tap-to-watch behaviour. The radius preference moved off the page into Profile.

### ✨ Improvements

**Nearby ↔ Explore visual parity**
The Nearby tab used to be its own thing — a sectioned list of listing rows on top, a strip of community videos below, and a slider on the page that re-fetched on every drag. It now shows the exact same Pinterest-style card grid as Explore: 2 columns on phones, 3–4 on larger screens, full-bleed cover photo or video poster, price + address overlay. Tap any card and you drop into the same vertical swipe feed Explore uses, starting at that listing. A small "X.X mi" pill in the top-left corner is the only visual difference — every other detail (cover, overlay, hover ring, click-through) is shared.

**Search radius lives in Profile → Preferences**
Instead of a slider taking up space on the Nearby page itself, your search radius is now a single setting on the Profile screen: pick 1, 5, 10, 25, or 50 miles. The choice sticks (saved on your device) and is used every time you open Nearby. Default is still 10 miles for first-time visitors. This works whether you're signed in or not — agents, buyers, and anonymous browsers all share the same control.

### 🛠️ Technical

- New `fetchNearbyCards({ lat, lng, radius })` server fetcher reuses the same join + assembly logic as Explore, returning the same `BrowseCard` shape with an additive optional `distance` field. Bbox prefilter on `(lat, lng)` plus exact haversine in JS, capped at 200 listings.
- `/api/nearby` payload is now `{ cards, center, radius }` (was `{ listings, communityVideos, center, radius }`). Community videos still surface inside each card's swipe rail (school / POI / neighborhood arrays) — the dedicated strip is no longer needed.
- Radius preference persists in `localStorage` under `vicinity:nearby_radius`. Buyers are anonymous in V1 so there's no DB row to attach this to yet; when buyer accounts ship the preference will migrate into `user_preferences` on first sign-in.

### 📋 Known Issues

- The Nearby grid only shows listings whose `lat/lng` were geocoded at upload time. Older agent uploads pre-Phase 11 won't appear here even if they're inside the radius. Fixing requires a one-shot backfill (out of scope for this release).

### 📊 Metrics

- Build: `/nearby` 2.8 kB / 112 kB First Load JS (down from a custom multi-section page).
- Build: `/profile` 839 B / 96.8 kB (up ~240 B from the new Preferences client island).

---

## Release Notes - v0.10.2

**Release Date:** 2026-06-13

Desktop video feed polish — Douyin-style.

### ✨ Improvements

**Blurred backdrop in the desktop video feed**
On desktop, vertical 9:16 videos now sit in a softly-blurred extension of the current frame instead of solid black gutters. The video itself stays a fixed portrait shape (no stretching, no distortion); the blur fills the leftover space ambiently — same look as Douyin / TikTok on PC. Mobile is unchanged: videos continue to fill the screen edge-to-edge.

---

## Release Notes - v0.10.1

**Release Date:** 2026-06-12

Tiny mobile bug fix in the agent dashboard.

### 🐛 Bug Fixes

**Broken menu icon in the agent dashboard header**
On mobile, a small menu button in the top-left of the listing editor opened an empty panel. The bottom navigation already covers everything that menu was meant to reach, so the redundant button was removed. Mobile dashboards now rely entirely on the bottom tab bar; sign-out still lives on the Profile screen.

---

## Release Notes - v0.10.0

**Release Date:** 2026-06-12

This release reshapes Vicinity from "agents only, video-first" into the full two-sided product: a **bottom navigation** that adapts to who you are, a **profile page** for both buyers and agents, **photos as a first-class listing format** (not just video), a real **Nearby** screen that respects your current location, and a **placeholder for the AI tour-video** feature so we can wire the UI now and plug in a provider later.

### 🚀 New Features

**Mobile bottom navigation**
A persistent tab bar appears at the bottom of the screen on mobile. The tabs adapt to who you are:
- **Anyone (logged out or signed-in buyer):** Browse · Nearby · Profile.
- **Agent:** Browse · Nearby · New Listing · Community · Dashboard · Leads · Profile.

The bar hides itself on the immersive swipe feed and on auth screens so it doesn't compete with the content.

**Profile page**
A dedicated `/profile` screen that recognizes who's looking at it:
- **Anonymous visitors** see a friendly call-to-action with the choice "I'm an agent" (start a sign-up) vs. "I'm a buyer" (sign in to save listings and contact agents).
- **Buyers** get a settings shell — saved-listings sync and notification preferences land in the next release.
- **Agents** see a quick link into the dashboard plus sign-out — full agent settings ride the existing dashboard.

**Nearby** *(replaces the placeholder)*
The Nearby tab now actually works:
- Asks once for your location (with a manual lat/lng fallback if you decline).
- Default radius is **10 miles**, adjustable with a slider from 1 mile up to 50 miles.
- Returns the listings closest to you, sorted by distance.
- Will also surface neighborhood / community videos around you, once agents start tagging them with a location (see below).

**Listing photos**
Agents can now publish a listing with **just photos** — no video required. The listing-edit screen has a new Photos panel: drag-and-drop or tap to upload one or more photos, set a cover photo, delete the ones you don't want. The publish gate now reads "**at least one ready video OR photo**" instead of insisting on a hero video.

Photo-only listings:
- Show up in the Browse grid with the cover photo as the tile cover.
- Tapping a photo-only tile opens a clean photo gallery on the listing page (the swipe feed itself stays video-only by design — that's still the "TikTok for homebuying" moment).
- Listings that already have a hero video keep behaving exactly as before; photos are additive, not a replacement.

**AI tour video — coming soon**
The listing editor now has a **"Generate AI tour video"** button — disabled today, with a clear "Coming soon" tooltip. We've wired the API contract end-to-end so that once we pick a provider, the feature lights up across listings without further frontend work.

**Community videos can be tagged with a location**
When uploading a community / neighborhood video, agents can now optionally drop in a latitude / longitude (or tap "Use my current location" to fill it in from the browser). Videos with a location feed the platform-wide Nearby search; videos without a location keep working as they did before — they just won't appear as a nearby pin on someone else's screen.

### ✨ Improvements

**Browse grid renders photo covers**
The grid landing on Browse now shows cover photos for photo-only listings — previously only video-backed listings made it onto the grid. Tapping a photo-only tile takes you to that listing's gallery instead of the swipe feed.

**Publish gate copy is clearer**
The publish-readiness panel in the listing editor now explains the new "video OR photo" rule explicitly so agents aren't blocked thinking they must wait for a video.

### 🔧 Technical

- New `Nearby` HTTP API powering the `/nearby` page; bbox prefilter + exact distance sort, capped at 200 listings + 200 community videos per response.
- New first-class `listing_photos` storage path alongside the existing `listing_videos` flow; cover-photo selection lives there.
- New geolocation columns on community videos (with a partial index so legacy rows without coordinates don't pay any cost).
- Hardening: every page that touches the new tables degrades gracefully — empty state, never a crash — if the database migration hasn't been applied yet in a given environment.

### ⚠️ Known Issues / Pending

- **Database migration `0011` is not yet applied to production.** Until it lands:
  - Photo upload in the listing editor will fail at the upload step (the table and storage bucket don't exist yet).
  - Nearby returns listings only, not community videos.
  - Photo-only listings can't be published.
  All other surfaces (Profile, bottom nav, AI-tour stub, video uploads, existing publish flow) work today.
- **Buyer "save / like / contact" sign-in gate** is still on the cutting board for the next release — anonymous visitors can browse and view but can't yet bookmark or message an agent.
- **AI tour video generation** is wired end-to-end as an interface only; the actual video provider is not yet picked.
- **Bottom nav at 6 tabs (agent role)** is tight on narrow phones; we may collapse two of them into a "More" overflow if user feedback flags it.

### 📈 Metrics to watch

- % of listings published with photos only vs. with a hero video.
- Nearby usage: % of sessions that grant location, average radius selected.
- Bottom-nav tap distribution by role (which tabs actually get used on mobile).

---

## Release Notes - v0.9.0

**Release Date:** 2026-06-12

### 🚀 New Features

**Browse: Grid + Swipe**
The Browse experience now has two modes that feed into each other:
- **Grid landing.** When you visit Browse you first see a Pinterest-style wall of every published listing — a cover photo, the price, the address, and the bed/bath/sqft line. You can scan a dozen homes in seconds and pick the one that catches your eye.
- **Swipe view.** Tap any tile and you drop straight into a vertical, full-screen video tour of that listing — and you can keep swiping up to see the next one, the one after that, and so on. Tap the back arrow to return to the grid.

This replaces the old "Browse drops you into a vertical feed" entry point. Why: a wrong tile costs you a glance; a wrong full-screen video costs you 30 seconds of attention.

**Save Listings**
A new bookmark icon on each video lets you save a listing for later. (For now this lives in the current browser tab; persistent saved-listings sync arrives with sign-in.)

### ✨ Improvements

**New Video-Detail Layout (Xiaohongshu-style)**
Inside the swipe view, the buttons are now reorganized for one-thumb use:
- **Top of the screen** — a back arrow on the left, search and share on the right. Easy to reach.
- **Right edge** — quick access to neighborhood context: Schools, Nearby, Area, Sound on/off.
- **Bottom of the screen** — a bigger, clearer action bar with **Like / Save / Contact**.

The price, address, and bed/bath/sqft summary moved from the top-left to the bottom — closer to the action bar, easier to read against the video, and now followed by the listing's full description text (tap "more" to expand).

### 🐛 Bug Fixes

None this release — pure surface change.

### 🔧 Technical

- Single shared fetcher feeds both Browse views, so the grid card and the swipe card always show the exact same data.
- The single-listing tour page (`/v/<agent>/<listing>`) is unchanged — direct deep links still work.

### ⚠️ Known Issues

- **Search icon is a placeholder.** It currently just returns to the grid. Real search (by city, address, neighborhood) ships in a follow-up.
- **Save and Like don't persist** across visits yet — they reset when you close the tab. Both are wired to flip on once accounts ship.
- **iOS bottom safe-area** — the new bottom action bar may need a small adjustment on phones with home-indicator gestures; flagged for a smoke test on real hardware.

### 📈 Metrics

To watch after this release:
- **Grid-tile tap rate** — fraction of Browse visitors who tap into the swipe view (target: >40% — if not, the cover thumbnails aren't doing enough work).
- **Swipe depth** — average number of cards a user views per swipe-feed session, segmented by entry tile vs. random entry.
- **Save events / visitor** — even before persistence, this is a leading indicator of "would commit to this listing later."
- **Contact-button taps from inside the swipe view** — should rise vs. previous release because Contact is now a primary action, not a side-rail one.

---

## Release Notes - v0.8.1

**Release Date:** 2026-06-11

### 🚀 New Features

**Auto-Save in Listing Editor**
The listing edit page now saves every change automatically — no more "Save changes" button. A small badge in the corner shows live status (`Saving… → ✓ Saved`).

**Benefits**
- One less click per edit; agents can focus on filling content
- "I clicked Publish but it says fields are missing" bug class eliminated — Publish now force-flushes any pending edits before submitting
- Browser warns before closing the tab if there are unsaved changes

### ✨ Improvements

**Listing Form Clarity**
- Each field is now labeled `* Required` (red) or `Optional` (gray) — only 5 things are required to publish: address, list price, bedrooms, bathrooms, and at least one ready video
- Bedrooms, bathrooms, and home style are now dropdown menus (Craftsman / Colonial / Modern / Ranch / …)
- Lot size is split into a number field + unit selector (acres / sqft) instead of one free-form text box
- Placeholder hints reformatted as `e.g. 950000` so they're never mistaken for real values

**Publish Error Messages**
When publish fails, the missing-fields list now uses plain English ("List price", "At least one ready video") instead of internal field names.

### 🐛 Bug Fixes
- Fixed: agents who filled all required fields and clicked Publish would still get "missing required fields" errors because the form had unsaved changes the publish gate couldn't see

### 🔧 Technical Changes
- Debounced auto-save (600ms) with serialized in-flight requests
- Cross-component flush registry so the publish action awaits any pending save

### ⚠️ Known Issues
- None

### 📈 Metrics Impact
**Expected Outcomes:**
- Drop in publish-failure complaints from agents
- Faster time-to-publish (no need to remember the Save → Publish two-step)

---

## Release Notes - v0.8.0

**Release Date:** 2026-06-11

### 🚀 New Features

**Unified Contact Experience**
The same Contact form (LeadModal) now appears on both the swipeable browse feed (`/browse`) and individual listing pages (`/v/[slug]`) — no more inconsistent buttons or jammed modals.

### ✨ Improvements

**Listing Page Polish**
- Right-side action rail on `/v/[slug]` (Schools / Nearby / Area / Sound) now matches `/browse` exactly
- Share button copies the link directly with a toast — popup dialog removed

**Mobile Editing**
- Fixed overlapping fields on the listing edit page on small screens
- Uploaded video titles now auto-clean (no more raw `.mp4` filenames as titles)

### 🐛 Bug Fixes
- Fixed `/browse` Contact button being non-clickable in some states
- Fixed share dialog appearing twice after successful copy

### 🔧 Technical Changes
- Reverted earlier ActionRail iteration to a stable baseline before re-applying targeted fixes

### ⚠️ Known Issues
- None

### 📈 Metrics Impact
**Expected Outcomes:**
- Higher Contact conversion on `/browse` (now uses the same proven modal as `/v/`)
- Cleaner mobile experience on iOS Safari

---

## Release Notes - v0.7.0

**Release Date:** 2026-06-10

### 🚀 New Features

**TikTok-Style Browse Feed**
The `/browse` page is now a full-screen, swipe-up video feed (vertical scroll, autoplay, mute toggle) — buyers can flick through listings the way they flick through TikTok.

**Per-Listing Source Switching**
On any listing video, viewers can switch between the listing tour, school videos, neighborhood b-roll, and area POIs without leaving the feed.

**Agent Profile Pages**
New public route `/a/[agentSlug]` — a dedicated, shareable page for each agent showing their listings.

**Dashboard Analytics Visualization**
Funnel charts (view → engagement → lead) and a "top listings" leaderboard added to the analytics dashboard.

**Email Channel for Social Copy**
Social-copy generator now has an `Email` tab alongside the existing platforms.

### ✨ Improvements

**Dashboard Listings Page**
- Cover image, view/lead counts, and a one-click "copy public URL" pill on every listing card
- Mobile hamburger navigation for the dashboard

**Visual Polish on Browse Feed**
- Listing card layout, typography, and spacing aligned with the TikTok-style demo
- "View full listing" duplicate pill removed (the whole card is already tappable)

**Navigation Unification**
- Top-right Logo always returns home from anywhere
- `/browse` back button renamed and repositioned for clarity
- Back button + Logo paired top-right on mobile

**Sound Controls**
- Tap-to-unmute now works reliably (was failing on first interaction)
- Global Sound toggle on `/browse`

### 🐛 Bug Fixes
- Fixed: `/browse` route was 404'ing from the landing page CTA
- Fixed: muted videos sometimes wouldn't unmute on first tap

### 🔧 Technical Changes
- Per-listing source switching uses a small client-side state machine
- Swipe gestures normalized across iOS and Android

### ⚠️ Known Issues
- Very long listing addresses can wrap awkwardly on narrow screens

### 📈 Metrics Impact
**Expected Outcomes:**
- Significantly higher session length and listings-per-session on `/browse`
- More shares (agent profile pages and per-listing public URLs)

---

## Release Notes - v0.6.0

**Release Date:** 2026-06-10

### 🚀 New Features

**Email + Password Login**
Users can now sign up and sign in with email + password. The original magic-link flow still works for users who prefer it.

**Forgot Password Flow**
A complete password-reset flow via 6–10 digit one-time code sent by email.

### ✨ Improvements

**Landing Page Redesign**
- New hero section with real Pexels real-estate video as the background
- Dual CTA buttons (Browse / Get Started)
- "How it works" three-step explainer added
- Visual tone aligned with the demo design

**Auth Pages Redesign**
- Login, signup, and reset pages restyled with the project's ink + gold palette
- Fixes white-on-white input bug on iOS Safari

### 🐛 Bug Fixes
- Fixed iOS Safari rendering inputs as white text on white background
- Fixed login form theming inconsistencies

### 🔧 Technical Changes
- Auth provider now supports both magic link and password flows side by side
- Design tokens + custom fonts wired into Header / Footer components

### ⚠️ Known Issues
- None

### 📈 Metrics Impact
**Expected Outcomes:**
- Higher signup conversion (password is more familiar than magic link for some users)
- Reduced support requests around login

---

## Release Notes - v0.5.0

**Release Date:** 2026-06-09

### 🚀 New Features

**AI-Generated Listing Descriptions**
A new "✨ Generate description" button on the listing edit form produces a polished English description from the listing's facts (price, beds, baths, style, neighborhood). Agents can edit the result before saving.

**AI-Generated Social Copy**
Generate ready-to-paste social posts for the listing — multiple platform tabs, with output formatted appropriately per channel.

**Per-Listing Analytics Page**
Each listing now has its own analytics page showing views, video completion rate, and lead sources.

**Dashboard Rollup**
A summary view aggregating stats across all the agent's listings.

### ✨ Improvements

**Rate Limiting**
Built-in safeguards prevent runaway AI usage; users see a clear "try again in a minute" message if they hit the cap.

### 🐛 Bug Fixes
- Fixed: AI output wrapped in code fences would fail to parse — generator now tolerates fenced JSON

### 🔧 Technical Changes
- AI usage logged for accounting and abuse detection
- Vitest coverage added for the new analytics and rate-limit libraries

### ⚠️ Known Issues
- Generated copy is English-only

### 📈 Metrics Impact
**Expected Outcomes:**
- Faster listing creation (descriptions are the slowest manual step)
- More consistent listing quality across agents

---

## Release Notes - v0.4.0

**Release Date:** 2026-06-09

### 🚀 New Features

**Public Lead Capture**
The Contact form on public listing pages now writes a real lead record (no more mock submissions).

**Real-Time Lead Notifications**
- New leads trigger an email to the agent immediately (sent via transactional provider)
- A real-time list at `/dashboard/leads` updates without a refresh

**Lead Detail Page**
Click into any lead at `/dashboard/leads/[id]` to see the full message and reply via a one-click `mailto:` link.

### ✨ Improvements

**Reliability**
Idempotency built into both the lead-create endpoint and the email-notify trigger — duplicate submits and trigger retries don't produce duplicate emails.

### 🐛 Bug Fixes
- Fixed: notification trigger was calling the wrong internal HTTP helper

### 🔧 Technical Changes
- All public lead inputs validated by zod schemas
- Realtime updates with polling fallback for clients where WebSocket is blocked

### ⚠️ Known Issues
- None

### 📈 Metrics Impact
**Expected Outcomes:**
- Zero-latency lead routing → faster agent response → higher conversion

---

## Release Notes - v0.3.0

**Release Date:** 2026-06-09

### 🚀 New Features

**Full Listing Editor**
- New listings can be created with Google Places autocomplete (auto-fills city / neighborhood / state)
- Multi-video support per listing with drag-and-drop reordering
- Cover photo selector — pick which video's poster represents the listing

**Communities**
A listing can be tied to a shared community (school videos, points of interest, neighborhood b-roll). Manage communities under `/dashboard/communities`. Community videos are reused across all listings in that community.

**Lifecycle Controls**
- Draft / Publish toggle on every listing
- Archive (and restore) listings; dashboard has a "show archived" filter

### ✨ Improvements
- Place Details extraction now reliably pulls neighborhood from Google's response

### 🐛 Bug Fixes
- Fixed: `updateListing` was returning false-negative results because the post-update count is unreliable under row-level security — now uses `maybeSingle()`

### 🔧 Technical Changes
- New `archive_listing` server action with proper permission checks

### ⚠️ Known Issues
- None

### 📈 Metrics Impact
**Expected Outcomes:**
- Agents can fully manage their listings without leaving the dashboard

---

## Release Notes - v0.2.0

**Release Date:** 2026-06-09

### 🚀 New Features

**Public Listing Pages — TikTok-Style**
- Public route `/v/[slug]` goes live: vertical full-screen video, autoplay, swipe to next listing
- Right-side ActionRail with Like / Share / Contact / Schools / Nearby / Area / Sound
- HLS streaming playback with mount-window policy (only the visible video is loaded)

**Open Graph + Twitter Cards**
Sharing a listing link to social or messaging apps now produces a rich preview card with the cover image, address, and price.

**Event Tracking**
Page views, card views, and video completions are tracked for analytics.

### ✨ Improvements

**Feed Composition**
Listing videos and overlay videos (schools, neighborhood) are interleaved per the architecture spec.

### 🐛 Bug Fixes
- Fixed: `CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN` env var now tolerates either bare subdomain or full hostname

### 🔧 Technical Changes
- LeadModal UI scaffolded (functional wiring lands in v0.4.0)
- 12 unit tests for `composeFeed`

### ⚠️ Known Issues
- None

### 📈 Metrics Impact
**Expected Outcomes:**
- First user-facing public surface — establishes the core "swipe through listings" experience

---

## Release Notes - v0.1.0

**Release Date:** 2026-06-09

### 🚀 New Features

**Foundational Platform**
- User accounts: signup, login, email verification (via magic link)
- Per-account data isolation (row-level security in the database)
- Video upload pipeline: upload → background transcode → ready-to-stream
- Realtime updates pushed to the dashboard
- First version of the agent dashboard with upload + listing management scaffolds

### ✨ Improvements
- Polling fallback for environments where Realtime WebSockets are blocked

### 🐛 Bug Fixes
- N/A (initial release)

### 🔧 Technical Changes
- Project scaffolded on Next.js 14 + Supabase + Cloudflare Stream + Vercel
- Replica identity on key tables for Realtime + RLS join support

### ⚠️ Known Issues
- Some environments require explicit JWT forwarding for Realtime — handled in a follow-up hotfix

### 📈 Metrics Impact
**Expected Outcomes:**
- Platform foundation ready for content (Phase 3) and contact (Phase 5)

---

## Template (for future releases)

Copy this block to the top of the file for every push to `main` that has user-visible impact:

```
## Release Notes - vX.Y.Z

**Release Date:** YYYY-MM-DD

### 🚀 New Features
**<Feature Name>**
<One sentence description.>

**Benefits**
- <Bullet>

### ✨ Improvements
**<Area>**
- <Bullet>

### 🐛 Bug Fixes
- <Bullet>

### 🔧 Technical Changes
- <Bullet>

### ⚠️ Known Issues
- <Bullet, or "None">

### 📈 Metrics Impact
**Expected Outcomes:**
- <Bullet>
```

**Versioning convention:**
- `v0.x.y` while in pre-launch
- Bump `x` for a meaningful release; bump `y` for a same-day follow-up
- After public launch → `v1.0.0`
