# Vicinity Release Notes

Newest at the top. Each release covers a meaningful product change visible to users.

## v0.52.2 — Save your social drafts (2026-06-22)

### 🚀 Features

- **Save generated copy.** Hit **Save** next to Copy on the output
  card and your post is persisted to this listing. Saved drafts show
  up below the editor with copy + delete buttons — no more losing
  good copy to a refresh.
- Per-listing cap of 50 drafts; oldest are not auto-evicted. If you
  hit the cap you'll see a clear message and can delete to make room.

### ✨ Improvements

- **Tour panel cleaned up.** Dropped the speculative "Q4 2026" date
  and the provider-eval paragraph. Button is now just "Create a home
  tour video" — same as the section title.
- **Selling points hint is a word counter.** "Up to 50 words (N/50)";
  turns red over the cap. Cleaner than the previous paragraph blurb.
- **Platform and Language dropdowns are quieter** — hint text removed.

### 🛡️ Security

- Saved drafts are RLS-scoped: agents only see and write drafts for
  their own listings. Save endpoint shares the existing 10/min
  per-agent rate limit, body length is capped at 8 KB, and a database
  trigger enforces the per-listing draft cap (defense in depth).

## v0.52.1 — Marketing tab layout cleanup (2026-06-22)

### ✨ Improvements

- **Marketing tab is calmer.** The social-copy generator now uses a
  simple left/right split: pick selling points, platform, and language
  on the left; output appears on the right. Pick one platform and one
  language at a time — Regenerate to iterate, switch platform when
  you're happy.
- **Home tour generator moved to the Media tab.** Renamed
  "AI tour video" → "Create a home tour video from photos" and parked
  it as a standalone section at the bottom of Media, since it operates
  on the photos you've uploaded. Marketing tab is now just copy.
- **Less visual chrome.** Dropped the "Facebook + Instagram drafts"
  header — the panel speaks for itself now.

## v0.52.0 — Marketing tab: more platforms, more languages (2026-06-22)

### 🚀 Features

- **Pick the platforms you want.** The Marketing tab's social-copy
  generator now supports nine platforms instead of three: Facebook,
  Instagram, Email, TikTok, X, LinkedIn, Threads, Rednote (小红书), and
  WeChat Moments. Toggle the ones you want with pill buttons.
- **Generate in multiple languages.** Reach the multilingual US homebuyer
  pool: English, 简体中文, Español, Tiếng Việt, and 한국어. Each post is
  written natively for that language, not translated word-for-word.
- **Smarter copy from your listing.** The generator now reads your
  listing's description, photo captions, and video titles before drafting,
  so the posts reference real content instead of just the address and
  price. Add optional selling points to nudge the angle.

### ✨ Improvements

- The Marketing tab's old three-tab strip is gone — it didn't scale past
  3 platforms. New layout: Platforms and Languages selectors on top, then
  one card per platform with a language sub-tab strip and a per-cell Copy
  button.
- One click generates every platform × language combination in a single
  pass (cap: 6 platforms × 4 languages per click).

## v0.51.8 — Drop "Content" title from Media tab (2026-06-22)

### ✨ Improvements

