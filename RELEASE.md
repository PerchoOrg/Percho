# Vicinity Release Notes

Newest at the top. Each release covers a meaningful product change visible to users.
Format matches the standard release template (Features / Improvements / Bug Fixes / Technical / Known Issues / Metrics).

## v0.33.0 — 2026-06-17

### ✨ Improvements
- **Sound is on by default; the in-app mute button is gone.** Videos now autoplay with sound the moment you tap into a feed. The mute toggle that used to live on the right side of every video has been removed — use your phone's volume keys (or the side switch) to control audio. One control instead of two, and the right rail stays focused on the things you actually do (Like, Save, Listings).
- **Buttons feel right under your thumb everywhere.** Every tappable control in the top bars, the sign-in / sign-up pills, the avatar menu, the create-new sheet's close button, and the share / back / search buttons inside the swipe feeds is now a comfortable 44×44 — the size Apple and Google recommend for touch. Smaller targets that were hard to hit on a phone are gone.

### 🔧 Technical
- Foundation pass for upcoming community-discovery features. No new feature surface in this release; the changes below the line clean up sizing tokens, default media behaviour, and navigation invariants so the next release can move faster.

## v0.32.12 — 2026-06-17

### 🐛 Bug Fixes
- **Tapping a tab in the nav now feels instant.** Previously the first tap
  on Communities, Leads, Me, or any other tab from the bottom nav or top
  header had a 1-3 second pause before anything happened. The app now
  prepares the next page's content in the background as you browse and
  paints a placeholder layout the moment you tap — every tab change reads
  as immediate, even on slower networks.

## v0.32.11 — 2026-06-17

### 🐛 Bug Fixes
- **Tapping a community card now responds instantly.** Previously the
  first click on a community in the grid had a noticeable 1-3 second
  pause before the community page started rendering. The grid now
  prepares the next page in the background while you browse, runs the
  page's data lookups in parallel, and paints a placeholder layout the
  moment you click — so the page feels alive immediately even on slower
  networks.

## v0.32.10 — 2026-06-17

### 🐛 Bug Fixes
- **Listing edit page no longer feels laggy while typing.** The form was
  doing a full server-data sync after every autosave, which on slower
  connections caused noticeable keystroke→display delay. Autosave still
  runs (and your edits are still saved 600ms after you stop typing); it
  just no longer drags the rest of the page along with it. Other
  dashboard pages (publish, cover upload, community editor) are unchanged.

## v0.32.9 — 2026-06-17

### ✨ Improvements
- **Drafts and archived listings are now previewable from the dashboard.**
  Tapping a draft's cover (or the new "Preview" button) opens the same
  full-screen video feed buyers see, with a banner at the top reminding
  you it's a draft and only you can see it. Archived listings open the
  same preview with a muted banner explaining the public link is
  offline — no more dead-ends.

## v0.32.8 — 2026-06-17

### ✨ Improvements
- **Dashboard cover thumbnails are now clickable.** On your listings list,
  tap the cover image to open the public listing page in a new tab — same
  destination as the "View" button on the right. Drafts and archived
  listings stay non-clickable since they don't have a public link yet.

## v0.32.7 — 2026-06-17

### ✨ Improvements
- **Consistent badges on the community page.** The "videos" and "active
  listings" tags below the community description now share the same pill
  shape and gold accent, each with a small icon. "5 videos" reads
  "5 community videos" so the two labels parse symmetrically.

## v0.32.6 — 2026-06-17

### ✨ Improvements
- **Cleaner community-feed right rail.** The "view listings" shortcut is now
  a small house icon button matching the Like / Save / Mute style, with the
  number of available homes shown as a gold badge on its corner. It sits
  directly below the heart so the rail looks like one consistent column
  instead of a mix of pill + circles.

## v0.32.5 — 2026-06-17

### ✨ Improvements
- **Jump straight from a community's videos to its listings.** While
  swiping through a community's neighborhood videos, you'll now see a gold
  "N listings" pill on the right-rail. Tap it to go directly to that
  community's homes for sale — no need to swipe back to the community page
  first. The pill hides itself if the community has no active listings.

## v0.32.4 — 2026-06-17

### 🐛 Bug Fixes
- **Community page now shows the correct active listing count.** A community
  page was reading "0 active listings" even when active listings existed in
  that area. The count is now accurate.
