# Percho Release Notes

> The product was renamed from **Vicinity** to **Percho** on **2026-07-11**.
> Historical entries below preserve the original name in-place — release notes
> are a record of what was shipped under the product's name at the time.

## v100.4 — BGM: rejected tracks are now truly deleted (2026-07-18)

**✨ Improvements**

Rejecting a background-music track used to keep the mp3 sitting in Storage; the worker just skipped it. That was fine as a "maybe restore later" tier, but the reject list has been steady long enough that keeping 41 unwanted mp3s around was just clutter.

- **New "Purge rejected (N)" button** on every vibe section that has rejected tracks. One click, one confirm, and every rejected mp3 in that vibe is deleted from Storage and dropped from the reject list.
- The 41 tracks already on the reject list have been purged in this release.
- Approve/Reject on individual tracks still behaves the same — reject is still a soft-delete you can undo, purge only kicks in when you press the red button.

## v100.3 — Neighborhoods page is populated again (2026-07-17)

**🐛 Bug Fixes**

The Neighborhoods page (`/communities`) was showing "No communities yet" even though the pool now has thousands of neighborhoods. The page was trying to load too much data per row for the server to return in time, so the whole request came back empty and the page fell to its empty state.

What changes visibly:
- The Neighborhoods grid is populated again — no more "No communities yet" on the buyer surface.
- The order of the grid has also been improved: neighborhoods that actually have homes for sale come first, then neighborhoods with videos, then reference-only neighborhoods (seeded from Nextdoor with no listing or video yet). Alphabetical within each group. Buyers now see the useful stuff above the fold instead of a wall of empty tiles that happen to start with a number.

## v100.2 — Tapping a home in the grid now opens the right home (2026-07-17)

**🐛 Bug Fixes**

On the For You grid, tapping a listing further down the page (like 5122 Lower Creek Street) would sometimes open the swipe view on a *different* home instead. The grid was loading up to 500 homes, but the swipe view was only loading the newest 30 — so if the home you tapped wasn't in that first 30, the swipe view silently fell back to whatever was at the top of its list.

What changes visibly:
- Tapping any home in the For You grid now opens the swipe view on that exact home, no matter how far down the grid it sits.
- The swipe view now loads the full pool of active listings for browsing, matching the grid.
- 5122 Lower Creek Street specifically now opens on itself when tapped.
- No change to what listings appear or how they're ordered — just the deep-link accuracy.

## v100.1 — Nearby video: drop the top progress dashes (2026-07-17)

**✨ Improvements**

Removed the segmented dashed progress bar from the top of the Nearby video player. The "3 / 6" style counter pill in the top-right already tells the buyer where they are in the pool, and the dashes on top of the busy video hero were adding visual noise without adding information.

## v100.0 — Cleaner Nearby video overlay (2026-07-17)

**✨ Improvements**

Cleaned up the Nearby video player. Removed the category tag pill (e.g. "EATING OUT") from the top-left and the tagline blurb (e.g. "Where you actually go for dinner") from over the video. Both were leftovers from when the video card didn't yet carry its own info card — now that every clip has a proper white info card at the bottom with title, category, distance, and drive time, the extra labels were just noise stacked on top of a busy frame.

What changes visibly:
- No more all-caps category pill in the upper-left of the Nearby video.
- No more short tagline blurb sitting above the info card.
- The pagination bars at the top and the "3 / 6" counter still tell the buyer where they are in the pool.
- The bottom white info card (title / category / distance / drive) is unchanged.

## v99.9 — Nearby button on Explore feed too (2026-07-17)

**🐛 Bug Fixes**

Yesterday's v99.8 fix made the Nearby button appear on the agent-specific listing page (`/v/<agent>/<listing>`), but the Explore feed (`/browse/feed`) uses a separate data loader that we didn't touch. Result: 5122 Lower Creek Street's Nearby button was still missing when reached via Explore, and a handful of other listings that used to show it there also came up blank.

What changes visibly:
- The 🏘️ Nearby button now appears on every listing card in the Explore feed that has generated Nearby videos, matching the behaviour of the direct agent listing page.
- 5122 Lower Creek Street specifically now shows the button with its 5-video badge on both entry paths.
- No visible change to listings that already showed Nearby correctly.

## v99.8 — Nearby button now shows for listings without a community (2026-07-17)

**🐛 Bug Fixes**

For listings that aren't yet part of a "community" grouping in our system, the Nearby button was missing from the right rail on the public listing page — even when those listings had 5+ generated Nearby videos ready to play. Buyers had no way to reach that content.

What changes visibly:
- Every listing with generated Nearby videos now shows the 🏘️ Nearby button on the right rail with a red count badge, regardless of whether it belongs to a community.
- Tapping the button opens the same neighborhood sheet + fullscreen carousel used on community-backed listings.

## v99.7 — Nearby videos now actually visible to buyers (2026-07-17)

**🐛 Bug Fixes**

Even after the previous release, buyers browsing `/v/…` still couldn't see any Nearby videos — the code path was right but a database permission was silently hiding the rows from anonymous visitors. Only the signed-in owning agent could see them.

What changes visibly:
- Nearby video carousel now renders for logged-out visitors on every published listing that has generated Nearby content (confirmed on 5122 Lower Creek Street).

## v99.6 — Nearby videos now show up on the listing page (2026-07-17)

**🐛 Bug Fixes**

Listings with generated Nearby videos weren't rendering them on the public `/v/…` page when they belonged to a covering community — the loader was fetching community-scoped videos and skipping the listing's own set. Listings without a covering community had the reverse issue: photo-only listings hard-coded an empty nearby carousel, so their Nearby videos never surfaced either.

What changes visibly:
- Every listing now shows its own generated Nearby videos on the public feed page, regardless of whether it sits inside a community.
- Listings that are inside a community additionally show that community's Nearby content (manual uploads + generated set), with duplicates de-duped by video ID.
- Photo-only listings can now display Nearby videos when they exist.

## v99.5 — Nearby POI: no more separate "Approve POI" button — photo approvals speak for themselves (2026-07-17)

**✨ Improvements**

The green-check / red-X buttons on each Nearby POI row are gone. Approving one or more photos inside a POI now implicitly counts as approving that POI — that's what the video pipeline was actually using anyway, and having two buttons for one decision was creating confusion about which one mattered.

What changes visibly:
- POI row now shows just the Fetch/Sync icon plus the expandable photo strip.
- The `(N ✓)` counter next to "Show N photos" is the source of truth for how many photos survived review for that POI.
- To keep a POI out of videos, reject its photos instead of the POI.

Applies to both the Listing edit → Media → Nearby POIs panel and the Community edit → Nearby POIs panel.

## v99.4 — Nearby POI: Fetch button becomes Sync once photos are cached (2026-07-17)

The Fetch (📷+) button on each Nearby POI row now switches to a Sync (🔄) icon as soon as that POI has photos in the library. Behavior is unchanged — the click has always been idempotent under the hood (cached photos are re-used, already-tagged photos skip Anthropic vision) — but the icon now makes it obvious you've been here already, so you don't wonder whether tapping it a second time costs another round of tokens.

Applies to both the Listing edit → Media → Nearby POIs panel and the Community edit → Nearby POIs panel.

## v99.3 — Fetch photos no longer freezes the Nearby panel (2026-07-17)

**🐛 Bug Fixes**

Clicking "Fetch photos" on a nearby POI used to freeze the whole panel for several seconds — you couldn't approve/reject other POIs or start another photo fetch until the first one finished. Now each POI's fetch runs on its own; click Fetch on several POIs in a row and they all work in parallel, and Approve/Reject on unrelated POIs stays clickable while photos load.

---

## v99.2 — Admin tables: search, sort, and pagination on every list (2026-07-17)

**Admin › Pipeline**

Every list view in the admin console (Home Tour, Home Nearby, Neighborhood Nearby, Bucket Video Jobs, POI Library) now has the same three controls:

- **Search box, top-right.** Type to filter the visible rows instantly — matches across the row's key fields (address / name / status / notes, whichever applies to the table).
- **Sort by clicking any column header.** First click = ascending, second click = descending, third click clears sort. Works on every column, including counts and dates.
- **20 rows per page.** Prev / Next buttons at the bottom, with a "N–M of T" counter. Cranks through hundreds of listings without one giant scroll.

**Old filter buttons removed** — the search + sortable columns cover the same ground, so the header chips ("All / No tour / Has tour", status chips on Bucket Jobs, "No community / Has community", the POI tagged/photos dropdowns) are gone for a cleaner top strip. If any of those specific filters get missed in practice, they can come back later.

---

## v99.1 — Admin BGM upload fix: large mp3s (2026-07-17)

### 🐛 Bug Fixes
- Uploading a background-music mp3 from local no longer fails with a cryptic "Unexpected token" error. Larger files now upload straight from the browser to storage without hitting a size ceiling on the intermediate hop.

---

## v99.0 — Admin BGM: Import (web catalog) + Upload (local) split, dual-button Approve/Reject (2026-07-17)

**Admin › Pipeline › Music**
- Each track row now shows **Approve** and **Reject** side-by-side; the active state is highlighted in green / red so the current call is visible at a glance. One click flips between them (reject is still soft — the mp3 stays in Storage, worker skips picking).
- Each vibe section has **two intake buttons**:
  - **Import** — searches Kevin MacLeod's full incompetech catalog (~1,400 tracks) with metadata (feel, BPM, length, instruments). Inline audio preview per row, multi-select, server-side fetch + upload. Already-imported tracks hide from the picker. This is how the existing library was assembled originally.
  - **Upload** — local mp3 file picker (unchanged behavior from Phase 105; Phase 106 mis-labeled it "Import").
- Fixed a stale hardcoded vibe list in the upload counter that still referenced the retired `cinematic` bucket.

**Cleanup**
- `scripts/render-worker/bgm/fetch.sh` had leftover Phase 71/75 merge-conflict markers from an old stash-pop; cleaned up. Import in the admin UI is now the primary way to grow the library; `fetch.sh` remains as a bootstrap for fresh render hosts.

## v98.9 — BGM: retire cinematic, soft-reject, import per vibe (2026-07-17)

- **Cinematic vibe retired** — all 14 tracks (6 in Storage, 8 on the render
  disk) deleted after the owner rated the whole bucket too somber. The tab
  now shows four vibes: warm-acoustic, modern-corporate, luxury-ambient,
  chill-electronic. **41 active tracks** total.
