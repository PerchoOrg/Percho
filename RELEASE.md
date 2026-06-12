# Vicinity Release Notes

Newest at the top. Each release covers a meaningful product change visible to users.
Format matches the standard release template (Features / Improvements / Bug Fixes / Technical / Known Issues / Metrics).

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