- **"N active listings" badge now opens the right page.** Tapping the badge
  on a community page used to drop you onto the global Explore grid. It now
  opens an Explore grid filtered to listings inside that community, with
  the header reading "Listings in &lt;Community Name&gt;".

## v0.32.3 — 2026-06-17

### 🐛 Bug Fixes
- **Nearby video swipes now stay inside the community pool.** On a listing
  page, once you tapped Nearby and started watching the neighborhood's
  videos, swiping down would skip you out to the next listing instead of
  cycling within that community's videos. Now both up and down swipes loop
  inside the Nearby pool until you tap out — matching how the upward swipe
  already behaved.

## v0.32.2 — 2026-06-17

### 🐛 Bug Fixes
- **"View ↗" from your dashboard now returns you to your dashboard.**
  Previously, tapping the back arrow on the public listing page sent you
  to the public explore feed instead. Agents stay in their workspace.

## v0.32.1 — 2026-06-17

### ✨ Improvements
- **Swipe feeds now loop forever.** Both the main listings feed and a community's video feed used to hit a hard stop after the last card — you'd swipe up and nothing happened. Now they wrap around endlessly, the way TikTok and Reels do, so you can keep flicking without thinking about where the catalog ends.
- **Community swipe surface cleaned up.** The action buttons (Like / Save / Sound) on a community video now sit in the bottom-right, the same spot they live on a listing — consistent across the app instead of two different layouts. Filenames like `Community_with_pool.mp4` no longer leak onto the screen; you see the category description instead.

### 🐛 Bug Fixes
- **Sign-in pill no longer overlaps the share button** in the community video feed header. The global account chrome is hidden inside the immersive feed, same as on the listing feed.

## v0.32.0 — 2026-06-17

### ✨ Features
- **Pick a cover for each community.** Every community now has an editable cover that shows up on the buyer-facing community grid, on the community page itself (as a wide hero banner), and on the Saved page. You can either pick one of the community's own videos as the cover (the auto-generated poster frame is used) or upload a custom photo. Clear it any time to fall back to the first video. The community grid switched from a text-only list to tall 9:16 cards — a buyer can now scan twelve neighborhoods visually before tapping in.

## v0.31.1 — 2026-06-17

### ✨ Features
- **Saved Communities now show up on the Saved page.** The Saved page split into two tabs — Listings and Communities — each with its own count and its own empty state. Tap any saved community and you drop straight into its swipe feed. Cover thumbnail is the first video in that community, so even at-a-glance the page reads as "neighborhoods I'm watching" rather than a flat bookmark list.

## v0.31.0 — 2026-06-17

### ✨ Features
- **Save a community as your starting point.** Tap the bookmark on any community's swipe feed to save the whole neighborhood — not a single house, the area itself. The idea: you fall in love with a place first (the schools, the walks, the food), then look for homes inside it later. Saved communities live alongside saved listings and persist across visits on the same device.
- **Swipe a community's videos.** Tapping a tile in a community's video grid now drops you straight into a vertical, full-screen swipe feed of just that community's videos — schools, walk-the-block tours, eating-out spots — back-to-back like a Reels feed. Hit back to return to the community page where you came from.

### 🐛 Bug Fixes
- **Tile-tap on a community page used to land you in the listings feed.** That was wrong — you tapped a community video, you should swipe community videos. Fixed: it now opens the community video feed at the exact video you tapped.
- **Back arrow inside the community swipe feed used to send you to the global Explore page.** Now it returns to the community page that launched you.

## v0.30.2 — 2026-06-16

### 🐛 Bug Fixes
- **Rural addresses no longer break the New-listing form.** Picking a Texas county-road address (and other unincorporated rural US addresses) used to surface a single red `Error: invalid_input` next to the submit button — Google returns no city for those addresses, the form silently rejected the submission, and there was no way to tell which field was wrong. Now the form fills the city from the county when Google can't give a proper city, and if any field is still invalid you'll see exactly which one (`city: …`, `state: …`, etc.) inline so you can fix it before retrying.

## v0.30.1 — 2026-06-16

### 🐛 Bug Fixes
- Inside a single community's swipe feed, the right-side action bar no longer offers a "Nearby" button. You're already inside one community, so jumping into its community videos from there was a no-op shortcut to the same content. The button stays where it belongs — in the global feed.

## v0.30.0 — 2026-06-16