- **Per-track delete → Reject / Approve.** Reject keeps the mp3 in Storage
  but tells the render worker to stop downloading it. One-click **Approve**
  restores. Rejected tracks render dimmed at the bottom of each vibe so
  they're always recoverable.
- **Import button** on every vibe section — same multi-file upload as
  Phase 105, clearer label. Drop one or many mp3s at once.

**Operator note**: after admin add/reject/approve, run
`scripts/render-worker/pull-bgm.sh` on the render host so the worker's
local mp3 cache and `manifest.json` catch up before the next render.

---

## v98.8 — Admin restructure: Home Tour hub, split Nearby, POI photos filter (2026-07-17)

Three admin console upgrades:

- **Home Tour** tab is now a per-listing hub. The old flat render queue
  becomes an index of listings; tap any row to open a detail page with
  every photo and every tour video for that home, plus a
  **Generate new tour video** button (admin-scoped — re-renders the
  Ken Burns walkthrough without touching agent ownership).
- **Nearby** split into two peer tabs — **Home** (per-listing) and
  **Neighborhood** (per-community). Chips wrap onto two lines so the
  full label fits. Old `/admin/pipeline/nearby` links redirect
  automatically (`?scope=neighborhood` → community tab).
- **POI** tab: new **With photos / No photos / Any** filter next to the
  AI-tag filter, so it's one click to see POIs still missing photos.

Seven tabs now (Home Tour, Home, Neighborhood, POI, Video Jobs, Music,
Worker); the chip strip scrolls horizontally on narrow viewports.

## v98.7 — Admin Music tab: add + delete (2026-07-17)

The **Music** tab now supports uploading new tracks and deleting existing
ones. Each vibe section has an **Upload** button (accepts one or many mp3s)
and every row has a trash icon with an inline confirm step.

Storage is now canonical for the admin view — the tab lists what's actually
in the `bgm` bucket, not what the checked-in manifest says.

**Operator note**: after admin add/delete, run `scripts/render-worker/pull-bgm.sh`
on the render host so the worker's local mp3 cache and `manifest.json` catch
up before the next video renders.

---

## v98.6 — Admin console: Music tab (2026-07-17)

Admin now has a sixth tab: **Music**. It lists every background-music track
the render worker might pick for a generated video, grouped by vibe bucket
(warm acoustic / modern corporate / luxury ambient / chill electronic /
cinematic) with a short description of what each vibe fits. Every track
has a Play button — click to preview in the browser. 49 tracks total.

Attribution to Kevin MacLeod (CC BY 4.0) rendered at the bottom.

## v98.5 — Admin console refresh + global photo review (2026-07-17)

Admin now uses the same chip-bar layout as the my-listing agent hub —
five tabs, identical on mobile and desktop:

- **Home Tour** — listing render queue.
- **Nearby** — Home and Neighborhood in one place, switchable via a
  segmented control at the top of the tab.
- **POI** — every POI in the platform, tap any row to open a review
  page that shows every photo. Tap a photo to open a full-screen
  reviewer with Approve / Reject buttons; a rejected photo is removed
  from every listing and neighborhood video everywhere.
- **Video Jobs** — nearby-video generation queue.
- **Worker Health** — render-worker heartbeat.

The old sidebar is gone; the top bar keeps the "ADMIN" label.

## v98.4 — Marketing tab out, per-section upload buttons (2026-07-17)

- Listing hub: removed **Marketing** tab (tab entry + `SocialCopyPanel` mount +
  `Megaphone` icon import). Tabs now: Details · Media · Leads · Analytics.
  `SocialCopyPanel.tsx` retained on disk (unmounted).
- Community hub: removed **Marketing** tab (tab entry + `CommunityMarketingPanel`
  mount + `Megaphone` import). Tabs now: Details · Media · Analytics (owner).
  `CommunityMarketingPanel.tsx` retained on disk (unmounted).
- Media tab (listing + community): unified top **Click to upload** button
  removed. Each sub-section header (Videos / Photos) now hosts its own compact
  **Upload** button, scoped to the correct file type — no more mixed picker.

## v98.3 — 2026-07-17 — Community Nearby moves to /admin

- **CommunityNearbyPanel** is now mounted at
  `/admin/pipeline/community-nearby/[id]`, matching where listing nearby
  lives. The Nearby tab on the agent-facing `/dashboard/communities/[id]`
  hub is removed — automation infra is admin-only.
- `/admin/pipeline/community-nearby` index and `bucket-jobs` anchor links
  now point at the admin detail page (previously deep-linked into the
  agent hub Nearby tab).
- Admin console button on **Me** page adopts the `btn-gold` pill style
  used by Public profile / View analytics — consistent primary-action
  treatment; account actions (Change password / Sign out) stay as the
  outlined variant.

## v98.2 — 2026-07-16 — Admin console: Me-tab entry + mobile fix

- Profile ("Me") page shows an **Admin console** button when the signed-in
  agent has `is_admin = true`. No more URL-typing to reach `/admin`.
- `/admin/*` layout is now mobile-friendly: sidebar collapses to a
  horizontal scroll strip at < lg, and every table wraps in
  `overflow-x-auto` with a 640 px min-width — content no longer clips off
  the right edge on iPhone.

## v98.1 — 2026-07-16 — Admin pipeline console

Nearby POI discovery, AI photo tagging, and bucket video generation are
platform automation, so their review surfaces moved off the agent hub
and into a dedicated `/admin/*` console gated by `agents.is_admin`.

- New pages: Pipeline landing, Listing Nearby, Community Nearby, Bucket
  Jobs, Tour Jobs, POI Library, Worker Health.
- Agent hub cleanup: Listing edit no longer has a Nearby tab (agents
  don't need to see automation knobs — they just get the finished
  videos on their public pages).
- Bootstrap admin access with `update public.agents set is_admin = true
  where email = '<you>'` after applying the migration.

## v98.0 — 2026-07-16 — Every listing now shows nearby videos

Nearby videos (Schools, Dining, Outdoor, Fitness, etc.) used to require a
listing to be part of a curated neighborhood. Homes that fell outside
any neighborhood — a growing set as we bring on more agents — showed
none of that context. Now every listing has its own nearby: the
platform discovers POIs within ~3 km of the home itself, ranks them by
distance, and generates the same bucket videos buyers see for
neighborhood-listed homes.

For agents there's a new **Nearby** tab in the listing editor with the
same POI triage, photo approval and video-generation controls the
neighborhood editor already has. Photos and POI data stay pooled across
the whole platform so nothing is fetched or AI-tagged twice.

For buyers, the change is invisible in the best way: nearby video cards
appear on every published listing.

## v97.0 — 2026-07-16 — Tour videos now show a caption for every photo