- Listing /edit **Media** tab: removed the redundant "Content" card title.
  The tab name already says it; the helper line ("Photos and videos · drag
  to reorder · use ⓒ to set cover") stays.

## v0.51.7 — Agent hub Details panel cleanup (2026-06-22)

### ✨ Improvements

- Listing /edit **Details** panel: removed redundant helper text from
  Bedrooms, Bathrooms, HOA, Community, and Description — every input now
  speaks for itself. The "* = required to publish" line and the always-on
  "Auto-save on" pill are gone too; the save indicator now only shows when
  there's something to say (Editing… / Saving… / ✓ Saved / Save failed).
- **Square feet** field gained a clear `sq ft` suffix inside the input.
- **HOA** is now a number field with a `$` prefix and a `/month` suffix,
  so agents type `120` instead of `$120/mo`.
- **Year built** is now a dropdown listing current year → 1900, with a
  "Type a year…" option for older homes (mirrors how Beds/Baths work).

## v0.51.6 — One upload button for photos and videos (2026-06-21)

### ✨ Improvements

- Listing /edit Media tab: the separate "Videos" and "Photos" cards are
  merged into a single **Content** card with one **Click to upload** button.
  The button accepts photos *and* videos in the same pick — files are
  routed automatically by type. Reorder, cover toggle, and delete still
  live with each media type below.

## v0.51.5 — Delete lives in Details tab on both pages (2026-06-21)

### ✨ Improvements

- My listing & my community detail pages: the Delete control now appears in
  exactly one place — the bottom of the **Details** tab, as a clear rose-bordered
  "Danger zone" block with a solid red "Delete this listing/community" button.
  Same look, same place, on both pages.
- Removed the three-dot ⋯ menu from the community hero. The Active/Inactive
  pill is the only top-right control again, matching the listing hero.

### 🐛 Bug Fixes

- Fixes the report that Delete only showed at the bottom of the Details tab on
  community pages — now that's the *intended* place on both listings and
  communities, with identical styling.

## v0.51.4 — Portfolio internal rhythm (2026-06-21)

- Agent portfolio (`/a/[agentSlug]`): overlay typography enlarged to match
  the page's larger 4:5 cards — serif 22–26px price, 13–14px specs/address,
  20px interior inset.
- Agent portfolio: unified vertical/horizontal spacing to a single 8px
  rhythm — hero & listings `py-20 md:py-28`, headers `mb-8`, hero flex
  `gap-8`, grid `gap-8`, bio `mt-8`, footer `py-8`.
- `GridCard`: new optional `captionInsetClass` prop (default unchanged) so
  pages with larger cards can scale interior padding to match.
- No changes to `/browse`, `/communities`, `/dashboard`, `/saved`,
  `/search`, `/nearby`, `/c/[slug]`.
Format matches the standard release template (Features / Improvements / Bug Fixes / Technical / Known Issues / Metrics).

## v0.51.3 — 2026-06-21 — Portfolio text matches every other grid

### ✨ Improvements

- Agent portfolio (`/a/[agentSlug]`) cards now use the same caption
  format as every other grid in the app: price (serif, bold) →
  specs (bd / ba / sqft) → address, all overlaid on the bottom-left
  of the cover image with the shared dark gradient. Editorial 4:5
  aspect and the 1 / 2 / 3-column wide-gap layout are preserved.
- The old "No. 01" eyebrow and post-image text block are gone — the
  card visually reads like /browse, /communities, /dashboard, etc.,
  just at a larger scale.

### 🛠️ Technical

- `GridCard` now accepts an optional `aspectClass` prop so the
  portfolio card can specify `aspect-[4/5]` while still reusing the
  shared overlay caption + gradient + hover.
- Inline `ListingCardView` markup in `/a/[agentSlug]/page.tsx`
  collapsed onto `<GridCard>` + `<GridCardCaption>` (≈40 lines of
  duplicate markup removed).
## v0.51.2 — 2026-06-21 — Edge-to-edge grid rhythm

### ✨ Improvements

- Page-level left/right padding on grid pages reduced to match the
  inter-card gap (4px mobile / 6px desktop), so the visual rhythm of
  the grid extends all the way to the screen edges with no asymmetric
  outer margin.
- Six more grid surfaces (`/saved`, `/search`, `/nearby`, `/c/[slug]`
  videos + listings) now use the same shared GridPageShell /
  GridFrame / GridCard primitives as `/browse`, `/communities`,
  `/dashboard`, `/dashboard/communities` — identical card aspect,
  caption styling, and badge placement.
- `/nearby` distance pill now uses the shared GridCard top-left slot;
  `/search` "Stock" demo badge uses the shared top-right slot.
- 5 loading skeletons updated to match the unified grid spacing so
  the loading state visually matches what gets rendered.

### 🛠️ Technical

- `ListingGridItem` extended with optional `distanceMi` — renders
  automatically as a top-left badge.
- `GridPageShell` padding changed from `px-3 sm:px-6` to
  `px-1 md:px-1.5` (equal to grid gap).
- Inline `ListingCard` helpers in /search and /nearby deleted —
  ~110 lines of duplicate card markup removed.
- `tsc`, `biome`, `next build` all clean.

### Known Issues

- `/a/[agentSlug]` agent portfolio page is intentionally NOT in this
  unification — it's an editorial 1/2/3-column layout, different
  visual family. Will revisit if visual consistency there is wanted.

## v0.51.1 — 2026-06-21 — Even grid spacing

### ✨ Improvements

- **Grid spacing is now even.** Horizontal and vertical gaps between cards match, so the grid reads as a uniform mesh instead of horizontal rows. Applies to For You, Communities, My Listings, and My Communities.

## v0.51.0 — 2026-06-21 — Unified grid layout

### ✨ Improvements

- **My Listings and My Communities now look the same as For You and Communities.** All four grid pages share the same card style, spacing, and column layout, so switching between them feels seamless.

### 🔧 Technical

- Extracted shared grid primitives (page shell, frame, card) so future visual tweaks happen in one file instead of four.

## v0.50.1 — 2026-06-21 — Agent hub follow-up

### 🎨 Improvements

- **Community Photos tab now inline**: clicking the Photos tab inside a
  community's detail page now shows the full photo manager (category
  picker + dropzone + gallery) right there. No more bouncing to /upload
  to add a photo.

### 🛠️ Technical

- Buyer surfaces (`/communities`, `/browse?tab=communities`,
  `/c/<slug>`, listing-feed community sheet) gate communities on
  `status='active'`. Inactive communities now 404 for buyers; the
  creating agent still sees them in /dashboard/communities so they can
  reactivate.
- `fetchCommunityListCards({ includeInactive })` opt-in so dashboard
  keeps full visibility.

## v0.50.0 — 2026-06-21 — Agent hub rebuild

### ✨ Features

- **Unified agent hub detail shell**: clicking a listing or community now
  opens a hero-cover layout with sticky sub-tabs underneath. Switch tabs
  inline (URL `?tab=…` deep-links and shares cleanly); edits auto-save.
  Replaces the prior long-scroll edit pages.
- **Status simplified to Active / Inactive**: no more draft / published /
  archived. Listings now have a single Active ↔ Inactive toggle in the
  hero top-right. Activating still runs the readiness gate (address,
  price, beds/baths, ≥1 ready media); deactivate is one click.
  Communities gained the same toggle.