### ✨ Features
- **Tap a community video → swipe its homes.** On a community page, tapping any video tile now drops you straight into the swipe feed filtered to active listings inside that community. Before, the tile sent you back to the global feed; now it acts like a "homes here" shortcut. If a community has no active listings yet, you fall through to the full feed so you're never staring at a blank screen.
- **One video, multiple communities.** When agents upload a community video, they can now also tag it into other communities they manage. A walk-the-block tour that's relevant to both Foster City and San Mateo Park, for example, can be tagged once and will appear under both `/c/foster-city` and `/c/san-mateo-park` without re-uploading. Cap is 10 extra communities per video; the upload UI shows them as chips you tap to toggle.

### 🛠 Improvements
- The agent upload flow now lists every other community you can tag a video into, sorted alphabetically, in a clean chip row below the uploader. No menus, no re-picking categories — drop the video, tap the neighborhoods it belongs to, done.

### 🧪 Known issues
- The existing video editor doesn't yet show or let you edit which extra communities a video is tagged into after upload. For now, set the tags at upload time. An "edit tags" UI is a follow-up.

## v0.29.0 — 2026-06-16

### ✨ Features
- **Community is now the front door.** The buyer's bottom navigation has been redesigned around what people actually come to Vicinity for. The leftmost tab is now **Community** — a grid of every neighborhood we cover, each opening into a landing page with all the videos for that area and a one-tap shortcut to "see active listings here." This is your storefront for an area, not just a side feature.
- **A tappable Explore button in the middle of the nav.** The center of the buyer's bottom nav is now a raised gold action button that goes straight into the swipe feed — the way Instagram puts the "create" button in the middle. Browsing listings is what buyers come to do, so it gets the most prominent spot.
- **Agents have a Community tab too.** Your bottom nav now shows: Dashboard · **Community** · ＋New · Leads · Me. The new Community tab opens your community management page (the same one you use today for uploading neighborhood videos), so it's one tap instead of two.
- **Preview as buyer — without signing out.** Open your profile page and tap **Preview as buyer**. The whole site flips to the buyer view (community-first nav, no dashboard chrome) so you can see exactly what your clients see. A gold banner across the top reminds you that you're previewing; tap **Exit preview** any time to return to your dashboard. Your account, listings, and login session are untouched — this only changes what you're looking at.

### 🛠 Improvements
- **The "Home" tab is gone, replaced by Community.** Home was just the listing browser; now the listing browser lives behind the new center button, and the leftmost tab is the more meaningful Community.

### 📋 Known Issues
- Tapping a video on a community page opens the general swipe feed (it doesn't yet filter to that one community's videos). This is the next change.
- A video is currently tied to one community at upload time. Soon you'll be able to tag a video to multiple communities (e.g. a school-run video that belongs to two adjacent neighborhoods).

## v0.28.6 — 2026-06-16

### ✨ Improvements
- **Cleaner top of the listing edit page.** The two utility links (View public link, View analytics) are now stacked in the top-right corner instead of buried below the address. The View public link is one-tap copy/share — on mobile it opens the share sheet so you can send it straight to a client.
- **Status row is now one line.** "Status: published" and the Unpublish / Archive buttons share a single row instead of a tall block. The duplicated "Required to publish…" hint is gone (it was already shown right below in the form).
- **Less noise on every form field.** The "Optional" badge on every non-required field is gone. Required fields show a small red `*` next to the label instead of a red pill that read "* Required". Easier to scan, same information.

## v0.28.5 — 2026-06-16

### 🐛 Bug Fixes
- **Archived tab now actually filters.** Previously the Archived tab on the dashboard was showing non-archived listings — clicking it didn't narrow anything down. It now shows only archived listings.

### ✨ Improvements
- **Three listing tabs instead of two.** The dashboard now has separate Draft / Published / Archived tabs (it used to merge Draft + Published into one "Active" tab, making it hard to see at a glance which listings were still unfinished). Each tab shows a count next to its name, and the default view is Published.

## v0.28.4 — 2026-06-15

### 🐛 Bug Fixes
- **Nearby videos now advance on Mac/desktop.** Previously the pool only responded to a finger-swipe, which doesn't exist on a laptop trackpad or mouse. Now scroll-wheel / two-finger trackpad scroll cycles through the videos, and on-screen up/down buttons appear in the middle of the card so a click works too.