Home tour videos used to be silent visuals — photos panning past with no
text. Now each shot gets a bottom-anchored caption: the room name
(e.g. "KITCHEN ISLAND") in italic gold, followed by a one-sentence
description of what makes that photo interesting ("Marble waterfall
island seats six, pendant lights hang above").

Style is cinematic — full-width gradient scrim so the text stays readable
on bright white kitchens, serif type (Charter), gold accent rule under
each caption. Room is left below the caption band for a future voice-over
subtitle layer.

Re-generate any tour to see the new captions.

## v96.3 — 2026-07-16 — Tour video generation now handles PNG photos

Generating a tour video was failing with a "Render failed" error on
listings that had PNG photos (screenshots, illustrations, or photos
saved as PNG). Fixed the photo-analysis step so it correctly identifies
each image format — PNG, JPEG, WebP, and GIF all work now.

If a listing hit this bug, delete the old failed tour and click
"Generate tour video" again — it should work now.

## v96.2 — 2026-07-16 — Tour videos now fill the screen edge-to-edge

Auto-generated tour videos for listings with landscape photos were
rendering with heavy blurred bars on both sides of the picture — a
small clear image in the middle with a smeared version of the same
photo padding the left and right. Fixed the video renderer so
landscape output fills the full 16:9 frame edge-to-edge, cinema style.
Portrait tour videos are unchanged.

Existing videos on affected listings need to be regenerated once from
the dashboard for the fix to show up on that listing.

## v96.1 — 2026-07-16 — Tour video now fills the screen properly

Fixed a bug where an auto-generated tour video was rendering as a small
box floating in the middle of the screen instead of filling the width
with a normal top/bottom letterbox. Landscape-shot listings (most of
them, since real estate photos are usually horizontal) now display
edge-to-edge on the phone the way they should.

## v96.0 — 2026-07-16 — Media tab: tour-video generator collapses into an inline button

The "Generate tour video" card on a listing's Media tab has been removed
as a standalone section. It's now a compact button that sits directly
next to the **Videos (N)** header, so the media grid gets its full width
back and the action feels like part of the videos panel — not a separate
workflow. Behavior is unchanged: it still needs at least 3 photos, still
renders a ~2-minute Ken Burns tour, and still shows queued / rendering /
done status inline.

## v95.0 — 2026-07-16 — AI photo descriptions on the Media tab

Every photo on a listing's Media tab now shows a one-sentence AI
description ("Bright kitchen with marble island and open floor plan")
and up to three quick tags (room type + style signals like "hardwood",
"large_windows", "open_plan") right under the thumbnail. Agents can see
at a glance what each photo actually contains without opening it.

The descriptions are generated during the first video render, so once
you've made a video for the listing the whole gallery gets captioned.
Adding new photos later? Only those new photos are analyzed — no
double-billing on the same shots.

## v94.0 — 2026-07-16 — Atlanta metro is live on the community grid

The `/communities` page is no longer a demo shell. Every neighborhood
across the Atlanta metro — from Buckhead and Inman Park to Alpharetta,
Cumming, Marietta, Douglasville, Lawrenceville and 80+ more — now
appears as a real card with a real photo, a real boundary on the map,
and real stats (residents, median home value, average income,
homeowners %) sourced from public neighborhood pages.

Around 8,700 neighborhoods across 87 metro cities are now searchable.
When an agent creates a listing, it auto-slots into the neighborhood it
falls inside so buyers can find every listing that's actually in
"Waterside" or "Virginia-Highland" without anyone typing it in.

### 🚀 Features
- Full Atlanta-metro neighborhood inventory on the buyer-facing community grid.
- Every community shows a real hero photo, not a placeholder.
- Every community carries a real boundary polygon on the map view.
- Listings auto-associate to whichever neighborhood they fall inside.

### 🔧 Technical
- New admin cache-bust endpoint for import pipelines.

### 📈 Metrics
- 8,679 communities imported. 100% have real photos. 87 cities covered.

## v93.2 — 2026-07-16 — Home tour videos are shorter and smarter

Listing home-tour videos now use Claude vision to pick the best 8-14
photos in a proper narrative order (exterior → living → kitchen → dining
→ bedrooms → baths → outdoor) instead of walking every photo in upload
order. Master bedrooms, kitchen islands, fireplaces and pools get held
longer. The frame keeps a soft blurred background with the photo
animated in front, and a small caption tag ("Kitchen Island", "Master
Suite", …) appears on each clip. If the vision service is unavailable
the renderer transparently falls back to the old full-length flow — no
video ever fails because of it.

## v93.1 — 2026-07-16 — Cleanup: retire dead listing-level POI tables

Followup to v93.0. The listing-scoped POI tables have been dropped from the
database now that nothing reads or writes them. No user-visible change —
this closes out the migration you started when we moved Nearby to the
neighborhood layer.

## v93.0 — 2026-07-16 — Nearby moves to the neighborhood level

The "Nearby" tab on the listing editor is gone. Neighborhood spots (schools,
dining, shopping, and the rest) now live on the community page, where you
review photos and generate bucket videos once for the whole neighborhood
instead of listing by listing. Every listing inside that community
automatically benefits — same videos, no per-listing duplicate work.

Nothing changes on the buyer side. If you had listing-level nearby content in
the works, hop over to the community page and pick it up there.

## v92.4 — 2026-07-15 — landscape caption fix

Landscape nearby videos (schools, outdoor, shopping — any bucket where the
majority of photos are horizontal) were rendering with the archetype template
card missing from every clip. Root cause: caption PNGs were hard-coded to a
portrait canvas, so on a 1920×1080 output canvas the bottom sheet fell off
screen. Now: caption canvas matches video canvas, with landscape-specific
CSS to keep sheets inside the 1080px-tall frame.

## v92.3 — 2026-07-15 — Nearby videos: run the workflow from the community page

### 🎯 What's new
- **New "Nearby" tab on every community you own.** Same triage UI you know
  from a listing — discover POIs within 5 miles, tap through the photo
  lightbox to approve/reject, hit Generate on any of the 14 buckets. The
  render lands once and every listing inside the neighborhood serves it.

### 🧠 Why
- Phase 92 already made nearby videos community-shared under the hood, but
  the only way to actually produce them was still through a listing edit
  page. That was misleading — the output belonged to the neighborhood, not
  to any one house. Now the trigger surface matches the ownership model.

### 🔧 Under the hood
- Copied `NearbyPoiPanel` into `CommunityNearbyPanel` with community-scoped
  server actions (`community-actions.ts` / `community-video-actions.ts`).
- Added three panel-facing helpers on the community-video actions module
  (`getCommunityBucketVideoStatus`, `getCommunityBucketEligiblePhotoCount`,
  `regenerateCommunityBucketVideoNarrative`) so the status-poll + narrative
  regenerate wiring works the same as the listing side.
- Taught `regenerateBucketVideoNarrative` to accept both
  `intent_bucket` (legacy listing) and `community_intent_bucket` (new).
- Owner-only tab (discovery/render both cost external $$).

## v92 — 2026-07-15 — Nearby videos: same content across your whole subdivision + fewer text-only frames

### 🎯 What's new
- **Neighborhood videos are now shared across the community.** When you and
  your neighbor sit in the same subdivision, you now see the *same* "Dining",
  "Schools", "Daily errands" videos — no more per-listing regeneration for
  content that describes the same street. Groundwork ships in this release
  (data model + backend + worker); the UI trigger point moves to the
  community page in the next release.
- **14 lifestyle categories** replace the old 12. New ones surface things
  buyers actually ask about: `asian_community`, `faith`, `work_hubs`,
  `pets`, `daily_errands`, `healthcare`, `transit`.

### 🐛 Bug fixes
- **Landscape photos no longer get squeezed into a narrow band.** Bucket
  videos were rendered vertical 9:16 regardless of the source photo shape,
  so landscape dining/storefront/park shots ended up as ~42% photo + ~58%
  blurred padding. If the input pool is majority landscape, the video is
  now rendered 16:9 natively — the photo fills the frame.
- **Dining videos actually show photos on clip 1 now.** The LIFESTYLE intro
  card on the first clip covered the photo with a full-screen dark
  gradient. All clips now use the bottom-sheet layout, so the photo is
  visible from second one.

### 🧱 Under the hood
- New tables `community_pois`, `community_poi_photos`; new columns
  `community_videos.intent_bucket` + `is_primary`,
  `generated_videos.community_id` (XOR with `listing_id`).
- Two new server actions modules (`lib/poi/community-actions.ts`,
  `lib/poi/community-video-actions.ts`) mirror the listing pipeline.
- Render worker handles both listing- and community-scoped bucket jobs.
- Legacy per-listing bucket path still works (dual-write during Phase 93).

## v90 — 2026-07-15 — Nearby videos: dining photos back, landscape shots keep their shape

### 🐛 Bug Fixes
- **Dining nearby videos now show the restaurant photos.** A regression this
  morning made those videos render as a full-screen title card on every clip
  with the photos hidden behind it. Only the first clip is a title card now;
  the rest show the photo with a text card along the bottom edge.
- **Wide (landscape) POI photos are no longer cropped.** Storefronts, park
  wide-shots, and other horizontal photos were losing about 40% of the image
  to a center-crop. They now show the full picture with a soft blurred
  backdrop filling the rest of the vertical frame.

### 🔧 Technical
- Motion on nearby videos is limited to slow zoom-in / zoom-out for now.
  Horizontal and vertical pans are temporarily off; they were interacting
  badly with the blurred backdrop.

## v88.3 — 2026-07-15 — Admin cache-bust endpoint

Backfill scripts can now nudge the community grid to refresh without
waiting for the natural cache window. A tiny protected endpoint clears
the community-cards cache tag on demand.

---

## v88.2 — 2026-07-15 — A proper community page

We took the community detail page all the way to the buyer-side mock:

- **Demographics** now lead with a small icon (👥 🏠 💵 🎂), reordered so the
  human numbers come first, and age reads as "50 yrs" instead of a bare 50.
- **Vibe** and **What neighbors are into** each get their own card so the
  eye can tell the two taxonomies apart while sharing one calm chip style.
- **Nearby neighborhoods** — a new 2-column card of up to six neighbors,
  each one linking straight to that neighborhood's page when we've seeded
  it, so a buyer looking at Ansley Park can hop to Ardmore Park or
  Brookwood in one tap.
- **Neighborhood map** now uses a slightly more colored basemap and a blue
  boundary so the shape lands the moment your eye reaches it.
- Small readability polish: the city label under the neighborhood name is
  brighter on the hero for better contrast on darker photos.

None of the numbers are invented; anything Nextdoor didn't give us stays
hidden.

## v88.1 — 2026-07-15 — Neighborhood at a glance

- Community pages now show real Nextdoor data for the neighborhood: number of residents, average household income, median age, and homeowner rate — right under the hero.
- Two tag rows below the stats: "What locals say" (Historic, Walkable, Dog Friendly…) and "Popular interests" (Dogs, Gardening, Hiking…) — pulled from what actual residents say about the area on Nextdoor.
- Fields hide themselves when Nextdoor didn't have data for that community — we don't invent numbers.

## v88 — 2026-07-15 — See the shape of your neighborhood

- Every community page now shows a map of the neighborhood boundary below the videos/listings — you can see exactly what area a "community" refers to instead of guessing from the name.
- Uses a clean, muted street map (Carto Positron) with an orange highlight over the neighborhood shape. Loads only when you visit a community page, so there's no cost to browsing.
- Removed two placeholder "friendliness" and "affordability" scores that were seeded from Nextdoor but never shown in the app — we won't publish subjective scores until we have real data behind them.

## v87 — 2026-07-15 — Every community now has a cover

- All 731 Atlanta communities now show a cover photo on browse and detail pages — no more blank tiles.
- Most covers are real neighborhood photos scraped from Nextdoor (tree-lined streets, homes, greenery). A minority share Nextdoor's site-wide default (the Atlanta skyline).
- If a community truly has no photo, the app now generates a colored logo mark from the community's boundary shape as a last-resort fallback.

## v0.83.0 · Fresher background music in generated videos (2026-07-15)

- **Listing videos now pick from 26 tracks instead of 10, organized by vibe.** The auto-generated Home tour used to loop through the same handful of songs; now every render pulls from a curated pool grouped into five moods (Warm Acoustic, Modern Corporate, Luxury Ambient, Chill Electronic, Cinematic) — 2.6× more variety, and no more "wait, I've heard this one already" feeling on the second video you generate for a listing.
- **Music selection now follows a strict SOP.** No jazz, no pop, no vocals, no EDM drops — all tracks are instrumental, 80–100 BPM, and structured to fade out naturally rather than loop. The point is that the music supports the home tour instead of overpowering it.
- Chill Electronic and Cinematic buckets are set up but not yet stocked — coming in the next round of library expansion.

## v86 — 2026-07-15 — Nearby POI videos: no more black bars during pan

- Bucket videos (Schools, Dining, Errands, etc.) no longer show dark letterbox bars on the left/right as photos slide across the frame.
- Every photo now fills the full 9:16 canvas, center-cropped — the same treatment Reels/TikTok use. Pan/zoom moves within a filled canvas so nothing at the edges reveals blur or blackness.
- Landscape POI photos will lose some horizontal content at the edges (kept the center), portrait photos lose some vertical. The subject stays in frame.

## v83.2 — 2026-07-15 — Shared communities, auto-associate

- 731 Atlanta neighborhoods are now public reference data. Buyers, agents, and guests all see them.
- When an agent saves a listing's address, we auto-link it to the neighborhood polygon that contains its lat/lng. No manual community picker needed for the common case.
- Community edit rights now follow business interest: any agent with an active listing in a neighborhood can edit its metadata, not just the creator.
- Removed the "claim community" browse page — the model shifted from claim-to-own to shared-reference.

## v0.82.0 · Video: sound, walk-in POI order, photo counter (2026-07-15)

Three fixes to the bucket-video pipeline based on watching the first real renders:

- **Videos have sound again.** The BGM library was reorganized into vibe subfolders (`a-warm-acoustic/`, `c-lofi/`, `d-uplift/`, `f-ambient/`) in Phase 75, but the worker's picker was still only looking at the top-level directory — which was empty. Renders were silently going out muted. Picker now recurses through all subfolders so the 14 licensed Kevin MacLeod tracks are back in the pool.
- **Video POI order now walks buyer-side into the neighborhood.** Previously photos round-robined across POIs by "how many photos this POI has" — coverage-first, but jumpy in narrative. Now the video visits POIs from farthest to nearest by `distance_m`, and within each POI plays the highest AI-scored shots first. Feels like the camera drives into the community rather than shuffling a deck.
- **Generate/Regenerate buttons show the photo count.** The button now displays `Generate · 14` (eligible pool) or `Regenerate · 9/14` (9 already baked in, 14 currently eligible) so agents can spot when new approvals have accumulated and it's worth re-rendering. Disabled with a tooltip when fewer than 3 photos are eligible.

## v0.81.0 · Photo approve no longer skips the next one (2026-07-15)

- **Fixed the "approve → skip a photo" glitch.** Tapping Approve in the lightbox used to freeze the buttons for ~500ms while the whole POI list re-loaded — a second tap during that window was silently swallowed, making it look like a photo got skipped. Approvals are now optimistic: the ✓ shows instantly, the next photo is immediately tappable, and the server sync happens in the background.

## v0.80.0 · Top-10 per bucket by rating (2026-07-15)

- **Each POI category defaults to its 10 best-rated places.** Discovery can pull 15-30 restaurants or 20+ shops for a busy address — showing them all buried the highlights. Every bucket now shows the top 10 by star rating (ties broken by review count) and offers a "Show all N (M more)" button to expand on demand.

## v0.79.0 · Nearby POI: 14 buyer-persona buckets (2026-07-15)

The Nearby panel used to bucket POIs by straight-line distance — walkable / daily-drive / lifestyle / commute. That answered "how do I get there?" but not "does this house fit my life?". Reworked the taxonomy from a buyer-decision angle to 14 persona buckets:

**Schools · Dining · Nightlife · Shopping · Outdoor · Fitness · Kids & Family · Asian Community · Daily Errands · Faith · Work Hubs · Healthcare · Pets · Transit**

Ordered by prominence (schools first — GA suburb #1 driver). Bucket assignment now reads Google Places `primaryType` instead of computing distance, so a Publix 3 mi away lands in "Daily Errands" and a Whole Foods 4 mi away lands in the same bucket — where buyers actually think about it. `Asian Community` and `Work Hubs` are enum-reserved and get Text-Search filling in a follow-up.

## v0.78.3 · Community delete no longer fails when the community has any leads (2026-07-15)

- **🐛 Bug Fix.** Deleting a community from the dashboard used to fail with a server error if that community had ever received a "Contact" lead from its feed page. Fixed — deleting a community now correctly removes its associated leads along with its videos and photos.

## v0.78.2 · Video row polish (2026-07-15)

- **No more broken-image "?" on new video thumbnails.** Cloudflare takes up to a minute to generate the still after a video finishes processing; during that window the row now shows a neutral film-icon placeholder instead of the browser's broken-image glyph.
- **`walkthrough` is now a proper tag.** The video row's tag line reads `Home tour  [WALKTHROUGH] [AUTO] [LANDSCAPE]` — all chips share the same look, no more mixed plain-text + tags.

## v0.78.1 · Cleaner auto-video label (2026-07-15)

- The Media-tab video row no longer says "Home tour (auto-generated)" in the title. It now shows just "Home tour" with a small **Auto** tag next to `walkthrough` in the meta line — matches the existing Cover / Landscape chip style and stops the title from truncating on phones.

## v0.78 · Nearby tab with per-bucket video descriptions (2026-07-15)

Nearby POI moves out of the Media tab into its own **Nearby** tab (between Media and Marketing). The new tab has two sections:

- **Generated videos** — one card per intent bucket (walkable, daily drive, lifestyle, commute). Each card carries the CF Stream player, generate/regenerate controls, and a manually-triggered **English structured description** synthesized from the tagged photos (intro + numbered scene beats + closing + voiceover script). Ready to hand off to TTS.
- **Nearby POIs** — the existing approve/reject flow, but each approved photo now shows the vision-tagger's caption underneath the thumbnail so agents can spot-check what the model actually sees.

Description generation is a one-click Anthropic call (~$0.01/video). Never auto-fires. No schema change — reuses the existing `generated_videos.narrative` jsonb column.


## v0.77 · Smarter photo picks per bucket video (2026-07-14)

- **Each bucket video gets a fresh 15-photo slate, no duplicates across buckets.** Approved POI photos are now vision-tagged by Claude Sonnet 4.5 as they're approved (~$0.005/photo), which decides which buyer-question buckets each photo actually strengthens. When you generate a bucket video, the allocator round-robins across POIs so one photo-rich place can't hog the video, prefers portrait shots (feed is 9:16), higher-scored photos first, and caps at 15. Hard cross-bucket dedup — a photo used by any live bucket video is excluded from the others, so 4 buckets = ~60 unique photos, not 4× the same slideshow.

- **Regenerate now actually frees up photos.** When you regenerate a bucket, the old `ready` video is marked superseded, releasing its photos back to the pool for the other buckets. Previously the old row kept claiming its photos forever.

## v0.76.6 · Buyer-question bucket videos (2026-07-14)

- **Generate a video per bucket, right on the Media tab.** Each POI bucket header (Walkable / Daily drive / Lifestyle / Commute) has a **Generate video** button. It stitches your approved POI photos in that bucket into a portrait 9:16 slideshow, renders on the EC2 worker, uploads to Cloudflare Stream, and swaps in a **Play video** button when ready. Buyers see the "what can I walk to" story instead of a spreadsheet of nearby places. ≤6 videos per listing, one per buyer question.

## v0.76.4 · Fullscreen photo review (2026-07-14)

- **Tap a POI photo to review it fullscreen.** The old tile approve/reject icons were tiny and hover-only — impossible to hit on mobile. Now a tap opens the photo full-screen with big Approve / Reject buttons and auto-advances to the next photo, so triaging 10+ POI photos takes seconds. Keyboard shortcuts (← → to browse, A / X to decide, Esc to close) and swipe-to-navigate on mobile.

## v0.76.3 · POI photo review tiles now load (2026-07-14)

**🐛 Bug Fixes**
- **POI review tiles now show the actual photos.** Follow-up to v0.76.2 — the imported photos were saved correctly, but the review grid pointed to the wrong storage location so tiles showed broken image icons. Fixed.

## v0.76.2 · Nearby POI photo import (2026-07-14)

**🐛 Bug Fixes**
- **Nearby POIs → Refresh now actually imports photos.** Previously every attempt reported "10 skipped" and no photos landed on the Media tab. Photos now load and appear in pending state for review.

## Phase 76 · POI content pipeline v1 — schema + Media tab UI (2026-07-14)

**What ships**
- Nearby POI section in the listing edit → Media tab. Click **Discover POIs** and the system pulls up to ~120 nearby places from Google (restaurants, parks, schools, grocery, cafes, gyms) inside a 5-mile radius, grouped into intent buckets (Walkable / Daily drive / Lifestyle).
- Per-POI approve / reject with an inline **Fetch photos** action that pulls up to 10 Google Places photos each, presented as a tile grid for approve / reject per photo (with attribution).
- All review actions land in a new `review_events` table together with any AI prediction that produced them — training data for future auto-approval.

**Why**
- POIs + photos are stored globally (deduped by Google's `place_id` / `photo_name`), so the same Publix used by 100 listings costs 1 Google Places fetch, not 100. Warm-cache spend per new listing ≈ **$2.65** vs cold **$4.42**.
- Review is intent-driven, not radius-driven: buyers care about "what can I walk to" and "what's a 5-min drive away", not "everything in a circle".

**Design doc**: `docs/poi-content-pipeline.md`

**Next phase (77)**: Directions API for real drive-time buckets + Claude Sonnet 4.5 vision tag + quality score, wired into `review_events.ai_prediction` so we can start comparing model output to human review.




Newest at the top. Each release covers a meaningful product change visible to users.

## v0.75.3 — 2026-07-11 — Housekeeping

### 🔧 Technical
- Retired the /demo/autofill pitch page and its 10 sample Atlanta listings — the product now runs entirely on real MLS data (or agent-uploaded listings). No user-facing change.
- Archived old HTML design mockups to internal docs. Cleaner repo.

### ⚠️ Known Issues
- None.

## v0.75.2 — 2026-07-11

🚀 Features
- **Rebrand to Percho — everything except infrastructure.** Legal terms, privacy policy, contact page, agents landing, marketing docs, design mocks, and all internal code comments now say Percho. Email addresses and web address will move once DNS is switched. Company name is now written as Percho, Inc. — the legal filing follows separately.

## v0.75.1 — 2026-07-11

🚀 Features
- **We're now Percho.** The app has been renamed from Vicinity to Percho. Same team, same product, new name. All UI, page titles, and footers now say Percho. Emails and web address haven't changed yet — those will move in the next couple of releases.

## v0.75.0 — 2026-07-06

### 🔧 Technical
- 视频渲染改为「一 listing 一个视频」:如果房源照片以横向为主,只生成横屏视频(feed 中带黑边显示,点全屏铺满);否则只生成竖屏视频(feed 中铺满,不再显示全屏按钮)。此前会同时生成两版,存储和编码成本翻倍。
- 清理了历史遗留的 3 条房源:删除多余的竖屏版本,只保留正在使用的横屏版本。用户看到的画面不变。

## v0.74.23 — 2026-07-06

### 🎬 全屏播放
- 点击全屏后不再出现中间的播放按键,视频会在全屏后自动开始播放,不需要再手动点第二下。
- 拆掉了上一版右下角的诊断信息条。

### ⚠️ Known Issues
- 若真机测试仍出现全屏后画面不动,下一版会切换到「不旋转、上下留黑边」的方案,以 iOS 系统级横屏为准。

## v0.74.22 — 2026-07-06

### 🔧 Technical
- 全屏播放画面冻结问题诊断中:强化了解冻手法(布局稳定后再做可见 seek + 兜底重启),并在全屏右下角加了一小块诊断信息(3 秒后消失),用于真机截屏收集数据。此版本本质是诊断版,若确认修复后会拆掉信息条再发正式版。

### ⚠️ Known Issues
- iOS Safari 全屏后仍可能出现「有声音无画面」;若遇到,截图右下角信息条发给团队。

## v0.74.21 — 2026-07-06

### 🐛 Bug Fixes
- 全屏播放:点击全屏进入横屏后,现在图像和声音一起流畅播放。之前会出现「声音在放画面冻住,需要点两下播放键才能全部恢复」,首次点还会误暂停。

## v0.74.20 — 2026-07-06

### 🐛 Bug Fixes
- **Fullscreen tap now plays the video on the first tap.** Previously, a native iOS Safari play button briefly appeared over the video after entering fullscreen (audio was already playing at that moment); tapping it paused the audio, and only a second tap resumed both audio and video. The native browser video-control chrome is now globally hidden so all pause/play UI is app-drawn and behaves consistently.

## v0.74.19 — 2026-07-06

### 🐛 Bug Fixes
- **Fullscreen no longer flashes a play button that pauses the video when tapped.** After tapping fullscreen, iOS Safari transiently reported the video as paused during the style/rotation recalc, which briefly showed the center play button. Tapping it landed on the pause/play toggle after the video had already resumed, so it paused instead of playing. The play button is now suppressed for a short settle window right after entering fullscreen.

## v0.74.18 — 2026-07-06

### 🐛 Bug Fixes
- **Tapping fullscreen now auto-plays the video immediately.** Previously if the tapped card wasn't already playing, the center play button would appear on the fullscreen video and require a second tap. Now the fullscreen tap itself starts playback (with sound if the browser allows, muted otherwise).

## v0.74.17 — 2026-07-06

### 🐛 Bug Fixes
- **Landscape videos now play as landscape from the start of the feed, and tapping fullscreen no longer causes any flash or transition artifact.** Previously the feed played a portrait companion of the same video and swapped to the landscape source only when you tapped fullscreen — that source-swap window was the root cause of every 74.8-74.16 regression (black frame, "small video with play button", overlapping thumbnails, etc). This release lets a single landscape video handle both views: cards with a landscape source play landscape in the vertical feed with letterbox top/bottom (per the object-contain visual rule), and tapping fullscreen just rotates the same video element to fill the screen — no HLS re-attach, no black gap, no overlays. Portrait-only cards keep their existing behavior with no fullscreen button. All the 74.13-74.16 workarounds have been removed.

## v0.74.15 — 2026-07-06

### 🐛 Bug Fixes
- **Fullscreen no longer shows a small landscape thumbnail overlapping the playing video.** 74.14's poster overlay was rendered unconditionally in fullscreen, assuming z-index would keep it hidden behind the `<video>`. In practice on iOS Safari the overlay peeked out from under the video as a small centered landscape image. Fixed by unmounting the overlay the moment the landscape video paints its first frame; it now only appears during the actual black-frame gap of the HLS source swap.

## v0.74.14 — 2026-07-06

### 🐛 Bug Fixes
- **Fullscreen video no longer shows a "black → letterboxed thumbnail → full playback" sequence.** iOS Safari's native `<video poster>` does not respect CSS `object-fit`, so the poster was letterboxing to the rotated fullscreen box's aspect (owner: "黑屏 → 小图 → 大播放"). Fixed by replacing the native poster in fullscreen with a rotated `<img>` overlay that uses `object-fit: cover` and the correct landscape thumbnail. Also preloads the landscape thumbnail while the card is still in the vertical feed, so tapping fullscreen shows the poster instantly instead of waiting for a network round trip. The vertical feed's non-fullscreen behavior is untouched.

## v0.74.13 — 2026-07-06

### 🐛 Bug Fixes
- **Fullscreen video restored to its pre-74.7 clean transition.** Root-cause analysis of the "fullscreen flashes a mini window" regression traced back to v0.74.7 — where a fix for the vertical-feed first-swipe placeholder was accidentally extended to the fullscreen path, which never had that bug in the first place. Every subsequent 74.8-74.12 patch layered another workaround on top. This release removes the gate/overlay machinery from the fullscreen branch and restores the native `poster=` attribute, giving fullscreen the same seamless transition it had before 74.7. The vertical-feed first-swipe fix is preserved for the portrait tile branch where it belongs.

## v0.74.12 — 2026-07-06

### 🐛 Bug Fixes
- **Fullscreen video no longer flickers "big → small → big" on tap.** The viewport size state had two competing writers: the tap handler wrote the correct fullscreen dimensions synchronously, but a follow-up effect immediately overwrote it with the underlying feed section's smaller size, then a resize observer eventually corrected it back. Consolidated to a single source of truth (`window.innerWidth`/`Height`) so the fullscreen video renders at the correct size on the very first paint.

## v0.74.11 — 2026-07-06

### 🐛 Bug Fixes
- **No more flash of the previous portrait frame when tapping fullscreen.** Follow-up to v0.74.10. Even after resetting the "first frame" flag synchronously, the video was still fading out over 150ms — during which its stale portrait-source frame was visible, stretched into the rotated landscape box. Fixed by making the fade asymmetric: video reveals with a smooth 150ms fade-in on the first frame, but hides instantly when the flag flips back off. Applied to all three vertical feeds.

## v0.74.10 — 2026-07-06

### 🐛 Bug Fixes
- **Fullscreen tap now shows the poster overlay from the first frame — no more flash of the old portrait video stretched into the landscape box.** Follow-up to v0.74.9. The rotated poster overlay was correctly sized but its visibility gate depended on a state flag that only reset in a post-render effect, so for one paint the fullscreen render still saw the old "already playing" flag and revealed the raw `<video>` element (still holding the portrait source's live frame). Fixed by resetting the flag synchronously in the tap handler, alongside the viewport measurement, so the overlay covers the swap from render 1.

## v0.74.9 — 2026-07-06

### 🐛 Bug Fixes
- **Fullscreen tap now transitions straight to the landscape video with no small-tile or black-screen intermediate.** Follow-up to v0.74.8. Two overlapping bugs: (1) the fullscreen video was rendering at intrinsic size for one paint because the viewport measurement lived in a post-render effect — fixed by measuring the viewport synchronously in the tap handler before flipping fullscreen state; (2) the black gap during the HLS source swap to the landscape uid was uncovered — fixed by adding a rotated poster overlay that mirrors the fullscreen video's transform, so the landscape thumbnail fills the screen until the first real frame paints.

## v0.74.8 — 2026-07-06

### 🐛 Bug Fixes
- **Fullscreen video no longer flashes a portrait then landscape mini-tile before playing.** Regression from v0.74.7. Tapping the fullscreen button on a `/browse` card briefly showed a portrait-sized poster tile, then a landscape-sized poster tile, then finally the rotated fullscreen video. Cause: v0.74.7's poster overlay was pinned to the card's original bounding box, so it didn't follow the video's fullscreen rotate/resize transform. Fix: skip the poster overlay entirely in fullscreen — the video element still fades in cleanly on first frame, and the transition to landscape is now smooth.

## v0.74.7 — 2026-07-06

### 🐛 Bug Fixes
- **Vertical feeds no longer flash a black screen with a small video + play button on first swipe.** Affected all vertical-swipe feeds — the main `/browse` feed, community video feed (`/c/[slug]/feed`), and the community listings carousel. Symptom was most visible the first time a card came on-screen: a placeholder tile with the system play glyph would flicker for a fraction of a second, then a black screen briefly, then the video would start. Root cause was iOS Safari's default behavior for the video `poster` attribute — the browser overlays a big system play button on it and reveals the black background while the video decodes its first frame. Replaced the `poster` attribute across all vertical feeds with an image overlay that stays visible until the first real frame paints, mirroring the fix v0.74.3 shipped for the horizontal community carousel.

## v0.74.6 — 2026-07-06

### 🐛 Bug Fixes
- **Community video tap-to-pause (follow-up to 0.74.5).** 74.5 shipped a tap-to-pause button but taps didn't actually stop playback — HLS buffering silently resumed the video within ~200ms. Root cause: the pause state and the play retry listeners lived in separate effects, so pausing didn't tear down the retry chain. Rewrote as a single unified play/pause effect matching BrowseFeed's model. Tap-to-pause now works on the community carousel exactly like on `/browse`.

## v0.74.5 — 2026-07-06

### 🐛 Bug Fixes
- **Community video swipe (follow-up to 0.74.4).** Fixed two issues: (1) around the 4th slide the audio would sometimes vanish and only come back after swiping back and forth — the `canplay` fallback was retrying with the video still muted from a previous fallback. (2) Community videos now support **tap-to-pause / tap-to-play** — before this release you couldn't stop a playing community video without leaving the carousel.

## v0.74.4 — 2026-07-06

### 🐛 Bug Fixes
- **Community video swipe (follow-up to 0.74.3).** After swiping to the next community video, the video now actually plays and the previous slide's audio stops. Previously only the first slide played and its voice kept going.

## v0.74.3 — 2026-07-06

### 🐛 Bug Fixes
- **Community video swipe.** Swiping between community videos on a listing no longer flashes the previous frame or shows a black gap before the new video starts — the neighborhood thumbnail now covers the transition until the first real frame is ready.

## v0.71.26 — 2026-07-06

71.25 rAF 用父组件 `setPaused` 通知,但 `paused` prop 在 effect closure 里是旧值,ping-pong 不收敛,播放键还是不消失。改成本地 `domPaused` state,rAF 直写本地,播放键绑本地。父级 `paused` prop 保留给外部逻辑(sound button、swipe 手势等)使用。

## v0.71.25 — 2026-07-06

71.24 拆过头了 —— 横屏全屏播放键回到"播了不消失"。71.15 media event listener 在非全屏够用,但全屏切 src 到 landscape uid 时 iOS Safari 有时不 fire `play` 事件。加回 rAF poll,但**只在 `isFullscreen` 时跑**,非全屏保持 event listener 单驱动。

## v0.71.24 — 2026-07-06

清理 71.16 → 71.22 三个星期堆积的诊断代码 —— 左上角 `vp/vid rect/reactPaused/domPaused/muted/vol` 半透明 pill、`videoDiag` 500ms interval poll、`domPaused` rAF poll 全部拆掉;`onTap` 里 71.21 试过没用的 `currentTime = currentTime` nudge 也删了。71.15 media event listener 已经把 `paused` React state 同步得足够准,rAF poll 是冗余兜底。行为一字未改,只是把排障脚手架卸了。

## v0.71.23 — 2026-07-06

暂停后声音停,再播放却哑巴 —— 71.22 核选项把当前视频 `muted=true, volume=0` 后没解绑。tap 播放分支加两行,`v.play()` 前恢复 `volume=1` + `muted=父级 prop`。

## v0.71.22 — 2026-07-06

暂停后声音继续 —— 诊断显示 `domPaused=true muted=true vol=1.00`,当前 video 已闭嘴,声源必然在别处(邻居预加载卡片或 HLS 残留 audio track)。核选项:tap 暂停时 `document.querySelectorAll('video')` 拿全部视频,每个都 `pause()` + `muted=true` + `volume=0`。

## v0.71.21 — 2026-07-06

播放键播放中不消失(React `paused` state 没跟 DOM 同步)+ 声音跟不上暂停。加 `domPaused` rAF poll 直读 `videoRef.current.paused` 作为播放键 truth,onTap pause 加 `currentTime = currentTime` nudge。诊断 pill 扩展 `reactPaused/domPaused/muted/vol`。(播放键 fix 有效;audio 问题实际由 71.22/71.23 解决。)

## v0.71.20 — 2026-07-06

全屏体验 3 个后遗症修好:X 关闭按钮从视频后面出来了(zIndex 10002 fixed)、
播放键跟着视频一起横躺(rotate 90 + fixed 10001)、点视频真的会暂停音画同步
(`<video>` 加 pointer-events:none 让 tap 穿透到父 div 的 onTap handler)。

## v0.71.19 — 2026-07-06

Fullscreen 视频黑边彻底解决。真凶是 Tailwind Preflight 的全局
`img, video { max-width: 100%; height: auto; }` 把我们 JS 测量的 rotate box
硬 clamp 到父容器宽度。inline style 加 `maxWidth/maxHeight: none` 压过
preflight,rotate 后视频精确铺满视口。

## v0.71.17 — 2026-07-06

Fullscreen sizing now measures the actual container rect (via
`getBoundingClientRect` + `ResizeObserver` + `visualViewport`) instead of
`window.innerWidth/innerHeight`. Fixes the ~30% black bar that appeared on
iPhone Plus/Pro Max (and any device where URL-bar collapse expands the
layout viewport past `innerHeight`). Also fixes tap-to-pause leaving audio
running: fullscreen play-retry effect now stops after playback starts and
respects a user-initiated pause.

## v0.71.15 — 2026-07-06

### 🐛 Bug Fixes
- Fullscreen fill: initialise viewport size on the first render pass so the rotate branch actually applies (previous version's initial 0/0 state let the video render before measurement finished, keeping it looking like the non-fullscreen view).
- Play/pause indicator now stays in sync with the real video state — if iOS Safari pauses the picture but keeps audio playing (buffer stall, src reload), the UI reflects that instead of getting stuck.

## v0.71.14 — 2026-07-06

### 🐛 Bug Fixes
- Fullscreen fill really works now: video is sized in raw pixels from the actual visual viewport (previous dvw/dvh attempt didn't take effect on iOS Safari — Tailwind arbitrary units either fell back to vw/vh or weren't emitted).
- Play button no longer sticks in the middle: the fullscreen player now retries `.play()` across multiple media events (loadedmetadata, canplay, loadeddata), covering iOS Safari's native HLS reload race.

## v0.71.13 — 2026-07-06

### 🐛 Bug Fixes
- Fullscreen horizontal video now truly fills the phone screen with no black bars on top or bottom (previous fix only covered the sides on iOS Safari).
- Video now auto-plays reliably when you tap the "Full screen" button — no more paused play button stuck in the middle.

## v0.71.12 — 2026-07-06

### 🐛 Bug Fixes
- Fullscreen horizontal video now truly fills the phone screen edge-to-edge (previously left thin black bars on tall phones).
- Removed the always-visible play button that was overlaying the fullscreen video — the play indicator now only appears when the video is paused, matching the rest of the feed.
- Property price / address / agent card no longer show over the video while in fullscreen; they reappear when you exit fullscreen.

## v0.71.11 — 2026-07-06

### ✨ Improvements
- The "Full screen" button now sits just below the horizontal photo frame inside the vertical video (at the black-bar boundary), instead of at the very bottom of the page.

## v0.71.10 — 2026-07-06

### ✨ Improvements
- Fullscreen button on the video feed now sits at the bottom of the vertical video with a "Full screen" label instead of a bare corner-arrows icon.
- The centered play/pause indicator is now visible at all times while a horizontal listing plays in fullscreen — no more guessing whether the video is playing.

### 🐛 Bug Fixes
- Removed the "please rotate your phone" Chinese hint that briefly appeared over horizontal videos in fullscreen.

## v0.71.9 — 2026-07-06

- **横版全屏真的横了**:owner "点击全屏 视频还是竖着播放 并且周围的按键都没有了"。71.7 全屏按钮虽然切到了横版 src,但手机竖屏视口把 16:9 视频塞在中间一小条,视觉上还是"竖屏播放上下留黑边"。这次改成:进全屏后视频转 90°、边到边填满整屏;顶部会短暂弹一个"请把手机横过来"提示。用户把手机横过来看画面立即变正、无黑边。iPad 横放 / desktop 视口自动免转,直接横放。周围的 like/save/share 按钮在全屏里被沉浸式覆盖是刻意的 —— 按 X 或 ESC 退出即可恢复。

## v0.71.8 — 2026-07-06

- **Media tab 里能看出哪些 listing 有横版**:owner "如果有横版 要标记一下 让agent知道"。之前 71.7 上线双方向视频后,agent 在 dashboard 看到的还是一个视频卡片,没法判断这个 listing 是不是已经生成了横版。现在:视频卡片标题旁边、Cover badge 旁边多一个蓝色的小标 **Landscape**(hover 有英文说明)。只有真的生成过横版才显示,老 listing / 竖片为主的 listing 不显示。轮询期间横版渲染完毕后,标签会自动出现,不需要刷新页面。

## v0.71.7 — 2026-07-06

- **横向照片 listing 出全屏横版视频**: owner "自动生成的视频是竖屏的 如果照片是横着 那结果上下就会空着 不好 有没有解决方案"。之前所有自动视频都渲染成竖屏 1080x1920,横向房源照片被 blur letterbox 塞进去,上下有一大片模糊留白,画面利用率低。现在:
  - 后台 render worker 会先看这批照片的方向。**当 ≥80% 是横向照片**时,除了原来的竖版还会额外渲染一份 **1920x1080 横版**视频(同一批照片 + 同一首 BGM,只是画布方向不同)。
  - Feed 默认还是竖版,但当这个 listing 有横版时,视频中间偏下(横向照片下缘位置)会出现一个**全屏按钮**。点它会把视频撑满整屏、切换成横版播放,画面完整无留白。
  - 全屏内右上角 ✕ 或按 ESC 退出。
  - 混合方向的 listing(横竖照片各半)不做双渲染 —— 竖版体验反而更连贯。
- 老 listing 不影响:数据库列可空,没有横版就仍然按原路径播竖版。想给某个老 listing 补横版,重跑一次 render job 就有了。

## v0.74.16 — 2026-07-05

- **点击 sheet 外的空白也能收起 More 详情框**: owner "点击 more 出来框框 点击 x 收起 也应该允许点击其他地方自动收起框框"。之前只能点右上角 ✕ 关,现在点上部视频区域(sheet 外的任何地方)也会关掉 sheet。视频不会因此暂停——sheet 关掉后视频保持当前播放状态。技术实现:sheet 外覆盖一层透明 tap catcher(z-40),点它触发关闭并阻止事件冒到视频层的 tap-to-pause。

## v0.74.15 — 2026-07-05

- **Feed 里 More 展开后视频不再被完全挡住**: owner "listing feed 里的 more 拉出来的框框太大遮住了视频全部 搞一半多一点 黄金分割线左右 留一部分视频还可以继续播放"。两处修:
  - **详情框收到黄金比例**:原本占屏 82%,现在 62%(≈黄金分割 0.618)。上部约 38% 让给视频。
  - **移除全屏半透明遮罩**:原本 More 展开后整块屏幕会盖一层半透明黑,视频虽然还在放但被罩得看不见。现在直接删掉遮罩,视频画面清清楚楚地继续播,详情框自己带上边缘阴影做视觉分层。要关闭详情走右上角 ✕。

## v0.74.14 — 2026-07-05

- **Public agent profile 大瘦身:hero 压缩 + grid 对齐全站 canonical**: owner "public profile 里的 grid view 也要改,并且 profile 第一部分的空白太多 减少 尽量多的展现房子内容"。
  - **Hero 压缩**(`app/(public)/a/[agentSlug]/page.tsx`):`py-20 md:py-28`(80/112px)→ `py-8 md:py-12`(32/48px);eyebrow `mb-8` → `mb-3`;头像 20×20 / 24×24 → 16×16 / 20×20;name `display-xl` → `display-md md:display-xl`(移动端不再顶天);内部 `gap-8` → `gap-4/5`;CTA button `px-6 py-3 12px` → `px-5 py-2.5 11px`;bio `mt-8 text-base` → `mt-4 text-[15px]`。整块空白约 **-40%**,portfolio 卡从"要滚半屏"变成上折内可见。
  - **Grid 对齐 canonical**:portfolio 之前跑独立 editorial `ListingCardView`(3-col × `aspect-[4/5]` × `font-serif 22/26 md` × gap-8),74.4 owner 特批的路线;现在 owner 明确要求"grid 也要改 保持统一",换成全站 `ListingGrid`(4-up × 15/11/11 × 更紧 gap)。同时废弃本地 `formatPrice`(K/M 缩写)—— 走 ListingGrid 内置 full-digit,守住 74.10 buyer-surface hard rule。地址走 `formatFullAddress` → `street, city, state`(no zip in dense grid,74.7 canonical)。
- **Editorial 22/26 特批取消**:74.4 那次 owner 想要的是"portfolio 要有编辑感",但 74.14 明确"尽量多展现房子内容"→ 密度优先。canonical 表现在只保留 CaptionCard 26/13/13/13(feed swipe)+ GridCard 15/11/11(其他所有 buyer surface,含 portfolio)。
- **构建**: tsc 无错,next build 干净。

## v0.74.13 — 2026-07-05

- **Dashboard "my listings" hub + community "Homes in XXX" sheet 补齐 audit**: owner "agent hub my listing grid view 需要改 / 截图里的 homes in xxx community 也要改"。74.10 miss 了两处:
  - `app/dashboard/page.tsx`:my listings grid 之前只喂 `address`(street-only),现在 select + 行类型 + mapper 都加 city/state/zip,走 `ListingGrid.formatFullAddress` → `street, city, state`。Draft 保持 `Untitled draft` fallback。
  - `app/(public)/c/[slug]/feed/_components/CommunityListingsSheet.tsx`:74.10 只重排版没换 formatter,`$2.5M/$465K` 仍是 K/M 缩写 —— `formatPrice` 换成 `toLocaleString('en-US')`,和全站 full-digit 规则统一。

## v0.74.12 — 2026-07-05

- **Sheet 里 "Listed by <name>" 现在长得像可点**:agent 名字换成品牌 tan 色 + 下划线,尾巴挂了个 `›` 箭头(hover 时会往右挪一点)。之前纯灰字看起来像 label,不像链接。点进去还是 `/a/<slug>` agent 页。

## v0.74.11 — 2026-07-05

- **Dashboard "my listings" hub + community "Homes in XXX" sheet 补齐 audit**: owner "agent hub my listing grid view 需要改 / 截图里的 homes in xxx community 也要改"。74.10 miss 了两处:
  - `app/dashboard/page.tsx`:my listings grid 之前只喂 `address`(street-only),现在 select + 类型 + mapper 都加 city/state/zip,走 `ListingGrid` 的 `formatFullAddress` → `street, city, state`。Draft 保持 `Untitled draft` fallback(74.5 特例)。
  - `app/(public)/c/[slug]/feed/_components/CommunityListingsSheet.tsx`:74.10 只改了排版没换 formatter,`$2.5M/$465K` 仍是 K/M 缩写 —— 现在 `formatPrice` 换成 `toLocaleString('en-US')`,和全站 full-digit 规则统一。

## v0.74.10 — 2026-07-05

- **全站 grid + feed 地址/字号统一 (audit)**: owner "扫描所有 grid view 和 feed view 的 listing 都按照这个格式更改 保持统一"。 aligned 3 遗留 surface:
  - `app/(public)/c/[slug]/feed/_components/CommunityListingCarousel.tsx`(community 全屏 feed):去 gradient scrim + 去 K/M 缩写,price 26px bold + 单行 `street, city, state zip` + specs 13px,与主 browse feed CaptionCard 完全对称
  - `app/(public)/c/[slug]/feed/_components/CommunityListingsSheet.tsx`(社区 listing 列表卡):去两行 address,合并成 `street, city, state`(sheet 密度紧,不带 zip);specs 移到 address 前面
  - `app/(public)/a/[agentSlug]/page.tsx`(agent portfolio editorial grid):address 单行拼 city/state/zip(editorial 22/26px 字号保留 —— owner 74.4 特批)
- Zip 字段一并加进 `CommunityListingItem` 类型 + `c/[slug]/feed/page.tsx` supabase select + row-typing + mapper,以及 `/a/[agentSlug]` 的 `ListingCard` type + select

## v0.74.9 — 2026-07-05

- **Bottom sheet(点 more 弹的浮层)排版清理**:第二行 specs 和第三行 address 现在字号/粗细一致(15px regular),不再一个 medium 一个更粗;底部 "Listed by" 从 avatar chip 改成右下角单行链接 `Listed by <name>`,占位小很多。

## v0.74.8 — 2026-07-05

- **Feed folded caption 第二/三行 15px → 13px**: owner "feed里除了价格粗体 其他都正常 第二和第三行字体可以再小点跟description一样"。specs / address 从 `text-[15px] font-medium` → `text-[13px]`(去 medium),与 description preview 完全对齐。价格 26px bold 保留。Bottom sheet 内不动(sheet 有背景对比,15/17px 保持可读)。

## v0.74.7 — 2026-07-05

- **Grid caption revert to 11px + drop zip**: owner reviewed 74.6 手机截图,决定 grid 4-up 卡不装 zip,第三行字号回到 11px,和第二行(specs)一致。Feed swipe 卡 + bottom sheet 保留 zip(有横向空间)。`app/_components/GridCard.tsx` sub2 → `text-[11px] tracking-wide opacity-95`。`ListingGrid.formatFullAddress()` 拆掉 zip 分支,输出 `street, city, state`。DB 已核 11 条 active listing 全 zip 有值,feed 的 `${zip ? ' '+zip : ''}` 逻辑无需改。

## v0.74.6 — 2026-07-05

Grid 卡第三行地址字体 11 → 10px + `leading-tight`,让 `{street}, {city}, {state} {zip}` 完整地址在一行内 truncate,不再折行截字。

## v0.74.5 — 2026-07-05

Grid 卡第三行地址对齐 swipe feed:`1619 Tide Mill Road, Cumming, GA 30040` —— street 后加逗号,city 后逗号,state 后 zip。之前 grid 只显示 street,city 前当然没有逗号可看,是根源。`/browse`、`/saved`、`/nearby`、`/c/[slug]`、`/search` 五个入口一并对齐。

## v0.74.4 — 2026-07-05

Caption 层次:只有价格粗体,specs / 地址改 medium。地址加逗号 + zipcode:`1619 Tide Mill Road, Cumming, GA 30040`。原本 DB 一直有 zip 字段,只是 feed 层没拉,现在补上。

## v0.74.3 — 2026-07-05

### 🐛 Bug Fixes
- 横滑时顶部的计数(如 `3 / 8`)和分段进度条不再延迟 — 现在跟着手指实时走。影响两处:listing 卡片里的照片横滑,以及 community 视频轮播。

## v0.74.2 — 2026-07-05

Caption 微调:price 从 30px 降到 26px(不晃眼);address 和 city/state 合并成一行 `7920 NE 26th St Medina, WA`;新增 description 前 40 字符 preview + `… more` toggle,展开走 bottom sheet。

## v0.74.1 — 2026-07-05

Feed 上的 caption 从毛玻璃卡换成沉浸式 pure-text — 不再有边框、背景、阴影卡。第一行 `$8,750,000` 完整数字加粗(不再 `$8.75M`);第二行 `bd · ba · sqft`;第三行街道;第四行 city/state。文本靠双层 shadow 保对比度。

点 More ↑ 才弹浅色 bottom sheet:price / specs / address / About this home / Nearby / Listed by(纯 agent 名,不再硬编码 brokerage)。

## v0.74.0 — 2026-07-05
The listing caption on both photo and video swipes was redesigned for readability. Price, address, specs and the listing agent now sit on a floating frosted-glass card with larger, higher-contrast text — no more thin white text getting lost on bright rooms. Tap "More ↑" to open a light-cream bottom sheet with the full description, nearby schools and points of interest, and the agent card. The sheet slides over the media instead of covering it inline, so you can always see the photo or video underneath while reading. All text meets accessibility standards for size and contrast.

## v0.73.4 — 2026-07-05
Header pills in the community-video and community-listing carousels are 4px shorter (44px → 40px), a lighter touch on the visual weight. Left and right pills remain aligned.

## v0.73.3 — 2026-07-05
Two fixes: (1) The top-right counter pill in the community-video and community-listing carousels is now the same height (44px) as the top-left Back button — the header reads as a single aligned row instead of two mismatched pills. (2) The community-listing carousel's video is now tap-to-pause: tap once to pause (a play indicator appears in the center), tap again to resume. Swiping to a new card always autoplays fresh.

## v0.73.2 — 2026-07-05
Back button in the community-video and community-listing carousels is now a single line — "Back · <address>" instead of stacked "Back" over the address. Cleaner header, less visual noise.

## v0.73.1 — 2026-07-05
Community-video swipe now uses the same native iOS momentum-scroll physics as the photo swipe. Both swipes feel identical: your finger drags the track directly, hard flicks carry through multiple slides, and there's no mid-swipe stutter. Videos still auto-play/pause as they become active, and only the neighbouring three ever mount.

## v0.73.0 — 2026-07-05
Photo swipe stays on native iOS momentum-scroll but the mid-swipe stutter is fixed. Swipe is now debounced to scroll-settle (React tree stays still while your finger is moving), neighbouring photos preload one further, decode runs off the main thread, and every slide is on its own GPU layer. Same physics as before, without the frame drops.

## v0.72.8 — 2026-07-05
Photo swipe header re-aligned to match the community-video swipe layout: Back button top-left, counter pill top-right on the same row, dashed segmented progress on a second row below. Progress is now cumulative (fills as you swipe through) instead of a single-tick indicator.

## Pre-2026-07-06 Archive (compressed)

> Compressed 2026-07-19 during repo cleanup. Original ~132 version entries (v0.32.9 → v0.72.7, 2026-06-17 to 2026-07-05) preserved in git history.

This window covers the run-up to the Keller Williams Atlanta agent meetup and the first end-to-end swipe-feed experience. The app was still called Vicinity throughout this period (rename to Percho landed later, on 2026-07-11).

### Milestone: Initial buyer swipe feed (v0.32.9-v0.35.4, v0.47-v0.48)
- First real vertical swipe feed for buyers, mirroring the TikTok gesture: swipe up from any listing to carry on to the next home in the area, instead of hitting a dead end at a shared link.
- Photo-only listings now flow through the same swipe feed as video listings, so buyers see one continuous stream.
- All grid pages (Explore, Nearby, Saved, Search, per-community, agent dashboard) got a unified TikTok-style card: cover fills the card, price/beds/baths/address overlaid on a soft dark gradient, tight 4-8px gaps so two rows peek onto every phone screen.
- Autoplay with sound is now the default; the in-app mute button was removed in favor of the phone's volume keys.
- Every feed uses the full mobile viewport (no more strip hidden behind Safari's URL bar) and hides the redundant "swipe up" / "← swipe →" hints.
- Tap targets across the top bars, auth pills, and swipe feeds bumped to a comfortable 44×44.
- Navigation between tabs and community cards now feels instant — placeholder skeletons paint immediately and the next page pre-fetches in the background.

### Milestone: Neighborhood (community) feature (v0.34-v0.35, v0.45-v0.49, v0.54-v0.68, v0.66 rename)
- Buyers can tap a community badge on any listing to open a bottom sheet with the neighborhood's name, description, and a horizontal strip of preview videos. Tap a video → fullscreen swipe through the whole community. Back returns to the original listing.
- Reverse direction: on any community feed, a "🏠 Live here" chip opens the list of homes for sale in that community; tap a row and swipe through those homes.
- Community video feeds got the same right-rail as listings (Like / Save / Contact / Share with labels), phone-shaped frame on desktop, and per-video captions.
- Contact button reaches the community's registered owner, or falls back to an agent who has posted listings there when no owner is on record.
- "Community" renamed to **Neighborhood** across the whole app (bottom nav, buttons, page titles, favorites, agent hub, leads, upload flow) — same feature, name that reads better to buyers.
- Agent-side: each community got a hub with Details / Media / Marketing / Analytics tabs matching the listing hub, one-tap Active/Inactive toggle, inline cover picker, per-video captions, and a red Danger zone for delete.
- Community editor form flattened: City and ZIP required, Year built and Price as From/To pairs, cleaner property-type list (Single Family / Townhouse / Condo / Co-op / Multi-Family / Manufactured / Land), Highlights chips, Builder / HOA / Website fields, and richer public-page pitch.
- Owner-only edits: when several agents share a community, each can only edit or delete the videos they uploaded — other agents' videos show with a "by @uploader" tag and read-only thumbnails.
- Inactive (draft) communities are hidden from every buyer surface; the creating agent still sees them in the dashboard.
- Owners can hide a community video without deleting (Private / Archive states); buyer-facing queries were tightened so hidden videos can't leak.

### Milestone: Right-rail redesign across all feeds (v0.45-v0.49, v0.66-v0.69)
- All three feed surfaces (For You listing feed, community video feed, per-community carousel) now use the same right-rail: circle button + label underneath (Like / Save / Contact / Share), same pixel position and safe-area handling.
- Share button moved into the right column at the bottom on every feed, so social actions all live in one place instead of being scattered to the top-right corner.
- Neighborhood button moved from the top-left corner to the top of the right stack — a 🏘️ circle with a red count badge, matching the other action buttons. Buyers testing the app kept missing the old top-left version.
- Action stacks hug the bottom of the frame at the same tight margin on every feed.
- Left-corner "Live here" chip refined into a banner-cut tag with a small green status dot, sitting a quarter of the way down the screen instead of tucked under the top bar.

### Milestone: Swipe feed caption & polish (v0.48, v0.62-v0.65, v0.67)
- Specs read as one line: "3 bd · 2 ba · 1,820 sqft" under the price, with clean separators when a value is missing.
- Description "more" toggle now actually expands the caption on the buyer feed.
- Picking a photo as the cover on a mixed photo+video listing now shows that photo everywhere buyers see the card (grid, Saved, Nearby, Search, community pages).
- Landscape walkthrough videos now show the full picture in every feed — thin black bars on top/bottom instead of getting cropped to fit the portrait frame. Portrait videos still fill the screen edge-to-edge.
- Live-here listing carousel got a Share button on the right rail; the misleading segmented progress bar at the top (a swipe-left/right convention) was removed since that surface scrolls up/down.

### Milestone: Photo swipe polish (v0.72.5-v0.72.7)
- Redesigned photo counter: slim segmented progress bar across the top (one dash per photo, current one lit) plus a compact "04 / 09" counter in the top-right, matching the community-videos carousel style.
- Photo now follows your finger as you drag, with a light rubber-band at the edges. Release with a flick or drag past a quarter of the screen and it snaps to the next photo; otherwise it springs back.
- First time you open a multi-photo listing the stack does a quick shake to hint the swipe.
- Photo swipe was later switched to native browser scroll physics (same technique Instagram, Airbnb, and Zillow use) — momentum, edge bounce, and rubber-band all come from iOS/Android directly, and hard flicks carry through multiple photos.
- Photo-only listings opened from the grid now show the counter and swipe correctly (previously only the shared-link version worked).

### Milestone: Auto-generated home-tour videos (v0.70-v0.71)
- Agents can generate a home-tour video from their listing photos with one click on the Media tab. The button shows queued → rendering → done inline, and rendering takes about two minutes end-to-end.
- Videos are ~24-30 seconds, Ken Burns motion, background music, and reveal the whole photo (not a center-crop): the source photo sits inside a blurred, dimmed version of itself (TikTok/Reels style) so the full image is always visible without black bars.
- Videos are text-free — no price, address, or specs painted onto any frame. The photo speaks for itself.
- Every generated video is scored with a randomly-selected upbeat background track from a 10-track HGTV/vlog-style library (Kevin MacLeod, CC-BY 4.0). Two videos of the same listing typically pick different tracks so a rapid-fire demo doesn't feel repetitive.
- Videos end on the last real listing photo instead of a synthetic "V · Vicinity" card. Real photos in, real photos out.
- 10 curated Atlanta mock listings ($389k–$3.25M) can be seeded into an agent account with one click for demos; buyers see them in the grid + swipe with real videos, all 10 photos, and full metadata.

### Milestone: Agent waitlist + live demo for the KW Atlanta meetup (v0.70)
- Agent waitlist landing page at `/agents` — explains what the product does for agents and captures name, brokerage, email, phone, and city. Designed for the QR-code hand-out at the Keller Williams Atlanta meetup.
- Live autofill demo at `/demo/autofill` — type any Atlanta address and watch it auto-populate a listing card, backed by 10 curated listings across Buckhead, Midtown, West End, Sandy Springs, Old Fourth Ward, Grant Park, Inman Park, Decatur, and East Atlanta Village. Clearly marked as a demo so nobody mistakes it for a live MLS search.
- In-site doc reader at `/internal/meetup` — the whole meetup packet (pitch scripts, Q&A playbook, discovery questions) is now readable from a phone browser, unlisted and not indexed.
- Agent landing page got a small "Curious first? See a demo →" link under the sign-up button, plus a "← Back to Vicinity for Agents" link on the demo page so agents can bounce back to the sign-up flow.

### Milestone: Agent hub rebuild — one place for everything (v0.36-v0.56)
- Every listing and community now opens into a unified hero-cover hub with sticky sub-tabs: Details · Media · Marketing · Leads · Analytics. Edits auto-save; deep-links are shareable.
- Status collapsed to a single Active ↔ Inactive toggle. Draft / published / archived is gone; permanent delete is the sole destructive action, in a red-bordered "Danger zone" block on the Details tab.
- Sub-tabs are circular icon shortcuts with labels underneath — same layout on phone and desktop.
- Media tab combines photos and videos in one card with a single "Click to upload" button that accepts both types in the same pick and routes files by type. Cover picker is inline on each row (⭐ on photos, "Set as cover" on videos).
- New-listing flow: one tap creates a stub listing/community and drops the agent on its edit page. Address is set inline via Google Places autocomplete; the URL slug is generated from the real address. Publishing is gated on address, price, beds, baths, and at least one ready photo or video.
- Listing editor got an explicit Save button (matching the community editor); community editor gained the same 600ms auto-save (matching the listing editor). Save button now stays enabled at all times so it never reads as broken.

### Milestone: Marketing tab — multi-platform, multi-language copy (v0.52)
- Social-copy generator supports nine platforms: Facebook, Instagram, Email, TikTok, X, LinkedIn, Threads, Rednote, and WeChat Moments.
- Generates in five languages natively (not translated): English, Simplified Chinese, Spanish, Vietnamese, and Korean — matched to the multilingual US homebuyer pool.
- Reads the listing's description, photo captions, and video titles before drafting so posts reference real content, not just address and price.
- Save generated copy per listing (up to 50 drafts), rename each draft, edit in place, and "Refine from your edits" sends your current text back to the AI as a seed instead of starting over.
- Token cache: hitting Generate with the same platform + language + selling points returns a saved draft instantly, no AI call.
- Same generator now available for communities on the community hub's Marketing tab, grounded in videos, schools, and nearby points of interest.

### Milestone: Leads inbox + per-listing leads (v0.53, v0.68-v0.71 lead-related)
- "My Leads" is a real table with column headers (Name · Listing · Contact · Source · Received), clickable rows, and per-row source (Listing or Community).
- Contact column has separate Email and SMS icon buttons; each lights up only if the lead shared that channel, and clicking auto-marks the lead as followed-up.
- Buyer contact form now has separate Email and Phone fields instead of one combined textbox.
- ✓ "Mark as followed up" now actually sticks across reloads (previously flipped and snapped back).
- Back link on a lead detail page is source-aware: a listing lead sends you back to that listing, a community lead sends you back to that community — no more losing your place while triaging.
- Per-listing leads panel inside the listing hub now uses the same table pattern as the main inbox.

### Milestone: Analytics tab (v0.42, v0.53)
- Views · Leads · Conversion % as three big cards; conversion hides itself until there's at least one lead so nobody stares at "0%".
- 7-day trend sparkline sits next to the Views number.
- Watch-through ring (video completes ÷ page views) replaces the old Likes card as a better engagement signal.
- 4-step drop-off funnel: Page views → Card views → Video completes → Leads, with step-over-step %.
- Same analytics machinery now scoped per-community on the community hub.

### Milestone: Me page cleanup (v0.66-v0.67)
- For buyers: profile photo, name, email, plus two buttons — Change password and Sign out. Everything else stripped.
- For agents: two clean stacks — Public profile / View analytics on top; Change password / Sign out at the bottom.
- Password change copy rewritten to fit the signed-in context ("To change your password we'll email you a reset link · Send password reset email").
- Sign out visually separated from primary actions so it doesn't sit in the same stack.

### Milestone: Navigation & shell (v0.36-v0.45)
- One nav for everyone: agents and buyers see the same 5-slot bottom bar (Community · Nearby · Explore · Saved/Leads · Me) with Explore as the gold center button. Agents see "Leads" where buyers see "Saved" — that's the only difference. No more "preview as buyer" toggle.
- Center upload FAB opens a clean bottom sheet with two large icon tiles (Album / Camera) and dismisses reliably on outside tap without triggering whatever is behind it.
- Global search across listings and communities from the top-right magnifier.
- Login/signup wordmark switched from a gold-bordered corner button to flat tracked caps in ink, matching the rest of the auth surface.

### Milestone: Showcase pages & poster downloads (v0.38-v0.41)
- Every listing got a shareable showcase page in multiple visual styles (Editorial Magazine, Cinematic Story, Luxury Brochure), with beautiful auto-generated link previews.
- Downloadable vertical posters for each style, sized for phone screens — save and post directly to WeChat Moments, Instagram, or any image-friendly channel.
- Style 1 reworked into a "Listing Dossier" — an information-dense single-page fact sheet with five numbered panels, designed to differentiate from typical Zillow-style layouts.
- (The full "Share as poster" feature was later retired in v0.41 in favor of the direct Public URL sharing path.)

### Milestone: Performance polish (v0.32.9-v0.32.12, v0.57)
- First tap on any bottom-nav or top-header tab now feels instant — the next page's data pre-fetches in the background and a placeholder skeleton paints immediately.
- Community grid loads in milliseconds on repeat visits (60-second cache that auto-refreshes after any create/edit/publish/archive action).
- Every page loads roughly 150-300ms faster after the auth check stopped making a network round-trip on every render.
- Listing editor no longer feels laggy while typing — auto-save still runs, it just no longer drags a full server sync along with every keystroke.