- **Three-dot menu with Delete**: archive removed entirely. Permanent
  delete is the sole destructive action, behind ⋮ in the hero.

### 🎨 Improvements

- **My-listings grid**: removed the empty padding wrapper and matched
  `/browse` exactly — 2-up on mobile, 4-up on desktop, 3:4 cards with
  bottom-gradient legibility overlay. Inactive cards de-emphasized
  with reduced opacity + small Inactive pill.
- **My-communities grid**: same padding tightened to match `/communities`.
- **Detail hero ratio**: dashboard hero uses the same `aspect-[5/2]
  md:aspect-[5/1]` as the public community page, so what you see while
  editing matches what buyers see live.
- **Listing detail Media tab**: videos and photos panels stacked together
  on one tab — fewer hops to swap a cover image.

### 🛠️ Technical

- DB migration 0030 collapses `listings.status` enum + adds
  `communities.status`. Backfill: `published → active`, `draft|archived
  → inactive`. Buyer-side reads gated on `status='active'`.
- New shared components: `HubDetailShell`, `HubTabs`, `StatusPill`,
  `ListingDetailMenu`, `CommunityDetailMenu`.
- PublishPanel deleted; archive helpers replaced by deactivate.
- Stacking-context guard: pill-error popover and detail menus portalled
  to `document.body` so BottomNav z-40 doesn't clip them on mobile.

### 🐛 Known Issues / Follow-ups

- Community photos tab currently shows a "Manage photos →" link to the
  existing photos page rather than inlining the panel — keeps phase 46
  bounded; inlining is straightforward in a follow-up.
- Buyer-facing `/c/<slug>` visibility still ignores
  `communities.status` this phase; will gate in a follow-up if owner
  wants inactive communities hidden from buyers.

## v0.49.5 — 2026-06-21

### 🐛 Bug Fixes

- **Upload sheet now properly cancels on outside tap.** Previously, tapping outside the upload sheet on the listings page would not only fail to close the sheet — it would also navigate to whatever listing card you tapped on. Fixed: the sheet now renders at the document root (above all page content) so tapping outside reliably dismisses it without triggering anything underneath.

### ✨ Improvements

- **Upload sheet redesigned.** Replaced the three flat buttons (Album / Camera / Cancel) with two large icon tiles for **Album** and **Camera**, plus a subtle "Tap outside to cancel" hint. Smoother slide-in animation, deeper scrim, no need for a Cancel button — just tap anywhere off the sheet.

## v0.49.4 — 2026-06-21

### ✨ Improvements

- **Upload menu simplified.** Tapping the center "+" button now opens a clean bottom sheet with three choices: **Choose from album**, **Camera**, **Cancel**. Photo and Video are merged into a single Camera option (your phone lets you pick which to capture). Tapping anywhere outside the sheet closes it without activating whatever was behind — your tap won't accidentally open a listing or play a video.

## v0.49.3 — 2026-06-21

### ✨ Improvements

- **Upload menu redesigned.** Tapping the center "+" button on the bottom bar now fans out three round buttons (Album / Photo / Video) in a soft arc above it, with the "+" rotating into an ✕ to cancel. Tap any empty space to close — no more dedicated Cancel button. Replaces the old stacked sheet that several agents flagged as flat-looking and hard to dismiss.

## v0.49.2 — 2026-06-21

### ✨ Improvements

- **Left-corner chip refined and repositioned.** The "Live here" / community-name chip on video feeds now uses a soft squircle with a small green status dot before the icon + text, and sits about a quarter of the way down the screen instead of tucked under the top bar — easier to read against the video and clearer space from the top chrome.

## v0.49.1 — 2026-06-21

### ✨ Improvements

- **Cleaner left-corner chip on community videos.** The top-left button on a community video feed is now a banner-cut tag reading "🏠 Live here" — opens the homes-for-sale sheet in place. Replaces the older "🏠 N homes here ›" pill. The same shape is reused on the listing feed's community chip (single-line community name), so both surfaces look like one product.

## v0.49.0 — 2026-06-21

### ✨ Improvements

- **Community pages are more immersive.** The hero photo at the top of a community page is shorter so the videos start higher up the screen, and the two pill buttons that used to sit between the hero and the videos ("Community Videos" / "Active Listings") are gone — videos now show by default the moment the page opens.
- **"Live here →" — one tap from a community to its homes for sale.** Right next to the city name on the community hero ("Atlanta, GA · **Live here →**"), an inline link swaps the videos for the active listings inside that community, then flips to "← Walk through" to send you back. Reads as part of the sentence, not as page chrome — and no detour through the global browse page.

## v0.48.2 — 2026-06-21

### 🐛 Bug Fixes