### ✨ Improvements
- **Shorter gold tag.** The neighborhood pill in the top-left corner now shows just the category name (e.g. "Walk the Block") — the long descriptive blurb that wrapped onto a second line has been removed.

## v0.28.3 — 2026-06-15

### ✨ Improvements
- **Nearby videos now swipe up-and-down, like the rest of the feed.** Tap Nearby on a listing and the neighborhood videos stack vertically — the same gesture you already use to move between listings, just inside one listing's pool. No more switching wrist directions mid-session.
- **Cleaner overlay.** The duplicated "Walk the Block" labels are gone; each Nearby video now shows a single gold category pill at the top-left of the screen (with a small "1/3" counter so you know your position in the pool). The price and address at the bottom are left alone — your eye goes there for the listing, top-left for the neighborhood story.
- **No more redundant "NEARBY" banner.** The standalone label at the top center has been removed — the active gold Nearby button on the right rail already tells you which mode you're in.

## v0.28.2 — 2026-06-15

### ✨ Improvements
- **Sharper video on the swipe feed.** Videos now start at full HD instead of climbing up from the lowest quality. On fast swipes the picture stops looking soft.
- **Sound turns on with your first tap.** The browser still requires a tap before it'll let any website play sound, but now any tap, swipe, or key press on the feed flips sound on automatically — you don't have to hunt for the Sound button.

## v0.28.1 — 2026-06-14

### 🐛 Bug Fixes
- **Community form now tells you which field is wrong.** Previously, if you typed a 1-character community name (or anything else that failed validation), the form just said "Error: invalid_input" next to the submit button — no hint as to which field, no rule. Now the offending field gets a red border and an inline message like "Name must be at least 2 characters" right below the input. The same pattern applies to City, State, and Description on both the New Community page and the Edit Community page.

### ✨ Improvements
- **Helpful hints under inputs.** The Name field now shows "2–120 characters" as a quiet hint before you type, so you know the rule before submitting.
- **Errors clear as you fix them.** Typing in a field that was flagged as invalid removes the error immediately — no need to wait for another submit to confirm you've fixed it.

## v0.28.0 — 2026-06-14

### 🚀 Features
- **Browse feed redesigned for full-immersion viewing.** Like, Save, and Contact moved off the bottom bar and into the right side of the video, stacked vertically like the patterns you see on TikTok and Xiaohongshu. The bottom of the screen now belongs entirely to the listing — price, address, beds/baths/sqft, and the agent's description sit on a clean gradient that runs all the way to the edge.
- **One Nearby button, twelve neighborhood stories.** The old triple set of buttons (Schools / Nearby / Area) is replaced by a single **Nearby** action. Tap it on any listing that has community videos, and the feed switches into a swipeable stream of those videos. Each one is tagged with one of the twelve neighborhood categories (School Run, Daily Errands, The Park, Eating Out, Get Active, Transit Reality, Walk the Block, Listen Here, Morning Rush, After Dark, Hidden Spot, Local Pick) and a short blurb explaining what the buyer is seeing — no more guessing whether the clip is about traffic, dinner, or a school drop-off.
- **Photo listings have Nearby too.** Listings that haven't uploaded a hero video yet now get the same right-rail (Like / Save / Contact / Nearby) over the photo carousel, so buyers can still dive into community videos from a photo-only listing.

### ✨ Improvements
- **Listings with no community videos** show the Nearby button greyed out, so buyers know nothing's hiding behind the tap rather than seeing an empty page.
- **Like turns rose-pink, Save turns gold** in the right rail — small visual cue so the two actions are distinguishable at a glance.

### 🔧 Technical
- Backward-compatible with pre-categorization community videos: legacy `SCHOOL` / `NEIGHBORHOOD` / `POI` rows are mapped to the closest of the twelve categories so nothing disappears from existing listings.

---

## v0.27.1 — 2026-06-14

### ✨ Improvements
- **Nearby search radius is now a slider.** On your profile, the "Nearby search radius" preference is a draggable bar instead of a dropdown — pick any value from 1 to 100 miles, with the current pick shown live next to the label. Your previous setting carries over.

## v0.27.0 — 2026-06-14

### 🚀 Features
- **Profile pictures.** You can now set an avatar from your profile page, both as an agent and as a buyer. Pick from six built-in house illustrations in the Vicinity gold-and-cream style, or upload your own photo — the editor lets you drag and zoom to crop a square, then saves it as a small, fast-loading image. The avatar shows up in the top-right circle on every page, in the desktop header dropdown, and (for agents) on your public `/a/<slug>` page. A "Remove avatar" link reverts to the letter-initial circle if you change your mind.

---

## v0.26.1 — 2026-06-14

### 🐛 Bug Fixes
- **Public listing video page no longer stretches across the desktop browser.** Videos now show in their natural mobile portrait size, centered on the page — same experience whether you open the link on phone or laptop.

---

## v0.26.0 — 2026-06-14

### 🚀 Features
- **Desktop browser now has a proper top navigation.** When you open Vicinity
  on a Mac or PC, you'll see a sticky header with the Vicinity logo, the same
  tabs you have on mobile (Home, Explore, Saved, Nearby for buyers; Dashboard,
  Leads, "+ New" for agents), plus a "Sign in / Sign up" pill for visitors
  and an avatar dropdown for signed-in users. Previously the desktop view of
  Explore / Saved / Nearby / Profile had no navigation at all — you could only
  reach those pages by typing the URL. This is now fixed.
- **Agents get a "+ New" dropdown in the desktop header.** Quick access to
  list a property or add a community video without leaving the current page.

### ✨ Improvements
- **Mobile experience unchanged.** The bottom tab bar and top-right avatar
  are exactly as they were — desktop just got the equivalent surface up top.

## v0.25.4 — 2026-06-14

### ✨ Improvements
- **Removed all user-facing "slug" fields and labels.** When you create a
  new community, you only enter a name now — the URL is generated for you.
  The slug labels that used to appear under listing and community headers
  are gone. URLs themselves haven't changed.

## v0.25.3 — 2026-06-14

### ✨ Improvements
- **Buyer profile page redesigned.** If you're signed in as a buyer, your
  Profile page now lets you edit your display name inline (tap to change),
  and the page is reorganized so your settings and search-radius preference
  sit above the Explore / Sign out buttons.

## v0.25.2 — 2026-06-14

### ✨ Improvements
- **Edit your name and brokerage from your profile.** Tap your name (or
  brokerage) on the Profile page to rename it. Changes show up immediately on
  your public agent page too.
- **Profile page reorganized.** Your settings and preferences are now above
  the dashboard / sign-out buttons, so the things you read are on top and
  the things you tap are at the bottom.

---

## Release Notes - v0.18.2

**Release Date:** 2026-06-14

### Improvements
- **Community upload — category picker is now a visible grid.** The dropdown
  has been replaced with a side-by-side grid showing all 12 categories at
  once. Left column is "Only on Vicinity" (the scarce-content bucket); right
  column is "Real look at the data" (the visceral layer over Zillow numbers).
  One click switches both video and photo upload to the new category.
- **"Already uploaded" lists collapse by default.** On a community's upload
  page, both the video and photo grids start collapsed. The upload action
  stays above the fold; click "Already uploaded (N)" to expand and review
  past content.

---

## Release Notes - v0.18.1

**Release Date:** 2026-06-14

### Improvements

- **Communities list shows what each community is actually about.** Each row now displays the community description right under its city/state, so you can tell your communities apart at a glance instead of relying on slugs alone. If a community has no description yet, the row says so and nudges you toward the Edit action.
- **Edit comes before Upload on the communities list.** Small order tweak — when you come back to a community, you're more often opening it to tweak details than to drop a new file, so Edit is now the first action on each row.
- **One category picker for both video and photos.** Going to a community's upload page used to ask you to pick a category twice — once for the video uploader, once for the photo library. Now there's a single dropdown at the top that drives both. Pick "Walk the Block" once, drop a video and a stack of photos, everything gets tagged the same way. Switch the dropdown to upload a different category.
- **Photo library is now visible by default.** It used to be hidden behind a "Photo library" toggle below the video uploader. Now it sits right under the video panel, so it's obvious you can drop both kinds of files in the same session.

### Why

Vivian flagged two things while walking through the dashboard: the communities list felt visually thin (no way to remember which community is which without reading the slug), and having to pick the same category twice on the upload page was busywork. Both of these are small fixes individually, but they compound — fewer clicks, less re-reading, more time on the actual work.

### Known Issues