- **Nearby now tells you what went wrong with location.** If location fails — because the browser timed out, your device couldn't get a fix, or you'd previously blocked the site — the empty state now explains which one and shows a **Try again** button (except for "blocked", where the only fix is to open the browser's site settings). Before this, every failure landed on the same generic "enable location access in your browser" message even after you clicked Enable, so there was no way to tell whether retrying would help.
- **Longer wait on first location lookup.** The Nearby page used to give up after 8 seconds, which was too short — by the time the OS permission dialog appeared and you tapped Allow, we'd often already moved on. Bumped to 30 seconds, and we'll reuse a recent fix for up to a minute so back-and-forth between Nearby and other pages doesn't keep re-asking the OS.

## v0.48.1 — 2026-06-21

### ✨ Improvements

- **Nearby page asks before asking.** The first time you open Nearby, you'll see a small explanation of why we want your location and what we do with it ("only used to filter what you see, stays on your device") with an "Enable location" button. Tapping that button is what triggers the browser's native location permission prompt — so the OS dialog now arrives with context instead of out of nowhere. After the first visit, Nearby goes straight to results.

## v0.48.0 — 2026-06-21

### ✨ Improvements

- **All grid pages now feel like a TikTok feed.** The cover photo / video thumbnail takes up the entire card, and the price, beds/baths/sqft, and address sit on a soft dark gradient at the bottom of the cover instead of in a separate row underneath. The empty space between cards has been tightened to almost nothing (a 4-pixel gap between columns, an 8-pixel gap between rows on phones), so just over two rows of listings are visible on screen at once — your eye picks up that there's more to scroll to without anyone having to tell you. This applies everywhere a grid shows up: Explore, Nearby, Saved, Search results, an individual community's videos and listings tabs, and the agent dashboard listings view.
- **Specs now read as one line.** "3 bd · 2 ba · 1,820 sqft" sits below the price as a single sentence instead of three side-by-side spans. If a listing is missing one of the three (some homes don't list square footage), the dot separators stay clean and the line just shows what's known.

## v0.47.2 — 2026-06-21

### ✨ Improvements

- **Cleaner Nearby experience when location is blocked.** If you've denied your browser location to Vicinity, the Nearby tab and the Communities → Nearby tab now show a single-line message asking you to enable location access — instead of asking you to type your latitude and longitude into two input boxes, which nobody knows off the top of their head.

## v0.47.1 — 2026-06-21

### ✨ Improvements

- **Feeds now use the full screen on phones.** Previously a thin strip at the bottom of the feed (the price + caption area) was hidden behind Safari's URL bar on iPhone. The feed now resizes itself to whatever the browser is showing, so the listing photo or video, the caption, and the right-rail buttons all sit inside the visible area no matter whether the URL bar is up or hidden.
- **Removed the "Swipe up for more" hint** on the listing video / explore feed and the **"← swipe →" hint** on the community-videos carousels. The gesture is self-evident on a TikTok-style feed and the labels were just visual noise crowding the bottom edge.

## v0.47.0 — 2026-06-21

### ✨ Improvements

- **All three feed surfaces now look and behave the same.** The Community-tab carousel (For You → listing → "Videos in this community") now uses the same right-rail style as the listing feed and the community video feed: circle button with a label underneath (Like / Save / Contact). Previously it was bare unlabeled circles. Same pixel position, same safe-area handling — so the iOS home indicator no longer crowds the rail on any of the three feeds.

### 🔧 Technical

- Phase 45.23 architectural cleanup: introduced `FeedShell` page primitive and shared layout constants (`FEED_FRAME_CLASS`, `FEED_RAIL_BOTTOM`, `FEED_Z`). Migrated `BrowseFeed`, `CommunityVideoFeed`, and `CommunityCarousel` onto the shared primitives — z-stack, safe-area math, and the 9:16 desktop frame are now defined once instead of three drifting copies. The recurring class of bugs from phases 45.19–45.22 (overlay buttons disappearing, modal hidden behind carousel, rail too close to home indicator) had a single root cause: three near-identical rail/frame implementations diverging independently. That's now fixed at the source. CommunityCarousel's local icon SVGs (`Heart` viewBox 24/size 24, `Bookmark`/`Share`/`Comment` size 22) were replaced with the shared icon set (`size 26`, identical paths to BrowseFeed) — the carousel rail icons are now slightly larger and pixel-identical to the listing feed.

## v0.46.0 — 2026-06-21

### 🐛 Bug Fixes

- **Community video feed buttons now have labels.** When tapping into a community video (Community tab → community → Videos → click a video), the three right-rail buttons (Like / Save / Contact) now show their names underneath each circle — same as the listing feed (For You). Previously they were bare circles, which made it hard to tell which button does what. The buttons themselves and their positions are unchanged.

### 🔧 Technical

- Extracted shared feed primitives — icons (`Heart`, `Bookmark`, `Share`, `Comment`, `BackArrow`, `Nearby`, `Play`, `House`) and `ActionButton` — into `app/(public)/_components/feed/`. BrowseFeed and CommunityVideoFeed now consume the same components. Pixel-identical to the previous BrowseFeed look. CommunityCarousel kept its local icon set this release (icon SVGs differ subtly; unifying needs owner pixel sign-off).

## v0.45.5 — 2026-06-20

### ✨ Improvements

- **Listing feed right-rail buttons (Like / Save / Contact) moved back up** to thumb height. They had been lowered to sit at the very bottom edge in v0.45.x; reverted per owner feedback — they now float ~5rem above the safe area where they're easier to reach.

## v0.45.4 — 2026-06-20

### 🐛 Bug Fixes

- **Contact button now opens the form when tapping it from inside a community-video carousel** (For You → listing → community videos → Contact). Previously the button looked like a dead click — the form was actually opening, but stacking order put it behind the carousel so you couldn't see or interact with it. Fixed.
- **Contact button now appears on legacy community feeds** (Community tab → Peachtree Corners → Videos, and other communities created before owner-tracking shipped). When a community doesn't have a registered owner, the Contact button now routes to the agent who posted listings into that community — so buyers always have a way to reach somebody. Communities with no owner *and* no listings still hide the button (nobody to route to).

## v0.45.3 — 2026-06-20

### 🐛 Bug Fixes

- **Community video feed buttons no longer disappear.** When tapping into a video from the Community tab, the top header (back, community name, share) and the side rail (Like, Save, Contact) plus the "homes here" chip now stay pinned to the screen as you swipe. Previously they shifted off-screen after the first video.

## v0.45.2 — 2026-06-20

### 🐛 Bug Fixes

- **Liking a community video now sticks.** Previously the heart would light up briefly and then snap back — the save was failing in the background. Fixed.

### ✨ Improvements

- **Contact button added to the community video feed.** When you're browsing a community's videos directly (not coming in from a specific listing), the right-side rail now has a Contact button that lets you reach out to the community's owner. Communities without a registered owner won't show the button.

## v0.45.1 — 2026-06-20

### 🐛 Bug Fixes

- **Community videos viewed from a listing** now show in the same phone-shape column as everything else on desktop, instead of stretching to fill the whole screen. Share, Like, Save, and Contact buttons now appear in the side rail — same shape and behaviour as the listing feed itself, so you can save the listing or contact the agent without leaving the video.

## v0.45.0 — 2026-06-20

### 🚀 Features

- **New top navigation** — every page now has a unified top bar with search, section tabs, and your avatar in the top right. On larger screens you also get a left sidebar for one-tap jumps between surfaces.
- **"New" is a primary tab** for agents — creating a listing or community no longer lives only behind the floating button.

### ✨ Improvements

- **Browse** brings back **Explore | Nearby** as sub-tabs.
- **Communities → Nearby** now shows community-mapped video tiles instead of a flat list.
- **Favorites** tab restored to the bottom nav, with cleaner "Saved" labels.
- **Search results** now use a 4-column grid on wider screens.
- **Agent Hub** dropped the duplicate avatar, simplified labels (singular "Listing" / "Community"), and removed status pills that weren't earning their space.
- **My Community** tap now jumps you straight into the editor.
- **Community feed** uses a phone-shaped frame with video captions for a more native feel.
- **Floating create button** is centered and consistent across surfaces.
- **Listings and communities** now have **delete** actions in the dashboard (videos already had this — bringing the rest to parity).
- **Sidebar** has more breathing room and tighter visual rhythm.
- **Auto-cover, grid meta, and like interactions** were polished across the home and feed grids.

### 🐛 Bug Fixes

- **Upload from the floating button → New community → no longer drops your files.** Previously, picking files and creating a new community would silently lose everything you'd queued. We now carry your selection through to the upload screen, split videos and photos into the right panels, and show a "N files queued" banner so you can confirm before submitting.
- **Like state** correctly persists after publish.
- **Publish redirect** now lands you on the right destination instead of the editor.

### ⚠️ Known Issues

- None reported. Owner verification of the community upload fix is pending.

## v0.42.0 — 2026-06-20

### 🚀 Features

- **Center upload button on the agent home** — pick from album, take a photo, or record a video, and we'll prefill the listing or community editor for you.
- **Global search** across listings and communities — tap the magnifier in the top right.
- **Agent analytics dashboard** — page views, unique sessions, likes, and leads, plus a 7-day trend.
- **Likes are now their own action**, separate from saves. The Favorites tab keeps both side by side.

### ✨ Improvements

- Landing page is cleaner: just the wordmark and a single tagline, with Explore and Sign In as the only buttons.
- Sign-in page now has a clickable Vicinity wordmark to bounce back home.
- Browse and Community grids now show two cards per row at every screen size.
- Bottom navigation is role-aware: buyers see For You / Community / Favorites / Me; agents see Agent Hub / For You / + / Community / Me; signed-out visitors get a Sign in shortcut.
- Agent Hub has a new Analytics tab next to Listings, Communities, and Leads.
- Listings and Communities in Agent Hub show as cards instead of a list.

## v0.41.0 — 2026-06-20

### 🔧 Technical

- Removed the "Share as poster" feature from the listing editor. After several rounds of design iteration the format wasn't earning its keep, so we pulled it to focus on the actual sharing path (Public URL ↗). The public listing page itself is unchanged.

## v0.40.0 — 2026-06-20

### ✨ Improvements

- **Editorial showcase reworked into "Listing Dossier"** — the default showcase style (Style 1) now reads like an information-dense single-page dossier with five numbered panels: ① The Home (with hero video + about), ② Inside (interior photo grid + specs), ③ The Neighborhood (community photo + landmarks), ④ The Numbers (price / $/sqft / HOA / status), ⑤ Represented by (agent + tour CTA). Top band masthead, footer band, burgundy-on-paper accent on the price chip. Designed for agents who want a "fact sheet" feel that differentiates from typical Zillow-style platforms.
- **Matching dossier poster** — the downloadable poster for Style 1 mirrors the same identity (top band → masthead → numbered photo panels → agent footer), so the poster you download visually matches the page you share.

### 🐛 Bug Fixes

- The three downloadable posters (Editorial / Cinematic / Luxury) were too visually similar at thumbnail size — Style 1's Dossier rework restores a clear at-a-glance distinction between all three.

### 🔧 Technical

- Added an internal `dossier` design token (burgundy `#8a2a23`) scoped strictly to Style 1's price chip — does not bleed into other surfaces.
- Two static prototype HTML files live under `public/prototypes/dossier.html` and `public/prototypes/spec-sheet.html` — used for visual sign-off; they are not wired into the app router.

## v0.39.0 — 2026-06-19

### 🚀 Features

- **Download poster images** — every showcase style now has a matching downloadable poster (vertical, designed for phone screens). Open the listing edit page → "Share as poster" → click "Download poster" on the style you want. Save it and post directly to WeChat moments, Instagram, or any image-friendly channel.

### ✨ Improvements

- Showcase pages now show more about each home: a short description, community details with nearby landmarks (school / grocery / transit), and an agent contact card.
- Editorial and Luxury showcase layouts now use a two-column reading flow on tablet and desktop. Phones still see a single clean column.

### 🐛 Bug Fixes

- Fixed a missing photo slot in the Editorial showcase gallery.

### 🔧 Technical

- Retired the Minimal Poster style; its "share as image" use case is better served by the new poster downloads. Editorial / Cinematic / Luxury Brochure remain.

## v0.38.0 — 2026-06-19

### 🚀 Features

- **Share as poster** — every listing now has a shareable showcase page in 4 visual styles (Editorial Magazine, Cinematic Story, Minimal Poster, Luxury Brochure). Find it on the listing edit page; copy a link to drop into a message, post, or email.
- **Beautiful link previews** — when you share a showcase link, the preview card automatically shows the home's photo, address, and price.

## v0.37.0 — 2026-06-18

### ✨ Improvements

- **Bottom bar is now a clean 4-icon strip: Community · Explore · {Saved | Workspace} · Me.** The standalone "Nearby" slot is gone, and the gold raised "Explore" button in the middle is flat now too — every tab gets equal visual weight. The bar feels less busy and the four icons line up.
- **Nearby moved inside Explore as a sub-tab.** Open Explore and you'll see two sub-tabs at the top: **Recommended** (default) and **Nearby**. Both show the same listing-grid layout; tap any card and you land in the same vertical swipe feed. Recommended shows everything, Nearby filters to your radius — same model 抖音 uses for 推荐/同城.
- **Old `/nearby` link still works.** If you've bookmarked Nearby or have an old tab open, it now redirects to Explore with the Nearby sub-tab pre-selected. Your saved radius preference (set in Profile) carries over unchanged.

### 🔧 Technical

- Sub-tabs are URL-driven (`?tab=recommended` / `?tab=nearby`), so they're shareable, back-button-friendly, and SSR-rendered.
- The community-scoped Explore view (`/browse?community=<slug>`) hides the sub-nav — that surface is already location-anchored to one community, so "Nearby" has no meaning there.

## v0.36.4 — 2026-06-18

### ✨ Improvements

- **Workspace creation buttons are unified — one gold pill per sub-nav page.** Each Workspace surface now has exactly one creation action in the same place and style — sitting in the chips row right next to the active sub-nav chip: **+ New listing** on Listings, **+ New community** on Communities. Inside a community, the existing **+ Upload video** stays in the page header. Leads has none — it's an inbox, not somewhere you create things. Before, the same actions were scattered across big "Add a property" cards, a floating gold "+" button on the bottom-right, an in-row "+ Upload" shortcut on each community, and a small "+ Add" text-link on the community page — all pointing at the same places, just stylistically inconsistent.

### 🐛 Bug Fixes

- **Removed the floating "+" button on Workspace pages.** It tried to be a single shortcut to "List a property" or "Add a community video," but each Workspace page already has its own button for the same thing in a more obvious spot. The floating button was visually competing with the gold Explore tab in the bottom bar too.
- **Removed the three "Add a property / Pick a community / View leads" cards from the new-agent dashboard.** They duplicated the chips row right above them and disappeared as soon as you published a single listing — confusing on the way in, and gone before you'd built any habit. The empty-state inside the listings list now points at the new header button: "No listings yet — tap + New listing above to add one."
- **The community page no longer shows two buttons that do the same thing.** Header had **+ Upload** and the videos section had **+ Add** — both opened the upload page. Kept just the header button (renamed to **+ Upload video** for clarity) and dropped the duplicate.

## v0.36.3 — 2026-06-18

### 🐛 Bug Fixes

- **Workspace now has chips for Listings · Communities · Leads.** After yesterday's "Workspace" rename, the tab landed on listings but there was no in-app way back to community management or the leads list once you had any listings — the empty-state CTA cards for those surfaces stop showing as soon as you publish your first property. Added a chips row right under the Workspace heading on all three pages so you can hop between Listings, Communities, and Leads without using browser back. The chip for the page you're on is gold-highlighted; the other two are tappable.

## v0.36.2 — 2026-06-18

### ✨ Improvements

- **Bottom-nav "Leads" is now "Workspace" — one tap to your full agent surface.** The slot-4 tab on the bottom bar (and its desktop equivalent) used to send you to the leads list only, while the rest of your tools (listings management, community-video upload, lead pipeline) lived behind a separate "Open dashboard" button on your profile. Two doors to overlapping content. Now the tab is **Workspace** and lands directly on the full surface — leads, listings, and community uploads all in one place.

### 🐛 Bug Fixes

- **Removed the duplicate "Open dashboard" button on Profile.** It pointed at the same place the new Workspace tab now opens. Profile actions are now: edit identity, view your public profile, sign out — nothing redundant.

## v0.36.1 — 2026-06-18

### 🐛 Bug Fixes

- **The community page in your dashboard now only lists *your* videos.** Previously you'd see every agent's videos for a community you also uploaded to — but you couldn't play, hide, or delete the ones that weren't yours, so they were just clutter. The list is now scoped to videos you uploaded; tap **View public page →** in the header to browse the whole community the way buyers do.

## v0.36.0 — 2026-06-18

### ✨ Improvements

- **One nav for everyone — agents and buyers see the same primary tabs.** The bottom bar (and the desktop top bar) is now a single 5-slot layout: **Community · Nearby · Explore · Saved/Leads · Me**, with Explore as the gold center button for both roles. Agents see "Leads" in slot 4 where buyers see "Saved" — that's the only difference. No more "preview as buyer" toggle, no more separate agent IA — the agent experience *is* the buyer experience, plus tools.
- **"+ New listing" moved to a floating button on the bottom-right.** When you're an agent on Dashboard, Profile, or Communities, you'll see a gold "+" floating in the corner — tap it for the same "List a Property / Add Community Video" sheet you had before. The center of the nav bar is now Explore for everyone, so the visual midline is back where it should be. Desktop agents can still use the "+ New" button in the top bar, and there's now a "Dashboard / New listing" shortcut inside the avatar dropdown for quick access from anywhere.

### 🐛 Bug Fixes

- **Bottom navigation is symmetric again.** The agent bar had grown to six items, pushing the gold action button off-center. It's back to five slots with the FAB on the midline, matching the buyer view.

### ⚙️ Technical

- Removed the "preview as buyer" mode and its supporting infrastructure (`vicinity_preview_as_buyer` cookie, `<PreviewBanner>`, dashboard preview redirect, profile-page toggle button). Agents now just *use* the buyer surface — no role-impersonation cookie needed. The cookie, if a browser still holds it, is harmless and will expire on next browser close.
- Collapsed `BUYER_TABS` / `AGENT_LEFT_TABS` / `AGENT_RIGHT_TABS` in `nav-config.ts` into a single `getPrimaryTabs(role)` helper — one source of truth for both `<BottomNav>` and `<SiteHeader>`.

## v0.35.5 — 2026-06-18

### 🐛 Bug Fixes

- **Dashboard top section no longer changes when you flip the listing filter.** Switching between Draft / Published / Archived used to swap the cards above — sometimes showing quick actions, sometimes empty stats. The filter now only affects the listings list below it; the top section stays consistent. New agents who land on the Draft tab will also see the "Add a property" shortcut, instead of an empty stats row.

## v0.35.4 — 2026-06-18

### ✨ Improvements

- **Photo listings now show up in the Explore swipe feed.** Previously the swipe stream skipped any listing that didn't have a video. From now on, photo and video listings flow through the same feed — buyers see one continuous stream, no matter how each listing was uploaded. The full action rail (Like / Save / Share / Contact) is identical on photo cards.

## v0.35.3 — 2026-06-17

### ✨ Features
- **Vertical swipe between listings.** Open a listing from a shared link and the swipe-up gesture now carries you on to the next listing in your area, just like the explore feed does. The page you land on is no longer a dead end.
- **Owner-only edits on community videos.** When several agents share a community, each agent can only edit, hide, or delete the videos they uploaded themselves. Other agents' work shows up in your dashboard with a "by @uploader" tag and read-only thumbnails — no more accidental deletes of someone else's video.

### 🛠 Improvements
- **Cleaner category picker on upload.** Replaced the 12-card grid with a tight chip cloud — fits the whole list on one phone screen instead of forcing you to scroll past category cards. Faster to skim, faster to pick.
- **Less clutter on the upload screen.** Removed the multi-community toggle and the meta block from the upload flow — cross-community uploading was a power-user feature most agents didn't use, and it was crowding the page.
- **Smarter Back on the listing page.** The Back arrow now returns to the explore grid where you left off, scroll position and all, instead of jumping you to the top.
- **Stats stay put when you switch tabs.** Flipping Draft / Published / Archived on the dashboard no longer flashes the stats block. The numbers up top stay rendered while only the list below changes.

### 🐛 Bug Fixes
- Removed a non-functional Search button from the listing detail header — it was a placeholder that pointed at the same place as Back, which was confusing.

## v0.35.2 — 2026-06-17

### ✨ Features
- **Hide a community video without deleting it.** Each video on the community editor now has *Mark private* and *Archive* — they're pulled off the buyer-facing experience but stay in your dashboard. Use *Private* for "drafts I'm not happy with yet", *Archive* for "park it, I might bring it back later". Tap *Make public* to flip it back. Buyers only ever see the live ones.

### 🛠 Improvements
- **Manage your videos directly on the community editor.** Open any community and you'll land on a video-first view: thumbnail, current category, status, and visibility — grouped into Live / Private / Archived. Re-categorize, hide, archive, or delete inline. No more bouncing into the upload page just to fix a typo on a video category.
- **Re-categorize without the create-flow walkthrough.** First-time uploads still walk you through the "Only on Vicinity" vs "Real look at the data" buckets on mobile (so you don't get a 12-card list on a small phone). When you're editing an existing video the picker drops the bucket step and lays the 12 categories out flat — you already know the taxonomy by then.
- **Mobile-friendly category picker on upload.** The 12 categories are now a 2-step pick on phones (bucket → category) instead of a wall of cards. The bucket step doubles as a quick reminder of *why* each kind of video matters on Vicinity.
- **Community list rows are tap-anywhere now.** Tap any row to open the community. The *+ Upload* shortcut still sits on the right (on tablet/desktop) for when you just want to drop a new clip in.

### 🐛 Bug Fixes
- **Hidden community videos no longer leak.** Tightened the buyer-facing queries so private and archived videos can't show up in the feed, on a community page, on a listing's community sheet, or in saved communities.

## v0.35.0 — 2026-06-17

### 🐛 Bug Fixes
- **Your dashboard now shows only your own listings.** A new agent with no listings was seeing other agents' published homes on her dashboard, which made the "Published" tab look populated and led to broken links when she tapped through. Each agent's dashboard is now scoped to her own portfolio — counts, the listing grid, and the cards all reflect what she actually owns.

### 🛠 Improvements
- **Community editor now shows the videos already on it.** Open any community and you'll see a roster of thumbnails right under the details, plus a one-tap "Manage" link to upload more. No more tapping into the upload page just to see what's there.
- **Community list shows video counts.** Each row in your community list now carries a small "N videos" pill so you can tell at a glance which communities already have content.
- **"Add Community Video" picks a community first.** The center "+" button used to send you to the community list page. Now it opens a quick picker — tap the community you want and you're straight on the upload screen for it. New community? "Create one" is right there too.
- **Dashboard header is leaner.** The "View public profile" pill at the top of the dashboard is gone — it's already on the Me tab, one tap away. One way to do each thing.

## v0.34.2 — 2026-06-17

### 🐛 Bug Fixes
- **Community videos opened from a listing now play with sound.** Tapping a listing's community badge and then a video used to open the carousel silent. Now it plays with sound by default — same as the main feeds. Volume is on your device's volume keys.

### 🛠 Improvements
- **"Nearby" is back in the bottom nav.** It got dropped in v0.34.1 by mistake — the radius-search Nearby tab is its own thing and stays.
- **Right-side rail on the listing feed dropped its "Nearby" button.** The community badge in the top-left already opens the same set of videos in a quick sheet without leaving the listing. One way to do each thing.

## v0.34.1 — 2026-06-17

### 🛠 Improvements
- **Cleaner bottom nav.** "Nearby" is gone — the community badge on every listing already takes you straight to a neighborhood, and the Community tab is right there for picking an area first. One way to do each thing.
- **The center button now says "Explore."** Big gold compass in the middle of the nav was unlabeled; now it carries its name like every other tab.
- **Explore stops duplicating Community.** The "Homes / Communities" toggle on top of Explore is removed — the Community tab already shows the same grid one tap away.
- **Homes chip moved to the top.** On any community video feed, the "🏠 N homes here" chip now sits in the top-left corner, matching the community badge on listing cards. Same place, same job — fewer rules to remember.

## v0.34.0 — 2026-06-17

### ✨ Features
- **Tap a community badge on any listing → see the neighborhood without leaving the swipe feed.** A new bottom sheet rises with the community's name, location, description, and a row of preview videos you can scroll horizontally. Tap any video and you're in a fullscreen left-right swipe through that whole community. Hit Back and you're right back on the listing you started from — the sheet was a quick look, not a detour.
- **Tap "🏠 N homes here" on any community feed → see every home for sale in that neighborhood without leaving.** A chip in the bottom-left corner of every community video opens a list of all the homes for sale in that community, sorted newest-first, with price, address, beds/baths, and square footage. Tap a row and you're in a fullscreen left-right swipe through those homes — videos play automatically, photos cover when there's no video. Hit Back and you're back on the community feed.
- **Both new flows use the same shape.** Tap a chip → bottom sheet for context → fullscreen swipe for browsing → Back to where you started. Same gesture in two places — buyers learn it once.

### 🔧 Technical
- **Real data only.** Stat rows and "host" cards that previously rendered with hardcoded ratings, school scores, commute times, and median-price placeholders have been removed. Where the database doesn't have a value yet, the surface stays clean instead of showing fake numbers. As the data fills in over time, those fields will appear automatically — no more stale placeholders to update.
- **Homes without any video or photo don't appear in the new community swipe.** They remain reachable through their direct listing link; they're just hidden from the visual browse loop until media is uploaded.

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