- The New Community form doesn't yet ask for a description at creation time — you have to fill it in via Edit afterward. That's coming next.

---

## Release Notes - v0.18.0

**Release Date:** 2026-06-14

### Improvements

- **Photos now get a category, just like videos.** When an agent adds photos to a community's private library, they pick one of the same 12 categories the video uploader uses ("Walk the Block", "School Run", "After Dark", and so on) before dropping the files. Pick once, drop a stack, all of those photos are tagged. The picker stays put so you can switch categories and drop another stack. Each photo shows its category as a small label on the thumbnail, and the upload button updates to read "Add photos as <Category>" so the current selection is impossible to miss. Existing photos in the library are migrated automatically to a sensible default and can be deleted/re-added if the agent wants a more specific tag.

### Why

Photos in this library aren't shown to buyers — they're raw material the platform can use to assemble community videos later. Tagging them at upload time means we don't have to look at the pixels later to figure out what they show. It's the same reasoning behind the 12-category video picker we shipped earlier this week, just applied to the photo side.

### Known Issues

- The video uploader and the photo library still each have their own category selector. If you upload both a video and a stack of photos for the same place in one sitting, you'll pick the category twice. We may merge them into a single shared selector at the top of the upload page later.

---

## Release Notes - v0.17.0

**Release Date:** 2026-06-14

### Improvements

- **One Upload button, one upload page.** The community editor used to have separate `+ Add video` and `+ Add photos` actions that opened different screens. Now there's a single `+ Upload` button on every community card and inside the editor; it opens a unified page where the video uploader (with the 12-category picker) is the primary panel and the private photo library sits underneath as a collapsible section. Less context switching.
- **A simpler community editor.** The Schools and POIs management sections are gone from the editor. They were rarely touched and made the page long; the page is now the metadata form plus the Upload button. Existing schools/POIs already in the database keep showing up everywhere they always did — only the dashboard's add/edit/delete UI is hidden.
- **Address instead of coordinates.** Uploading a community video now asks for an optional plain-English address (e.g. *Smith Park, 123 Main St*) instead of a "link to a POI" dropdown. If you skip it, the page quietly uses your phone's location for our Nearby radius search — you never see coordinates, and nothing is required.
- **Old links keep working.** The previous per-community `/videos` and `/photos` URLs now redirect to the new upload page, so any saved bookmarks or pasted links land in the right place.

### Known issues

- The "Add a property / Add a community video" sheet on the buyer-facing home screen still uses placeholder copy — naming pass coming next.

---

## Release Notes - v0.16.0

**Release Date:** 2026-06-14

When you upload a community video, you now choose from **twelve content categories** instead of three. We split them into two groups so you can see at a glance which kind of content you're contributing.

### ✨ Features

**Twelve categories, two buckets**

We replaced the old "school / point of interest / neighborhood" picker with a richer taxonomy:

- **"Only on Vicinity"** — six categories that capture what no other platform shows: a continuous block walk, a 30-second silent listen, the morning school-run traffic from the gate, what the area looks like after dark, a hidden spot tourists never find, and a personal-favorite local pick.
- **"Real look at the data"** — six categories that put a human face on numbers buyers can already pull from Zillow / Google: school traffic, daily errands, parks, restaurants, gym & rec, and transit reality.

When you pick a category, we show you in plain English what the video must include — for example, "Listen Here" requires you to keep the camera still and stay silent for at least thirty seconds, "Morning Rush" requires a dashcam-style timestamp, etc. Today these are guidelines you read; we don't auto-reject yet.

**A category for every existing video**

If you've already uploaded community videos, we mapped each one to a sensible default category and flagged it `needs review`. Open the community editor, find the yellow "needs review" badge next to any old video, and re-pick the right category. We didn't want to silently lose your old uploads while we change the menu.

### 🛠 Improvements

- The "already uploaded" list under the upload form now shows each video's category label (no more cryptic "neighborhood") and surfaces the `needs review` flag inline.
- The school / point-of-interest link selector now appears only when the chosen category makes sense (school link for "School Run" only; point-of-interest link for the rest).

### ⚠️ What's not in this release

- This change ships in the **agent dashboard only**. The buyer-facing community page that shows all twelve tiles in a grid is the next deliverable.
- No automatic content checks yet — we trust you to keep "Listen Here" actually silent and "Morning Rush" actually timestamped. Enforcement comes later.
- No "you must fill at least N categories before this community goes live" gate. You decide when a community is ready.
- No scoring, no ranking, no "best of" lists. We are building the content layer first; the rating layer is later.

### 📊 What to expect operationally

Existing community videos still play, still have thumbnails, still show up where they did before — they now also carry a category and a "needs review" flag so we can clean them up over time. New uploads land directly in the new categories.

---

## Release Notes - v0.15.1

**Release Date:** 2026-06-14

Photo-only listings can now pick a cover photo. Until now, only listings with a video could choose a cover; if you only had photos, the listing had no face — its dashboard card showed blank.

### 🐛 Bug Fixes

- **Photo-only listings had no cover** — listings with photos but no video used to render with a blank cover thumbnail on the dashboard. They now always have a cover available.

### 🚀 Features

**Pick any photo as the cover**
- Hover any photo in the edit page's Photos section and a star icon appears in the top-right of the tile.
- Click the star to set that photo as the listing's cover. The active cover gets a gold border, a "Cover" badge, and a filled gold star.
- Click the filled star again to clear the cover.
- The chosen cover shows up everywhere the listing renders — the dashboard list, the public agent page, the swipe feed, the listing detail page.

**Cover swap is automatic**
- Each listing has one cover. Setting a photo cover replaces a video cover (and vice versa) — pick whichever face you want, switch any time.

### ✨ Improvements

- The Photos section header now hints that the star icon sets the cover, so the feature is discoverable without reading docs.

### Known Issues

- None.

---

## Release Notes - v0.15.0

**Release Date:** 2026-06-14

Agent dashboard home is now a real dashboard, not a task list. The three big buttons at the top (Add a property / Pick a community / View leads) duplicated what the bottom nav already does — they're gone for agents who already have listings, and replaced by three cards that actually tell you how your business is doing.

### 🚀 Features

**State-aware dashboard top**
- **New agents (no listings yet)**: still see the original three call-to-action cards, so the path to "add your first listing" stays obvious.
- **Active agents**: see three live cards instead.
  - **🔥 New leads · 24h** — count of leads from the last 24 hours, plus the most recent lead's name and how long ago it came in. Tap to jump to the full Leads list.
  - **This week** — total views this week with saves and leads underneath, plus a week-over-week trend (e.g. "↑ 23% vs last week").
  - **🏆 Top listing** — the address that's getting the most views this week, with its view and lead count. Tap to open that listing's analytics page.

### ✨ Improvements

- The Add Listing and New Community Video entry points stay reachable through the gold "+" button in the bottom bar, so removing them from the dashboard top costs nothing.
- "Empty" states are honest — if there are no leads, the card says so. If there are no views yet this week, it says "Waiting for first views…" instead of showing zeros.

### 🔧 Technical

- Saves come from the persistent saved-listings store (the swipe-❤ system shipped last release), not a "likes" event — the dashboard now reflects what buyers actually keep, not what they tap past.

### ⚠️ Known Issues

- The "new leads" badge is currently a fixed 24-hour window. A future release may switch it to "since you last opened the dashboard" once that's worth the extra plumbing.

---

## Release Notes - v0.14.0

**Release Date:** 2026-06-13

Bottom navigation redesign. The mobile bar drops from eight items to a tidy five, with a single gold "+" button in the center for agents and a new Saved tab for buyers. Profile moves to a small avatar in the top-right corner.

### 🚀 Features

**Cleaner mobile navigation (5 tabs)**
- **Buyers**: Home · Explore · Saved · Nearby · Me
- **Agents**: Home · Dashboard · ⊕ New · Leads · Me

The "+" in the agent bar is a raised gold button. Tap it and a sheet slides up offering **+ New Listing** or **+ New Community Video** — no more two adjacent plus icons fighting for attention.

**Saved tab for buyers**
A new heart-icon Saved tab gives buyers a place to find listings they've kept for later. The page itself is a placeholder for now ("Your saved listings will appear here") — saving listings to your account ships in the next release.

**Top-right avatar menu**
Your initial now appears as a small gold-ringed circle in the top-right corner of every mobile page. Tap it for quick access to Profile and Sign out without hunting through the nav. Signed-out visitors see a "Sign in" pill in the same spot.

### ✨ Improvements

- The **Profile** label in the bar is now **Me** — shorter, frees up nav space, matches the avatar pattern.
- Both buyer and agent views share the same five-slot skeleton, so the bar layout doesn't shift when you sign in or change accounts.

### 🔧 Technical

- Single `BottomNav` component drives both role variants based on whether the signed-in user has an `agents` row.
- New `/saved` route ready to be wired to a real saved-listings table in a follow-up release.

### ⚠️ Known Issues

- Tapping the heart while watching a listing still keeps the save in-memory only — it won't show up in /saved yet. Persistence ships next.
- The avatar shows the first letter of your agent name (or email). Custom avatar images are not in V1.

### 📈 Metrics

- Mobile tab count reduced from 8 → 5 (–37%).
- Bundle: shared chunks unchanged at 87.3 kB; `/saved` adds 187 B.

---

## Release Notes - v0.13.0

**Release Date:** 2026-06-13

Leads inbox upgrade. The /dashboard/leads page graduates from a flat list to a triage view, with a one-click follow-up tracker so you can see at a glance who's still owed a reply.

### ✨ Features

**Follow-up tracking**
Every lead now has a "Follow up ▾" button right on the row. Open it and you get three options:
- **📧 Email reply** — opens your mail client pre-filled with the lead's name and listing address
- **💬 Text message** — opens an SMS draft on phone-equipped devices
- **✓ Mark as followed up** — log the contact without leaving the page

Clicking Email or Text **automatically marks the lead as followed up** — the click is the intent, no extra confirmation needed. If you click by mistake, open the lead and use "Mark as new" to revert.

**Stats strip**
The page now opens with four counters: Total · This week · Pending email · Awaiting follow-up. The two action-relevant ones (This week, Awaiting follow-up) are gold-accented so you can tell at a glance what needs attention.

**Filter chips + search**
- Chips: All · Awaiting follow-up · This week · Pending email — each with a live count.
- Search box matches across name, email, phone, message, and listing address/city.
- Followed-up rows dim to 60% opacity so they fade into the background without disappearing.

**Export to CSV**
A new "Export CSV" button in the header downloads every lead — name, email, phone, listing, message, status, and follow-up timestamp — in a spreadsheet you can open in Excel, Numbers, or hand off to a CRM.

### 🛠️ Improvements

- The "← Listings" backlink is gone — Listings is already in the top nav.
- Status pill is now three-state (`pending` → `new` → `followed up`) on both the list and the detail page.
- Realtime: a follow-up done in another tab now reflects automatically (the inbox subscribes to UPDATE events, not just new leads).

### 🔧 Technical

- New migration `0014_leads_followed_up.sql` adds `leads.followed_up_at timestamptz` (nullable) + a partial index on rows still pending follow-up.
- New endpoints: `POST /api/leads/[id]/follow-up` (toggle), `GET /api/leads/export` (CSV).
- Existing per-listing RLS policies cover the new column unchanged.
- Migration must be applied (`pnpm db:push`) before deploying — the column is referenced on every leads query.

### 📊 Metrics

- 7 files touched (3 new, 4 modified, 1 migration).
- `pnpm tsc --noEmit` clean, `pnpm build` clean.



---

## Release Notes - v0.12.2

**Release Date:** 2026-06-13

Dashboard refresh based on owner feedback after looking at the page on his phone.

### ✨ Improvements

**Cleaner dashboard header**
The dashboard's main heading now reads "Dashboard" instead of "Listings" — it's the home of more than just listings now. The "Manage your inventory…" subtitle was redundant and is gone. The "View public profile" link moves to the top-right of the page where it belongs as a secondary action.

**Two quick-link cards replace the empty stats grid**
The four analytics tiles at the top (Listings / Page views / Sessions / Leads) were showing mostly zeros pre-launch and added noise rather than signal. They've been replaced with two clear quick links:

- **New listing** → jump straight into adding a property
- **New community video** → jump to the communities list to pick where the video belongs

Per-listing analytics are still available on each listing's Analytics tab — nothing was removed from the data layer.

### 🔧 Technical

- One file touched (`app/dashboard/page.tsx`), +36/-50.
- Removed the now-unused `RollupStat` component and the rollup query call on the dashboard route.

### ⚠️ Known Issues

- "New community video" currently sends you to the communities list rather than a one-step picker. If picking-then-uploading feels too clicky in real use, we'll add a dedicated picker page.

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
