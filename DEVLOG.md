# Vicinity — Development Log

Institutional memory for the project. Updated incrementally, not at session end.

## 2026-06-27 — Phase 67.3: Hotfix listing-edit leads panel runtime error

**Reported** (Qiaoxu, Slack): listing-level leads section throws an Application error after 67.2 deploy.

**Root cause**: phase 67.2 added `onClick={(e) => e.stopPropagation()}` to the Email/SMS anchors inside `ListingLeadsPanel.tsx`, but that file is a Server Component (called by the listing edit hub server tree, uses `createClient` from `@/lib/supabase/server`). React rejects event handlers on server-rendered nodes — manifests as a runtime client-side hydration / Application error in production. The other refactor (`leads-live.tsx`) was already a `'use client'` component so it didn't blow up.

**Fix**: split into two files. `ListingLeadsPanel.tsx` keeps the SSR shell (data fetch, empty state, header) and delegates row rendering to a new `ListingLeadsPanel.client.tsx` (`'use client'`) that owns the row UI + onClick handlers. Pure presentational client component, no state.

**Lesson learned**: when adding event handlers to a file, check the top of the file for `'use client'`. If absent and the file imports from `@/lib/supabase/server` or is consumed by a server tree, splitting is mandatory.

**Verification**: `npx tsc --noEmit` clean, `npx next build` compiled successfully.

---

## 2026-06-27 — Phase 67.2: Leads parity + clickable rows + source enum

**Asked** (Qiaoxu, Slack): per-listing leads view should follow the same pattern as `/dashboard/leads`; Source should be a 2-value enum (Listing / Community); the row should be clickable, not just the name.

**Changes**:
- `app/dashboard/leads/leads-live.tsx` — Source column collapsed to a type enum ("Listing" | "Community"). The community *name* moves into the Listing column for community leads (since Source no longer carries it). Row is now wrapped by an absolutely-positioned `<Link>` overlay (`absolute inset-0 z-0`) — the entire row is the click target. Inner cells default to `pointer-events-none` so clicks fall through; action clusters (Email / SMS / Mark) opt back in via `pointer-events-auto` and `e.stopPropagation()` so they don't trigger navigation. Hover state added (`hover:bg-line/15`) for affordance.
- `app/dashboard/listings/[id]/edit/ListingLeadsPanel.tsx` — rewritten from the old left-bar list into the same grid table pattern (sticky desktop column header, mobile stacked card, Email/SMS icon buttons, clickable rows). Listing column omitted (every row belongs to the same listing); Source hardcoded to "Listing" since this panel only joins on `listing_id`.

**Why overlay link instead of `useRouter` onClick**: keeps middle-click / cmd-click / right-click → "open in new tab" working natively; no JS needed; preserves accessibility (focusable link with `sr-only` text). Pointer-events trick is cleaner than nested `<a>` (invalid HTML).

**Verification**: `npx tsc --noEmit` clean, `npx next build` clean. Manual check needed: clicking row opens detail; clicking Email/SMS icon opens mailto/sms without navigating; clicking Mark toggle stays on list and toggles state.

---

## 2026-06-27 — Phase 67: My Leads table redesign

**Asked** (Qiaoxu, Slack): show listing name per row, add column headers, allow both phone and email for contact, community contact doesn't need listing and source is community name.

**Decisions** (locked with user):
- Two contact channels in the buyer-facing LeadModal — split single "Phone or email" textbox into two distinct inputs (Email / Phone). At least one required (server `LeadCreate` already enforces). A buyer can submit both.
- Message preview stays as the row's sub-line under name; no dedicated message column (would push table to 7 wide).

**Server changes**:
- `app/dashboard/leads/page.tsx` SSR query now selects `community_id, communities(name, slug)` alongside the listing join. `LeadRow` exports `listing_id: string | null` + `community_id: string | null` + `communities` shape. Polling fallback and realtime refetch share one `LEAD_SELECT` constant so SSR and client stay in lockstep.
- `app/dashboard/leads/[id]/page.tsx` mirrors the new shape. Detail page now shows a `Community` row (linked to `/c/<slug>`) for community-routed leads instead of the dummy "(unknown listing)" Listing row.
- `app/api/leads/export/route.ts` adds `kind` (listing/community) + `community` columns to the CSV. Existing columns unchanged for backward-compatible spreadsheets — the new ones append in the middle but the old positions still mean what they did.

**Buyer-facing form**: `app/(public)/_components/LeadModal.tsx` split into two inputs. The client-side validator now rejects each field independently (bad email is "Enter a valid email", bad phone is "Enter a valid phone"). Helper line under the inputs makes the "either is fine" rule explicit so a buyer doesn't feel they have to share both. Server `LeadCreate` schema already supported this — no API change.

**Table redesign** (`leads-live.tsx`):
- Switched from a borderless list of cards to a single CSS grid with shared column template between the sticky header row and each data row. Columns: status dot · Name · Listing · Contact · Source · Received · action.
- Header row has uppercase 11px column labels.
- Listing column shows the listing address; community-routed leads display em-dash there (the community name lives in Source for that case, so we don't waste a column).
- Contact column: side-by-side Email + SMS icon buttons. Each renders disabled (greyed border, no link) when the lead didn't supply that channel; renders as a real `<a>` when present and auto-marks the row as followed-up via `onMark('now')` on click.
- Source column: shows `communities.name` for community leads (overrides the literal `community-feed` source string which is useless for triage), and the raw `source` tag for listing leads. Truncates with title-tooltip at 140px.
- Search field updated placeholder to mention community; it now greps `communities.name` along with the existing fields.

**TypeScript / build**: `npx tsc --noEmit` clean. `npx next build` clean.

**Why this matters**: until phase 45.18 every lead came from a listing, so the old single-card layout was fine. Once communities started accepting leads (community owner = lead recipient) the source string `community-feed` made it impossible to tell *which* community a lead came from from the inbox. Phase 67 makes the inbox actually scannable for an agent juggling listings + communities.

## 2026-06-27 — Phase 66: leads UPDATE RLS policy — "Mark as followed up" silently no-op'd

**Reported**: Qiaoxu — "my leads → Mark as followed up doesn't work; refresh and it goes back" (Slack thread).

**Repro**: agent in `/dashboard/leads` clicks ✓ on a row → row visually flips to followed-up → snaps back almost immediately. Same on the detail-page toggle. Same when using the Email/Text icons (which call `onMark('now')`).

**Root cause**: `public.leads` has RLS enabled but `0001_init.sql` only shipped SELECT + INSERT policies — never an UPDATE policy. `0014_leads_followed_up.sql`'s header asserted "existing per-listing policies on public.leads cover this column — SELECT/UPDATE are already gated" — that was wrong; the comment described a policy that didn't exist. With RLS on and no matching UPDATE policy, every `UPDATE public.leads` from a logged-in agent silently affects 0 rows. The API route at `/api/leads/[id]/follow-up` then sees `data == null` from `.maybeSingle()` and returns 404; the client (`leads-live.tsx` `setFollowUp` and the detail-page `FollowUpToggle`) reverts the optimistic update on `!res.ok`. UX read like "it un-marks on refresh" but the revert actually fired the moment the fetch resolved.

This means **followed-up tracking has been completely broken since Phase 18 shipped** (2025 timeframe). Either no one tried it post-launch, or they assumed it was meant to be display-only. It was not.

**Fix**: `supabase/migrations/0042_leads_agent_update_policy.sql` — add per-agent UPDATE policy mirroring the SELECT policy:
```
create policy "agent updates own leads" on public.leads
  for update
  using (agent_id in (select id from public.agents where user_id = auth.uid()))
  with check (agent_id in (select id from public.agents where user_id = auth.uid()));
```
Identical USING and WITH CHECK so agents can't reassign a lead to a different agent by editing `agent_id`. No DELETE policy added — leads stay append-only; cleanup remains via the listing-cascade in 0041.

**Also**: corrected the misleading comment in `app/api/leads/[id]/follow-up/route.ts` to point at migration 0042 instead of repeating the false claim from 0014.

**Decisions**:
- Considered service-role bypass + manual ownership check in the API route. Rejected: the rest of the app uses RLS-everywhere; mixing service-role for one route makes the security model messier. Adding the missing policy is the correct shape.
- Considered also adding RLS for community lead visibility (community owners reading leads via `0029_leads_community.sql`). Out of scope — the bug report was specifically about UPDATE; SELECT for community leads is a separate axis.

**Verification**:
- `supabase db push --include-all --linked` — applied 0042 cleanly to remote prod DB.
- `npx tsc --noEmit` — clean.
- Deployment verification waits on Vercel preview + Qiaoxu confirming the toggle sticks.

**Lesson**: a comment claiming "RLS already covers this" is not a substitute for actually grepping the migrations for the policy. Migration 0014 wrote that comment, no one tested an actual UPDATE end-to-end, and the bug shipped. When adding a column gated by RLS, write the smallest possible round-trip test that actually mutates a row from the same client the production code uses.

**Commits**: pending.

## 2026-06-26 — Phase 65: object-contain everywhere (reverts + extends phase64)

**Objective**: User correction on phase64. Original intent was "L3 should look like L0" — I read the L0 cover-on-mobile pattern as the target. User clarified the actual principle: **horizontal video should play horizontal, black bars are fine, picture integrity is priority #1, do not force fill the screen.** That makes the L0 cover-on-mobile pattern the bug, not L3's contain. Reverse direction: extend `object-contain` to L0 + BrowseFeed instead of bringing cover to L3.

**Changes**:
- `CommunityListingCarousel`: revert phase64, back to `object-contain` (video + photo).
- `CommunityVideoFeed`: video + photo `object-cover md:object-contain` → `object-contain`.
- `BrowseFeed`: same on the photo carousel cell + the L0 hero video + the L0 hero photo (3 sites, replace_all patch).

**Trade-off (now flipped)**: portrait 9:16 video still fills the mobile frame fine (its aspect matches). Landscape 16:9 walkthroughs now letterbox on mobile too. User explicitly chose this — buyers see the full composition the agent shot, not a center-cropped slice. This matches how TikTok/Instagram display non-portrait video as well (small letterbox over destructive crop).

**Lesson**: when the user says "match X to Y" on a visual property, ask which direction is the truth before assuming. I assumed L0 was the model and propagated cover-on-mobile to L3; user's actual model was L3's contain. Cost was cheap because phase64 was 1-line, but on a bigger refactor this would have been an expensive misread. Save as a memory hint: ambiguous "match A to B" = ask which side is canonical, especially on aesthetics where both sides have shipped.

**Verification**: `npx tsc --noEmit` clean.

**Commits**: `264ca5d` (code) → merge `3914bcf` to main.

## 2026-06-26 — Phase 64: L3 carousel video fill-frame parity with L0 (reverted by phase65)

**Objective**: Qiaoxu reported the same listing video looks "partial / not original / smaller" in the L3 listing carousel vs the L0 community video feed — the community feed shows it edge-to-edge but the carousel had black letterbox bars around it.

**Root cause**: L3 carousel `<video>` and photo `<img>` used `object-contain` on all breakpoints. Landscape walkthroughs (16:9) inside a 9:16 mobile frame letterbox. The L0 `CommunityVideoFeed` uses `object-cover md:object-contain` — mobile fills, desktop preserves aspect inside the bordered viewport. L3 should match.

**Fix**: One-line breakpoint change — `object-cover md:object-contain` on both video and image fallback. Also added `relative` on the video element to match the L0 element (already on top of `bg-black` so it's a no-op visually but keeps DOM shape consistent).

**Trade-off**: `object-cover` will crop edges on landscape video. Acceptable: the user's primary frame is the 9:16 mobile portrait, and the L0 feed already commits to this trade-off; consistency wins. Buyers who want the full aspect can pinch out / rotate landscape (browser default behavior).

**Verification**: `npx tsc --noEmit` clean.

**Commits**: `e049ac3` (code) → merge `bb706ec` to main.

## 2026-06-26 — Phase 63: Share button on L3 carousel, drop top progress bar

**Objective**: Qiaoxu's follow-up after Phase 62 ship: (a) add a Share button to the L3 listing carousel right rail (BrowseFeed L0 has one — parity gap), (b) remove the top segmented progress bar — those ticks are the convention for horizontal pagers but Phase 62 made this surface a vertical snap feed, so the bar reads as wrong-axis affordance.

**Decisions**:
- Share URL is `/v/[agentSlug]/[listingSlug]` (same scheme BrowseFeed `onShare` uses). To build it inside the carousel we needed `agentSlug` per listing — currently `CommunityListingItem` only carried agent-less listing fields.
- Plumbed `agentSlug` through the type by joining `agents` in `page.tsx` (existing `agent_id` on the listing → `slug` lookup, in-set query, single round trip). This is light: agents-per-community is ≤ N listings ≤ ~tens, no realistic blow-up.
- Share button hidden when `agentSlug` is null (rare; covers the legacy gap where a listing's `agent_id` doesn't resolve in the agents table). Same conservatism rule used for the Contact button when there's no community owner.
- Implementation mirrors `BrowseFeed.onShare`: `navigator.share({ title, url })` with try/catch, clipboard fallback. No extra UI for "copied!" toast — keeping rail interactions silent like BrowseFeed.
- Top progress bar: deleted the JSX block entirely. The "i / N" counter in the top bar conveys the same position info without implying a horizontal scroll. Inline comment explains the removal so a future contributor doesn't reflexively add it back.

**Files**:
- `app/(public)/c/[slug]/feed/CommunityVideoFeed.tsx` — add `agentSlug: string | null` to `CommunityListingItem`.
- `app/(public)/c/[slug]/feed/page.tsx` — select `agent_id`, fetch `agents.slug` via `in()` query, pass `agentSlug` per listing.
- `app/(public)/c/[slug]/feed/_components/CommunityListingCarousel.tsx` — add `ShareIcon` import, `onShare` callback, Share `ActionButton` in rail (after Contact), delete progress-bar block, leave a comment explaining why.

**Verification**: `npx tsc --noEmit` clean; `npx next build` green; all routes compile. Live verification waits on Vercel preview.

**Carry-forward**:
- If we later add Share to other surfaces (e.g. CommunityVideoFeed for community-level share), the same `navigator.share + clipboard fallback` pattern applies; consider extracting `useNativeShare(title, url)` hook if a third call site appears.
- `agent_id` on `listings` is non-null in the schema, but `agents.slug` could in theory be missing if agent rows get out of sync. Belt-and-suspenders: render-time `if (!active.agentSlug) return` in `onShare` and conditional Share button rendering. No client crash if data is bad.

**Commits**: `9c7527d` (code) → merge `e3d5831` to main.

## 2026-06-26 — Phase 62: CommunityListingCarousel goes vertical with rail

**Objective**: Qiaoxu reported that entering listings via the community feed → "Live here" chip used a horizontal pager and lacked the right-rail (Like / Save / Contact) the other two feed surfaces have. Three feed surfaces, three different gesture/affordance shapes — bad consistency story for buyers.

**Actions**:
- `app/(public)/c/[slug]/feed/_components/CommunityListingCarousel.tsx`: rewritten. Replaced the `flex` translateX pager with `FeedShell axis="vertical"` (snap scroller). Added the standard right-rail using `ActionButton` for Like / Save / Contact, hooked to `lib/buyer/likes.ts` (`kind: 'listing'`) and `app/_actions/saved-listings.ts`. Liked/saved sets hydrated once on open via `Promise.all([listSavedListingIds, listLiked])`. ArrowUp/Down nav, IntersectionObserver for active index, Esc to close. Top bar keeps Back chip + counter; segmented progress bar retained.
- `app/(public)/c/[slug]/feed/CommunityVideoFeed.tsx`: pass `agentName={owner?.name ?? null}` so the carousel's LeadModal has a display label. Lead routing remains by `listingId` server-side.

**Decisions**:
- Like/Save target the **listing** (the user's anchor at this depth), not the community. Contrast with the L0 community feed where Save targets the community itself. The carousel is one level deeper — buyers are evaluating individual homes here, not the neighborhood.
- Contact opens LeadModal listing-targeted with the community owner's name as the agent label. Server resolves `agent_id` from `listing_id` regardless, so this is purely a display choice.
- Hidden the rail's Contact button when the community has no owner (legacy `created_by NULL` with no fallback agent — same rule as the L0 feed).
- No mute button (system volume keys per phase34a.T2).
- No Share button on the carousel — listing-level Share lives on the public listing page (`/v/[agentSlug]/[listingSlug]`); the carousel is an in-feed evaluation surface, not a deep-link destination.

**Verification**: `npx tsc --noEmit` clean. `npx next build` green. Visual sign-off after Vercel preview.

**Next steps**: None planned. Three feed surfaces are now in shape parity.

## 2026-06-26 — Phase 61: feed description "more" toggle is tappable

**Objective**: Tianrou reported the bottom-of-card description on the buyer feed (`/browse/feed`) couldn't be expanded. Caption is in the right place but the "more" affordance does nothing.

**Root cause**: In `DescriptionBlock` (BrowseFeed.tsx), the collapsed branch put the `<button>... more</button>` *inside* the same `<p className="line-clamp-2">` that wraps the description text. CSS `line-clamp` works by clipping overflow on the block — when the first paragraph overflowed two lines (which is exactly the case where "more" is needed), the clamp cut off the button along with the overflow text. Button was in the DOM, just not visible/tappable.

**Actions**:
- `app/(public)/browse/_components/BrowseFeed.tsx`: split the collapsed branch — `<p className="line-clamp-2">{first}</p>` for the text, and a sibling `<button>... more</button>` underneath inside a wrapping `<div>`. Added `mt-0.5` for tight spacing. Same shape for "less" (now `mt-1` on its own line for symmetry).

**Decisions**:
- Keep the existing `hasMore` heuristic (`paragraphs.length > 1 || first.length > 90`) — accurate enough; measuring real clamp overflow would require a layout-effect ResizeObserver and isn't worth the complexity for a caption.
- Did not move the toggle into the right rail or use a sheet; current inline expand/collapse matches the Xiaohongshu pattern the rest of the caption follows.

**Verification**: `npx tsc --noEmit` clean. Visual sign-off after Vercel preview.

**Next steps**: None planned — this is a 1-line behavioral fix.

## 2026-06-26 — Phase 60: cover_url drives buyer grid thumbnails

**Objective**: Owner re-tested Phase 59 with a *photo* cover on a listing that also has video. The grid thumbnail on `/browse` still showed the video poster, not the picked photo. Phase 59 only fixed the case where the cover and the hero were the same media kind.

**Root cause**: `lib/feed/browse-cards.ts` decides `mediaKind` purely on whether the listing has any ready video — `mediaKind = hero ? 'video' : 'photo'`. With both video + photo present, every grid surface forced video poster; `cover_url` was ignored on buyer side. Phase 59's `listing_photos` reorder ran but the buyer code path never visited the photo branch.

**Actions**:
- `lib/feed/browse-cards.ts`: select `cover_url` on the 4 listing queries (`fetchBrowseCards`, `fetchBrowseCardsByCommunitySlug`, `fetchBrowseCardsByIds`, `fetchNearbyCards`); attach as new optional `BrowseCard.gridCoverUrl`.
- `app/(public)/browse/_components/BrowseFeed.tsx`: declare `gridCoverUrl?: string` on `BrowseCard` with a doc-comment spelling out the grid-only override semantics.
- Grid consumers — `app/(public)/browse/page.tsx`, `app/(public)/saved/_components/SavedClient.tsx`, `app/(public)/nearby/NearbyClient.tsx`, `app/(public)/c/[slug]/_components/CommunityBody.tsx` — prefer `card.gridCoverUrl` over the mediaKind-derived hero src.
- `app/(public)/search/page.tsx`: same shape — read `cover_url` in the listings projection, override `cover.src` when set; keep `cover.kind` tied to whether the listing has any video so the click target still routes to `/browse/feed` for video listings.
- `app/dashboard/listings/[id]/edit/actions.ts`: both cover setters now also `revalidatePath('/browse'|'/saved'|'/nearby'|'/search')` so the new `cover_url` hits the buyer side immediately even with intermediate route caches.

**Decisions**:
- **Option B**: cover only re-skins the *grid card*, not the swipe feed. A photo-cover video listing still enters the video swipe when tapped (`mediaKind === 'video'`, route stays `/browse/feed?start=…`). User explicitly preferred this over Option A (photo cover demotes the listing to a photo-only swipe) because it preserves the video tour.
- Did **not** touch `mediaKind` — that still drives the swipe feed and the click target. Only the thumbnail src is overridden.
- Did **not** drop the Phase 59 `listing_videos` / `listing_photos` reorder. It still helps when an agent picks a non-first video as cover (the swipe also leads with it), and it's harmless in the photo-cover case.

**Issues**: None — `tsc --noEmit` clean, `next build` green.

**Next steps**: Owner verification — set a photo as cover on a listing with both video + photo, confirm `/browse` thumb shows that photo, confirm tapping the card still enters the video swipe.

## 2026-06-26 — Phase 59: Set Cover propagates to buyer surfaces

**Objective**: Owner bug report: "agent hub my listing — Set Cover is only visible from My Listing, not from buyer Explore." Picking a video/photo as cover updated the agent's `/dashboard` tile and the public listing's og:image, but `/browse`, `/saved`, `/nearby`, `/search`, and the swipe feed all kept showing whatever was uploaded first.

**Root cause**: `setListingCover` / `setListingCoverPhoto` only wrote `listings.cover_url`. Buyer-facing surfaces never read that column — they fetch `listing_videos` (or `listing_photos` as fallback) ordered by `sort_order asc` and use the first row as the hero. The cover pick and the buyer hero were two independent concepts.

**Actions**:
- `app/dashboard/listings/[id]/edit/actions.ts`: after writing `cover_url`, both setters now reorder the underlying media table — chosen row to `sort_order=0`, every other row pushed down one slot (relative order preserved). No-op when clearing the cover (`videoId`/`photoId === null`) or when the chosen row is already first.
- Single-phase rewrite (no negative-space staging) — there's no unique constraint on `(listing_id, sort_order)`, same shape as the existing `reorderListingVideos`.
- Doc-comment updated on `setListingCover` to call out the buyer-side coupling so future readers don't reintroduce the split.

**Decisions**:
- Option B from the bug-triage write-up: "Set as cover" means *this is the listing's face everywhere* — grid thumb, og:image, and feed hero all align. Decoupling them (option C) would have required teaching every buyer surface to check `cover_url` first and fall back to `sort_order`, ~6 read paths' worth of churn for no user-visible benefit.
- Photo cover and video cover still share the single `cover_url` column. Whichever the agent picks last wins on the agent surfaces; on buyer surfaces the matching media table reorder is the source of truth.

**Issues**: None — `tsc --noEmit` clean, `next build` green.

**Next steps**: Owner verification on Vercel preview — pick a non-first video as cover on an existing listing, then check `/browse` and the swipe feed both lead with that video.

## 2026-06-26 — Phase 58.2 reverted: community State/City/County dropdowns

**Objective**: Roll back v0.60.0. Owner feedback after seeing the deployed UI: "it's too much in the drop list, I don't think we should do this." The City suggestion lists in particular (CA = 1,602 items, GA = 675) were too long to scan — typing was faster than picking.

**Actions**: `git revert -m 1 a461bc4` → commit `108b043`, pushed to main. Removes `app/api/geo/`, `lib/data/us-states.ts`, `lib/data/us-geo.json`; restores the original free-text City / State (2-char) / County inputs in `CommunityEditor.tsx`.

**Learnings**: Long-tail reference data (cities, ~20k US incorporated places) is a poor fit for a `<datalist>` even sliced by state — the slice is still hundreds of items for the populous states an agent actually uses. If we revisit this, the right shape is probably (a) a 50-state dropdown only, leaving City + County free-text, or (b) typeahead that filters to the top N matches as the user types. **Don't ship full per-state lists.**

## 2026-06-26 — Phase 58.2: State / City / County dropdowns on community form

**Objective**: Vivian's quick follow-up: don't say "agents are uploading…" — buyers don't think about who's behind the platform. Use passive voice.

**Actions**:
- `ListingGrid.tsx` sub: "Check back soon — agents are uploading new tours." → "New tours will be uploaded soon — check back later."
- `CommunityGrid.tsx` sub: "Check back soon — agents are adding new neighborhoods." → "New neighborhoods will be added soon — check back later."

**Decisions**: Passive voice keeps the buyer surface noun-focused (tours / neighborhoods) without surfacing the agent role.

**Resolution**: Shipped as patch on top of phase58.

## 2026-06-26 — Phase 58: extend EmptyHubState to buyer surfaces (For You + Communities)

**Objective**: Vivian's follow-up after phase57: the buyer-side "No listings yet" (For You / `/browse`) and "No communities yet" (`/communities`) pages still looked nothing like the agent-side hubs — a single sentence on a blank cream background or a thin pill-shaped notice. She asked for the same friendly treatment across all four list surfaces.

**Actions**:
- Promoted `EmptyHubState` (and `HUB_CTA_CLASS`) from `app/dashboard/_components/` to `app/_components/` so buyer-side grids can import it without crossing the dashboard boundary. CTA prop is now optional — buyers don't create listings/communities, so the dashed-border card stands alone on those surfaces. Updated three existing imports (`DashboardListingGrid`, `CreateListingButton`, `CreateCommunityButton`, `dashboard/communities/page`) to the new path.
- `app/_components/ListingGrid.tsx`: replaced the inline `<p>No listings yet…</p>` default empty state with `<EmptyHubState icon={<Home/>} headline="No listings yet" sub="Check back soon — agents are uploading new tours."/>`. The `emptyState` prop override (used by Saved → Listings) still wins.
- `app/_components/CommunityGrid.tsx`: replaced the thin `<p>` notice with `<EmptyHubState icon={<Building2/>} headline="No communities yet" sub="Check back soon — agents are adding new neighborhoods."/>`. Dashboard's `/dashboard/communities/page.tsx` already branches around `CommunityGrid` for its empty state (with create CTA), so it isn't affected.
- TypeScript clean, `next build` clean.

**Decisions**:
- Buyer empty states ship without a CTA (vs agent empty states' pill button). Buyers can't create content here; offering a non-action would be confusing. The icon disc + headline + sub copy alone is enough to make the page feel intentional rather than broken.
- One shared component, two copy variants (sub-text differs by audience: "create your first…" for agents, "check back soon…" for buyers). Headlines are identical across audience for the same noun ("No listings yet" / "No communities yet") — keeps brand voice tight.
- Did not touch `app/(public)/saved/_components/SavedClient.tsx` (Saved Listings) — it already passes a custom `emptyState` to `ListingGrid` with the right "Save listings to see them here" copy.

**Issues**: None.

**Resolution**: All four list-surface empty states (For You, Communities, My Listing, My Community) now share chrome. Buyer surfaces are visually consistent with agent surfaces minus the create CTA.

**Learnings**:
- When promoting a component from a feature-scoped folder to a shared one, always grep the qualified import path first — there were four call sites here, easy to miss.
- "Optional CTA" is the cleanest way to support both buyer and agent variants without forking the component or adding a `variant` prop.

**Next steps**: Add an EmptyHubState to My Leads when that surface gets one; if Saved Listings ever needs a refresh, swap its custom emptyState for the shared component.

## 2026-06-26 — Phase 57: unify hub empty states (Listing + Community)

**Objective**: Vivian shipped phase56 fix, deleted her last listing → landed on `/dashboard` empty state. Two complaints: (1) the listing empty state had no clickable CTA — just a "tap + New listing" instruction pointing at the FAB, (2) listing vs community empty states looked nothing alike (different copy, different layout, community had an inline `Create one` text link, listing had nothing).

**Actions**:
- New shared component `app/dashboard/_components/EmptyHubState.tsx` — icon disc + headline + subhead + single CTA slot. Plus `HUB_CTA_CLASS` const = ink pill button styling that both create-buttons import.
- New client component `app/dashboard/_components/CreateListingButton.tsx` — mirrors `CreateCommunityButton`, calls `createStubListing()` and pushes to the new edit page.
- `CreateCommunityButton.tsx` rewritten: same `HUB_CTA_CLASS` ink pill (was a small underlined inline-text "Create one" before), Plus icon, "New community" copy.
- `DashboardListingGrid.tsx`: empty state slot now renders `<EmptyHubState icon=<Home/> headline="No listings yet" sub="…" cta=<CreateListingButton/>>`.
- `app/dashboard/communities/page.tsx`: empty state slot now renders the same `<EmptyHubState>` with `<Building2/>` icon and `<CreateCommunityButton/>`.

**Decisions**:
- Single shared chrome component, caller-supplied CTA. Considered fully generic `<EmptyHubState createAction=…>` with the action-call logic inside, rejected: the two existing actions return different shapes and route to different paths, and a future "No leads yet" empty state probably doesn't even have a create action. Letting the caller pass the CTA keeps the abstraction at the "two ad-hoc dashed boxes → one component with a CTA slot" level — exactly the duplication that was visible.
- Pill button instead of underlined text-link for the CTA. The community page had a tiny "Create one" text link buried mid-sentence — easy to miss, no clear primary affordance. Pill matches the rest of the app's primary-action chrome (Danger zone delete button, public-side ink CTAs in /a/[agentSlug] and /nearby).
- Headlines are bare ("No listings yet", "No communities yet") instead of full sentences. Sub-copy carries the orientation.
- Icons: `Home` for listing, `Building2` for community. Lucide already in use; matches the existing dashboard icon language.

**Issues**: None. tsc + `next build` clean first try.

**Resolution**: phase57 branch, merged to main once tsc/build clean.

**Learnings**:
- When the user reports two pages "are inconsistent", the underlying ask is usually "I want one of these to look like the other one"; resist refactoring both to a third design. Here Listing was the bare one and Community had the (slightly hacky) `Create one` inline link — the right move was extracting the better idea (a real CTA) into a shared component, not redesigning the visual language.
- The original community empty state used a shrinkwrapped inline text link inside a sentence — phrase-based affordances scan poorly on mobile because thumb targets are imprecise. Pill buttons with a fixed footprint are the safer default for any "create your first X" CTA.

**Next steps**: Vivian eyeballs both empty states on Vercel preview. If `My Leads` is the next surface that gets an empty state, reuse `EmptyHubState` (no CTA — leads are buyer-initiated, not agent-created).

## 2026-06-26 — Phase 56: leads.listing_id missing ON DELETE CASCADE

**Objective**: Fix "server-side exception (digest 881108286)" Vivian hit when deleting her last listing from `/dashboard/listings/[id]/edit` Danger zone. Reported as "last listing can not be deleted", but the actual trigger is "any listing that has ever received a lead".

**Root cause**: `supabase/migrations/0001_init.sql:283` declared `leads.listing_id uuid not null references public.listings` — a plain FK, no `on delete cascade`. Every other listing-child table in the schema (`listing_videos`, `listing_photos`, `photos`, `events`, `favorites`, `saved_listings`, `saved_social_drafts`) does cascade. Leads was the only oversight from the original init migration. Result: `DELETE FROM listings WHERE id=…` raised an FK violation on any listing with at least one lead row → `deleteListing()` returned `{ ok: false, error }` → `deleteListingAndRedirect` re-threw → Next.js wrapped it as a server-side exception. Vivian's "last" listing was the one that had accumulated test leads.

**Actions**:
- New migration `supabase/migrations/0041_leads_cascade_on_listing_delete.sql`: drop + re-add `leads_listing_id_fkey` with `on delete cascade`.
- `supabase db push` against prod — applied cleanly.
- `npx tsc --noEmit` clean (pure SQL change, no TS surface touched).

**Decisions**:
- Cascade rather than `set null` or app-level pre-delete cleanup. Reasoning: a lead's only meaningful context is the listing it was sent about; orphaning it (set null) would leave a buyer message attached to nothing. Cascade also matches what the DangerZone confirm copy already promises ("Videos, photos, leads and analytics will be removed") — the schema was just lying.
- One-line constraint swap, no app code change. Considered also fixing the Danger zone error UX (current `alert()` is easy to miss on iOS), but that's a P2 and the user only asked for the actual-delete path to work.

**Issues**: None. SQL applied first try.

**Resolution**: Push branch → verify Vercel preview → ask Vivian to retry deletion on the listing that previously errored.

**Learnings**:
- Whenever a child table has `not null references parent`, the cascade behaviour MUST be specified explicitly. Postgres defaults to `NO ACTION` (which behaves like `RESTRICT` here) — silent footgun for any "delete the parent" UX. Audit during schema review: every `references` line should explicitly say `on delete cascade` or `on delete set null` (or have a comment explaining why RESTRICT is intentional).
- The "last listing won't delete" framing was misleading — could equally have been "first listing with leads won't delete". Worth probing for "did this listing ever receive a buyer message?" next time a delete-listing bug comes in, before chasing list-empty-state hypotheses.

**Next steps**: Merge to main once Vivian confirms a delete works on a leads-bearing listing in preview.

## 2026-06-25 — Phase 55 ROLLBACK: feed autoplay polish broke first-paint

**Objective**: Revert phase55 (commit `22f754e`) — Vivian reported "全是黑屏 视频和声音都没有 过几秒才都出现". Phase55 made playback start observably slower / blanker on the first card.

**Actions**:
- `git revert -m 1 22f754e` → commit `9b2caab` on main, pushed.
- Build + tsc clean post-revert.

**Issues / Resolution (root-cause hypothesis, NOT yet verified — fix-forward attempt deferred)**:
- Most likely culprit: the new `setUserPaused(false)` inside the `[isActive, shouldMount, muted, ...]` effect on Card / VideoCard. Combined with `cardRefs.current.get(activeIndex).querySelector('video')` from the parent unmute listener (also depends on `activeIndex`), this re-runs the play/pause effect every time the active card changes. On a fresh card mount the order becomes: setUserPaused(false) → setState re-render → effect re-runs → muted re-applied → play() retried. That extra re-render before `v.play()` resolves is what produces the visible black-frame gap on iOS Safari.
- Secondary suspect: the unmute listener's `activeIndex` dep means the listener tears down + re-installs every swipe. When `wasAutoplayBlockedRef=true` AND a touchstart is mid-flight during the swipe, the once-listener can fire on the swipe gesture itself (not on a subsequent tap), unmuting + calling `v.play()` on a card that's still loading HLS → race against the IntersectionObserver-driven play call.
- Touchstart + pointerdown both passive once-listeners with `activeIndex` in dep array also means TWO unmute attempts can land back-to-back during a single swipe (touch fires first, pointer second on some Safari versions), each calling `v.play()` and `v.muted=false` on the active video → second play() can interrupt the first's loading, surfacing a black frame.

**Decisions**:
- Roll back first, diagnose second. Vivian was actively testing and a regression on first-paint is worse than the original two-swipe sound bug.
- Don't fix-forward in the same session — re-design needs a real device session, not blind patches.

**Learnings**:
- Adding state writes inside the play/pause effect (even cheap `setUserPaused(false)`) can introduce a render gap before `v.play()` on iOS Safari. The original `paused` boolean was driven by play().then/catch resolution, which kept the visible state coupled to actual playback readiness. Splitting `userPaused` out as eager-cleared state decoupled it from playback readiness — exactly the wrong direction for first-paint timing.
- Don't re-issue `v.play()` from a window-level unmute listener while the IntersectionObserver-driven effect is also calling play() during a swipe transition. Two callers racing on the same `<video>` element produces black frames.
- Anti-pattern recorded: "eager state-clear in play/pause effect" + "passive once-listener with re-binding deps that include the active index". Both touch the video element across renders in ways that defeat browser playback-readiness heuristics.

**Next steps**:
- Re-design without these two patterns. Possible approaches:
  1. Drive `userPaused` purely from `<video>` element events (`onpause` with a "was the pause caused by user tap?" flag) instead of useState writes inside the play/pause effect.
  2. Drop the `activeIndex` from the unmute listener deps; install once on mount and read activeIndex through a ref. Pick `touchstart` OR `pointerdown` (not both) to avoid double-fire.
  3. Or: leave the original behavior and accept the play-button flash + occasional swipe-to-unmute. Vivian's bug is real but the cure was worse than the disease.
- Confirm with Vivian whether to retry with a redesigned pass or leave as-is.

(Note: phase55 originally had its own DEVLOG entry; the revert removed it along with the code. See commit `348c6b5` for the original implementation diff if you need to study what went wrong.)

## 2026-06-24 — Phase 54: delete demo-media fake-data layer

**Objective**: User asked to "删除所有 fake data 和测试数据". Confirmed scope =
only the runtime curated-stock override layer (`lib/demo-media.ts` + 14
callers). Design-mock HTML prototypes under `public/design-mocks/` and
`public/prototype/` and the vitest `__tests__/` suites stay (they are
visual-sign-off assets and unit tests, not fake data).

**Actions**:
- Deleted `lib/demo-media.ts` (DEMO_MEDIA_ENABLED, demoCoverFor,
  demoHeadshotFor, demoVideoFor, demoPhotosFor, DemoVideoPool).
- Deleted `public/demo/villa-music.mp4` (only file under public/demo/, the
  one bespoke ambient-music demo asset wired to listing
  655c43c6-…dd9b9d via DEMO_LISTING_VIDEO_OVERRIDE).
- Cleaned all 14 callers: removed import lines, simplified
  `demoCoverFor(id, real) → real`, `demoHeadshotFor(real) → real`,
  `demoVideoFor(...) → null` (drop demo-video branch, keep HLS path),
  `demoPhotosFor(id, real) → real`. Dropped now-orphaned `isDemoStock`,
  `demoVideoUrl`, `isDemoVideo`, `realSrc` locals and the "Stock" badge
  UI gated on isDemoStock (in `/a/[agentSlug]`, `/search`, `/browse`).
- `next.config.mjs`: removed remote-image patterns for
  `images.unsplash.com`, `images.pexels.com`, `videos.pexels.com` plus
  the surrounding "Demo-media curated stock" comment block. Kept
  Supabase + Cloudflare Stream entries.
- `app/dashboard/communities/[id]/page.tsx`: also dropped now-unused
  `import { thumbnailUrl }` and the `void thumbnailUrl;` stub line that
  existed only to keep the import alive for transitive demoCoverFor needs
  in CommunityBody. CommunityBody still imports thumbnailUrl directly.
- `app/(public)/a/[agentSlug]/page.tsx`: also dropped now-unused
  `GridCardBadgeDark` named import (only used to render the Stock badge).

**Decisions**: The override layer existed for pre-launch demo polish
(curated Unsplash/Pexels CDN stock to make sparse listings look like a
luxury portfolio). Project comments + CLAUDE.md already had a "no fake
data" rule the override was a transitional violation of. Deleting the
whole layer is cleaner than gating it behind a flag that's been off in
prod since launch — the kill-switch + override pattern adds branching
to every render path with no production payoff.

**Issues**: First subagent attempt hit the 50-call delegation limit at
9/14 files (hit the same threshold flagged in my memory at ~15 files).
Parent finished the remaining 5 files directly via patch — net 22 patch
calls, which lines up with the "≤11 files mechanical → parent does it"
heuristic from prior phases.

**Resolution**: tsc clean, `next build` successful, branch merged to
main (squashed below into a single phase commit).

**Learnings**:
- The 11-file threshold for direct parent execution holds: 14 files +
  some non-trivial cleanup (Stock badge UI, unused imports) was right
  on the edge — subagent + finish-parent split was the right call but
  required 50 + 22 = ~72 calls total vs. probably 30-35 if I'd done it
  all in parent. Next time, files that involve UI removal (not pure
  call-site replace) should bump the threshold up.
- `public/demo/` had exactly one asset and was demo-only — `rm -rf
  public/demo/` was safe. If the directory had had production assets
  alongside the demo MP4, that would have been a footgun.

**Next steps**: Pre-launch the platform was built around a `DEMO_MEDIA`
kill-switch — flipping it to false was the launch lever. Now removed,
real listings show real media unconditionally. If demo polish is needed
again for sales/marketing, do it via per-listing seeded fixtures in
Supabase, not a runtime override.

## 2026-06-24 — Phase 53 Phase D: getSession() sweep across all render paths

**Trigger.** Phase C proved swapping `getUser()` → `getSession()` saves ~150ms
on `/dashboard/communities`. Same pattern applies to every page and chrome
wrapper that renders behind middleware-enforced auth: middleware already
validates the JWT on every request, so the page-level `getUser()` call is a
redundant ~150ms round-trip to Supabase.

**Change.** Mass swap across **16 files**:

Pages (12):
- `app/page.tsx` (landing)
- `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`
- `app/(public)/profile/page.tsx`, `app/(public)/search/page.tsx`
- `app/dashboard/page.tsx`, `app/dashboard/analytics/page.tsx`
- `app/dashboard/leads/page.tsx`, `app/dashboard/leads/[id]/page.tsx`
- `app/dashboard/communities/[id]/page.tsx`
- `app/dashboard/listings/[id]/edit/page.tsx`, `app/dashboard/listings/[id]/preview/page.tsx`

Chrome (4):
- `app/dashboard/layout.tsx`
- `app/_components/BottomNavWrapper.tsx`
- `app/_components/DesktopSidebarWrapper.tsx`
- `app/_components/TopBarWrapper.tsx`

Each call site replaces:
```ts
const { data: { user } } = await supabase.auth.getUser();
```
with:
```ts
const { data: { session } } = await supabase.auth.getSession();
const user = session?.user ?? null;
```

The `user` local var is preserved so downstream `if (!user)` / `user.id` /
`user.email` reads work unchanged. `getSession()` reads only the cookie —
no network call.

**Why chrome matters most.** `BottomNavWrapper` / `DesktopSidebarWrapper` /
`TopBarWrapper` mount on the root layout, so they fire on **every page
render** alongside the page's own `getUser()`. On dashboard routes this
was 2× round-trips (chrome + page) ≈ 300ms before any data fetch. Both
are now cookie-only.

**Expected impact.** Dashboard pages: ~300ms shaved off TTFB (chrome 150ms +
page 150ms). Public/auth pages: ~150ms.

**Scope chosen.**
- ✅ Swapped: server components on the render path (pages + chrome wrappers).
- ❌ Kept `getUser()`: server actions (mutations) and API routes. These run
  on writes/POSTs where revalidating the JWT is a meaningful security
  boundary; the latency is paid once per action, not per render.

**Tradeoff.** Same as Phase C: a token revoked within the last hour will
still authorize a render. Middleware blocks unauthenticated traffic outright;
the only window is "revoked but cookie still presents a valid session" —
acceptable for this app.

**Followups.**
- Apply `unstable_cache` to per-user data with a user-scoped cache key
  (`['agent-row', user.id]` etc.) once we see the next round of prod numbers
  and identify the bottleneck. Per-user caching is more complex than
  per-table caching — wait for evidence before adding it.
- Remove Phase B instrumentation after this deploy if the numbers confirm.

## 2026-06-24 — Phase 53 Phase C: cache + parallel auth on /dashboard/communities

**Trigger.** Phase B prod log showed:
- `perf:dashboard-communities {"total_ms":417,"createClient":2,"auth":159,"fetchCards":256,"cardCount":11}`
- `perf:fetchCommunityListCards {"total_ms":481,"createClient":1,"wave1":220,"wave2":259,"shape":1,"communities":11,"memberships":7,"videoRows":7,"listingRows":1}`

Data is tiny (11 communities, 7 videos, 1 listing) — the freeze is round-trip
latency, not query work. Vercel ↔ Supabase round-trip is ~150–260ms per hop;
we can't shrink that, only avoid it.

**Changes.**
1. **`unstable_cache` wrap** (`lib/communities/list.ts`). 60s TTL, tag
   `'community-cards'`. Communities are globally readable, so a process-wide
   shared cache is safe — every dashboard agent sees the same rows for these
   particular tables. Cache hit ≈ 5ms vs ~480ms uncached.
2. **`createAnonClient()`** (`lib/supabase/server.ts`). `unstable_cache`
   forbids `cookies()`/`headers()` inside the cached fn, so the cookie-bound
   `createClient()` doesn't work there. New cookie-less anon client. Safe
   because the queries hit globally-readable tables only.
3. **`getSession()` instead of `getUser()`** (page.tsx). `getUser()` does a
   network round-trip to Supabase to validate the JWT (~150ms); `getSession()`
   reads the cookie locally (~5ms). Middleware already gates `/dashboard/*`
   behind auth, so the page-level check is just defense-in-depth — no need
   to re-validate the token.
4. **Auth + fetch in parallel.** Cards data doesn't depend on the user
   (community list is global). `Promise.all([getSession(), fetchCards()])`.
5. **`revalidateTag('community-cards')`** wired into every community/listing
   mutation server action (create, update, delete, status flip, cover set,
   listing publish/unpublish, listing archive). Cache invalidates within ~1s
   of any data change.

**Expected prod numbers.**
- Cold (cache miss): ~270ms (was 417ms) — saves ~150ms by skipping `getUser()`
  round-trip and running fetch in parallel with auth.
- Warm (cache hit): ~10–20ms — saves ~400ms by skipping all data round-trips.

**Tradeoffs.**
- 60s staleness on dashboard view after a community/listing mutation by
  *another* agent. Same-agent mutations invalidate via `revalidateTag` so
  feel instant. Cross-agent staleness is acceptable for this view (no
  real-time semantics needed).
- `getSession()` doesn't catch a token revoked within the last hour. Dashboard
  middleware blocks unauthenticated traffic; the worst case is "agent's
  session was revoked but they still see the dashboard for ≤60min" — for
  this app the risk is a rounding error.
- New `createAnonClient()` adds a code path that bypasses cookie auth.
  Documented as "only for inside `unstable_cache`, only for globally-readable
  tables." Reviewers should double-check any new caller.

**Followups.**
- Apply the same pattern to `/dashboard/listings`, `/communities`, `/browse`
  once we confirm prod numbers from this deploy.
- Phase B instrumentation (`lib/perf/timing.ts` + page/loader marks) stays
  for one more deploy to validate; remove next phase.

## 2026-06-24 — Phase 53 Phase B: timing instrumentation on /dashboard/communities

**Trigger.** Owner: "还是慢" after Phase A (skeleton + parallel queries).
Before guessing at the next optimization (cache / RPC / edge runtime), we
need actual numbers. Phase A was theory-driven; Phase B is data-driven.

**Change.** Added `lib/perf/timing.ts` — a tiny `startTimer(label)` helper
that emits a single JSON line per request to stdout (visible in Vercel
function logs). Instrumented two surfaces:

- `app/dashboard/communities/page.tsx`: `createClient` → `auth` → `fetchCards`
- `lib/communities/list.ts`: `createClient` → `wave1` → `wave2` → `shape`

Each emits one log line, e.g.:
`perf:dashboard-communities {"total_ms":612,"createClient":4,"auth":180,"fetchCards":428,"cardCount":12}`

**Why this shape.** Two separate timers (page + loader) so we can attribute
time to (a) Supabase auth, (b) Wave 1 query, (c) Wave 2 query, (d) JS
shaping. If Wave 1 dominates → memberships scan is the issue (full-table
scan on `community_video_membership`). If `auth` dominates → the actual
freeze is auth, not data, and `unstable_cache` won't help. If everything
is fast (~50ms each) → the freeze is somewhere else (middleware, JS bundle,
RSC payload size).

**Tradeoff.** One extra `console.log` per request. Negligible cost; will
remove once we've made the next call.

**Next.** Owner clicks Communities a few times in prod, we read the Vercel
logs, then decide between `unstable_cache` (data slow), middleware audit
(auth slow), or `<Link>` audit / bundle work (everything fast → freeze is
client-side).

## 2026-06-24 — Phase 53: Community nav perceived-perf (Phase A — skeleton + parallel queries)

**Trigger.** Owner: "Let's improve the performance/responsiveness, all button
click take seconds instead of ms to load … click community for the first time
it loads super slow." Confirmed prod, not dev. Scoped to Phase A: minimal,
high-ROI changes on `/dashboard/communities` first to validate the pattern
before fanning out to other surfaces.

**Root cause.** The "button" wasn't slow — Next.js App Router waits for the
server component to finish rendering before swapping the view, so the click
freezes the UI for the full server time. Two compounding issues:

1. `fetchCommunityListCards` issued **5 sequential Supabase round-trips**
   (`auth.getUser` → communities → memberships → videos → listings).
   At ~100ms each that's 500–800ms of pure network serialization, all
   blocking the navigation.
2. `app/dashboard/communities/` had **no `loading.tsx`**. Once the user is
   already inside `/dashboard`, the parent `app/dashboard/loading.tsx`
   doesn't re-trigger for a sibling segment, so the user sees zero feedback
   for the entire server time — that's the "frozen button" feeling.

**Fix (Phase A).**

- Added `app/dashboard/communities/loading.tsx` — same skeleton metrics as
  the public `/communities/loading.tsx` so the layout doesn't shift when the
  real grid renders. Click-to-skeleton is now <100ms; perceived freeze gone.
- Rewrote `lib/communities/list.ts` into **two parallel waves**:
  - Wave 1 (no inter-dep): `Promise.all([communities, memberships])`
  - Wave 2 (uses Wave-1 ids): `Promise.all([videos, listings])`
  - Net: 5 sequential trips → 2 wave-max trips. Expected server time
    drop from ~500–800ms to ~200–300ms.

**Tradeoffs surfaced to owner before coding.**

- Skeleton is observational only — TTI doesn't drop, only TTFP feels
  instant. Acceptable because the freeze was the actual UX complaint.
- `Promise.all` short-circuits on any rejection. Kept that behaviour
  rather than `allSettled`-with-defaults — if memberships fail we'd
  rather show an error boundary than silently render a grid with all
  videoCount=0. Reassess if Supabase reliability becomes an issue.
- `Promise.all` opens multiple Supabase connections concurrently per
  request. At current traffic this is irrelevant; flag for revisit if we
  hit pool limits.
- Did NOT add `unstable_cache`, edge runtime, or RPC consolidation —
  Phase B candidates pending data on whether Phase A is sufficient.

**Verification.** `npm run typecheck` clean; `npm run build` clean.
Visual verification deferred until Vercel preview.

**Out of scope for Phase A** (deliberately). `/dashboard/listings`, public
`/communities`, `/browse`, `<Link>` vs `router.push` audit. Phase B will
fan out the pattern after confirming the perceived-perf delta on
`/dashboard/communities`.

**Next.** Push branch → Vercel preview → owner verifies "click → instant
skeleton → real grid <300ms". If yes, Phase B (fan-out + maybe
`unstable_cache`). If still feels slow, escalate to RPC consolidation or
caching.

## 2026-06-24 — Phase 52.1: Save button always-on + delete dead upload-prefill plumbing

**Trigger.** Owner: "两个 detail 页面自动保存 save button 不可用 这样用户体验
不好 让 save button 永远可用" + "用不到的都删掉 随时做重构增加代码可读性
记住这个."

**Bug.** Both edit pages disabled the explicit Save button whenever the form
was "clean" (`!isDirty`). To agents this looked broken: auto-save had
already flushed, the button was dimmed, and there was no obvious way to
re-confirm. Fix: drop the dirty check from the disabled prop entirely.
Save is now always enabled (except mid-saving) — clicking it always calls
`runSave({ silent: false })`, which is idempotent on a clean form. The
`isDirty` state itself is gone from `EditListingForm` (and the equivalent
in `CommunityEditor`); `dirtyRef` stays because the auto-save flush still
needs it.

**Cleanup pass.** Phase 52 left a pile of dead prefill / upload-status
plumbing — code that the FAB → `/listings/new`?prefill=… handoff used to
need before Phase 52 collapsed everything to stub-then-redirect. Owner
codified the workflow rule: "用不到的都删掉,随时做重构增加可读性,不单开
cleanup phase." So this batch:

- **Deleted files**:
  - `app/_components/upload-prefill-store.ts`
  - `app/_components/upload-status-store.ts`
  - `app/dashboard/communities/[id]/PrefillUploadBanner.tsx`
- **Pruned props / signatures**:
  - `PhotoPanel` (listings) — removed `prefillFiles?` prop + the
    `consumePrefill` useEffect that auto-uploaded queued photos.
  - `CommunityPhotoPanel` — removed `prefillFiles?` and
    `onUploadResolved?` props plus the `onResolvedRef` plumbing that
    routed each per-file outcome into the (now-deleted) upload status
    banner.
  - `CommunityMediaPanel` — removed the `?prefill=<id>` consumer block
    (`useSearchParams` + `consumePrefill` + `setUploadTotal` /
    `reportUploadDone` / `reportUploadFailed`) and the
    `handlePhotoResolved` callback that fed it.
  - `createCommunity` (server action) — removed the `options.prefillId`
    argument; nothing left in the codebase passes it.
- **Imports**: stripped `useEffect` from `PhotoPanel` and
  `CommunityPhotoPanel` (no longer used), `useSearchParams` from
  `CommunityMediaPanel`, and the `PrefillUploadBanner` import in
  `app/dashboard/communities/[id]/page.tsx`.

`tsc --noEmit` ✅, `npm run build` ✅. No new routes or props surfaces. The
only behavioural change is the always-on Save button.

**Lesson.** When the entry path that fed a piece of plumbing gets removed,
delete the plumbing in the same pass — leaving it dormant ("we'll do a
cleanup phase") just makes future readers wonder if it's still load-bearing.
Skill `subagent-driven-development.md` already captures the "delete dead
code immediately" stance; reinforced here for prefill-style multi-component
plumbing where the dead surface spans 4 files.

## 2026-06-24 — Phase 52: stub-first listing/community create flow

**Trigger.** Owner ask: "重新设计上传视频/照片 + 新建 listing/community 的交互,
对 selling agent 要足够友好." The previous flow had three separate
entry shapes — `UploadSheet` (album/camera/source picker → file
prefill), `/dashboard/listings/new` (address + price + beds + baths +
sqft form), and `createStubCommunity` (one-tap stub → hub). For agents
who think in "build a listing slowly" rather than "TikTok-style
upload-and-go", this was friction without payoff: agents would hit the
new-listing form, abandon when they didn't have all five fields handy,
and never come back. Communities had no equivalent friction — the stub
flow there worked well.

**Decision.** Mirror communities for listings. The FAB sheet collapses
to two equal tiles (Listing / Community); both call a stub action that
inserts a row immediately and pushes the agent to the edit page. No
file prefill, no source picker, no entry-form gate. Media tab stays
separate (owner ask: "media tab 还是保留" — visual prototype had
proposed merging it into the details tab, but the owner reverted).

**Schema fit.** `listings.address` is NOT NULL (migration 0001) and
`(agent_id, slug)` is UNIQUE. We can't omit address at insert time, so
`createStubListing` writes a placeholder `__draft__-<rand>` to both
columns. A new helper module `app/dashboard/listings/draft.ts` exports
`DRAFT_ADDRESS_PREFIX` + `isDraftAddress(s)` — split out of the
`'use server'` action file because async server actions can't co-export
synchronous constants. Status defaults to `inactive` (the
post-migration-0030 two-state world), so drafts never leak to `/browse`
or the swipe feed (both already filter `status='active'`).

**Address commit on first save.** `updateListingAddress(id, input)`
guards on `isDraftAddress(current.address)` — once you've committed a
real address it refuses further address edits, because the slug is
already published at `/v/<agent>/<slug>` and rewriting it would break
shared links. On the first commit it re-derives the slug from the real
address via `deriveSlug` and handles 23505 collisions with `nextCandidate`
up to 20 retries. The publish gate (`publishListing`) was tightened to
also reject `isDraftAddress(address)` so a draft can't accidentally be
flipped active.

**UI.** A new `DraftAddressPanel.tsx` renders on the edit page when
`isDraftAddress(listing.address)` is true; it does the same Place
Details autocomplete + resolve dance the deleted NewListingForm did,
then calls `updateListingAddress` and `router.refresh()`. The other
tabs (Media / Marketing / Leads / Analytics) render a "Set an address
to unlock this section" notice in draft state to avoid loading photo
panels against a placeholder URL. The dashboard grid shows
"Untitled draft" + a Draft badge for these rows.

**Deletions.** Removed `app/dashboard/listings/new/` (page + form +
actions). `UploadSheet.tsx` was rewritten from 12,866 → 7,678 bytes,
dropping the album/camera tile, the file prefill flow, and the
`stashFiles` call. The prefill store + 18 `stashFiles | peekPrefillCount
| takePrefillFiles | consumePrefill` references on the listing /
community panels are now dead code (consume always returns null) but
left in place to keep this phase scope-bounded; cleanup belongs in a
separate dead-code pass.

**Files touched.**

- new: `app/dashboard/listings/draft.ts` (497 B), `app/dashboard/listings/actions.ts`
  (`createStubListing`), `app/dashboard/listings/[id]/edit/DraftAddressPanel.tsx`
- rewritten: `app/_components/UploadSheet.tsx` (two-tile sheet)
- patched: `app/dashboard/listings/[id]/edit/actions.ts`
  (`updateListingAddress`), `app/dashboard/listings/[id]/edit/publish-actions.ts`
  (draft gate), `app/dashboard/listings/[id]/edit/page.tsx` (draft branch
  + locked tabs), `app/dashboard/page.tsx` ("Untitled draft" + Draft badge)
- deleted: `app/dashboard/listings/new/`

**Pitfalls hit.**

1. `'use server'` files cannot export non-async constants — the helper
   has to live in a separate module.
2. `listings.address NOT NULL` means we cannot insert a real "draft"
   row without a placeholder string; the sentinel approach (matching
   `__draft__-<rand>` prefix) avoids a schema migration.
3. Browse / `/v/<slug>` already filter `status='active'`, so the draft
   placeholder address can never reach a public surface — the gate is
   schema-level, not just application-level.

## 2026-06-24 — Phase 51 follow-up #2: silent auto-save (feedback only on explicit Save click)

**Objective**: qiaoxux: "Both - auto save doesn't need to click the save button effect and show the saved hint, only users click the save button, then do that". After Phase 51 added an explicit Save button alongside auto-save, both code paths drove the same `saveState` machine — so every keystroke triggered the "Saving… / ✓ Saved" pill at the bottom of the form, even though the user never asked for it. Owner wants auto-save to be invisible; the visible status text should be reserved for explicit Save clicks.

**Actions**:
- `app/dashboard/listings/[id]/edit/EditListingForm.tsx`:
  - Refactored `runSave()` to take a `silent: boolean` parameter. Silent path never touches `saveState` (no `'pending' | 'saving' | 'saved' | 'error'` flips), so the bottom-of-form status row stays quiet during background ticks. Errors during silent save still update `errorMsg` (non-silent invalid edits would be worse).
  - Added a separate `isDirty` useState (boolean), set true on any field edit and cleared on save success (auto or explicit). This drives the Save button's `disabled` prop — `saveState` alone can no longer be relied on as a "nothing to save" signal once auto-save is silent.
  - Split saver into two functions: `flushNow()` (silent, kept for PublishPanel handshake — publish doesn't want a "Saved" flash to flicker before publish takes over) and `saveNow()` (visible, drives `saveState`, called by the Save button onClick).
  - Auto-save useEffect: removed `setSaveState('pending')`; replaced with `setIsDirty(true)`. Calls `runSave(true)` (silent).
  - beforeunload: dropped `'pending'` from the unsaved-work check (no longer set by auto-save); kept `dirtyRef.current || saveState === 'saving'` as the guard.
  - Bottom save row button: `onClick={() => void saveNow()}`, `disabled={!isDirty || saveState === 'saving'}`.
- `app/dashboard/communities/[id]/CommunityEditor.tsx`:
  - Same `runSave(silent)` refactor. Silent path skips `setSaveState`, skips `setFieldErrors({})` / `setFormError(null)` reset, and skips `router.refresh()`. fieldErrors and formError ARE still surfaced from a silent-save server response — silent ≠ swallow validation, an invalid form field needs to be visible regardless of which code path triggered the request.
  - Removed the prop-derived `useMemo`-based `isDirty` (lines 136-176 in the prior file). Replaced with state-driven `isDirty` + `setIsDirty`. Rationale: silent auto-save never calls `router.refresh()`, so the `community` prop passed in from the server component stays stale after a successful background save — a prop-vs-state diff would keep returning true even though the form is in sync with the database. State-driven `isDirty` reads "is there an edit since the last save?" which is what the button actually wants to know.
  - Renamed the now-redundant `flushNow()` away — only the visible explicit-click path is kept (`saveNow()`); `onSubmit` calls `saveNow()` instead of `flushNow()`. Community has no PublishPanel, so there was no external caller of the silent flush.
  - Auto-save useEffect: `setSaveState('pending')` → `setIsDirty(true)`; `runSave(false)` → `runSave(true)`.
  - beforeunload guard: dropped `'pending'`.
- `RELEASE.md` — added v0.55.2 entry.

**Verification**: `npx tsc --noEmit` clean. `npm run build` clean (Next 15.5, First Load JS shared 87.3 kB).

**Result**: Auto-save behavior is unchanged from the user's perspective except the "Saving… / ✓ Saved" pill no longer flashes at the bottom while typing. Click the Save button → see "Saving…" → "✓ Saved" → idle. Identical UX on both surfaces.

**Notes for next time**:
- The pair-drift convention (`references/listing-community-pair-drift.md`) held — same change shape applied verbatim to both surfaces. Confirmed worth keeping the explicit "if you change one, change the other" rule.
- Memory pitfall to remember: when auto-save skips `router.refresh()` (deliberate, to avoid mid-edit flicker), any `useMemo` on the server-component prop becomes a stale-data trap. State-driven dirty flag is the right primitive. Filed as candidate for the React/Next.js pitfalls section.

## 2026-06-24 — Phase 51 follow-up: move listing Save button to the bottom

**Objective**: qiaoxux: "My listing - move the save button to the end of the inputs. Similar to my community page! Also when clicking save, show something indicating the changes are saved." Initial Phase 51 put the Save button + SaveBadge in the header (above the inputs); owner wants the community-style footer placement.

**Actions**:
- `app/dashboard/listings/[id]/edit/EditListingForm.tsx`:
  - Removed the header row containing `<SaveBadge>` + the Save button.
  - Added a footer row at the very bottom of the form (after the Description field), mirroring `CommunityEditor`'s pattern: `border-line border-t pt-4`, primary `Save` button, inline `✓ Saved` flash on success, inline error text on failure.
  - Deleted the now-unused `<SaveBadge>` component (orphan from this change — CLAUDE.md §0.3 cleanup).
  - File-header note updated to mark the Phase 51 follow-up move and quote the owner ask verbatim.

**Decisions**:
- The `✓ Saved` inline text already satisfies "show something indicating the changes are saved" — same treatment as community, no new affordance needed.
- Did NOT add a separate "Editing… / Saving…" status anywhere else in the form. The Save button label flips to `Saving…` mid-flight, and the auto-save still runs silently; that's all the inline feedback the community surface has, and parity was the explicit ask.

**Verification**: `npx tsc --noEmit` clean, `npm run build` clean.

## 2026-06-24 — Phase 51: Save button parity (listing + community auto-save)

**Objective**: qiaoxux on the agent hub: "my listing details page should have a save button similar to my community page". Picked option 2 (auto-save + explicit Save button coexist) and asked to apply to both surfaces. Two follow-up constraints: button label is `Save` (not `Save changes`), and the `No unsaved changes` hint goes away.

**Background — why the two surfaces drifted in the first place**: Phase 8 (2026-06-11, `listing-form-autosave`) deliberately switched the listing editor from explicit save to debounced auto-save with a SaveBadge. The community editor stayed on explicit Save changes through Phase 50.7. So the listing surface had no button at all, and the community surface had a button but no auto-save — exact mirror image of each other. Owner now wants both: instant background save **and** an explicit confirm button on both surfaces.

**Actions**:
- `app/dashboard/listings/[id]/edit/EditListingForm.tsx`: added a `Save` button next to the existing `<SaveBadge>` in the header row. Clicking calls the existing `flushNow()` (which Phase 8 already exposed for PublishPanel) — cancels any pending debounce, awaits in-flight, runs one fresh save. Disabled when `saveState ∈ {idle, saved, saving}`. File-header note appended marking Phase 51.
- `app/dashboard/communities/[id]/CommunityEditor.tsx`: introduced the listing's auto-save state machine — `debounceRef` / `inflightRef` / `dirtyRef` / `initialMountRef`, 600ms debounce, `runSave(refreshOnSuccess)` extracted from the old `onSubmit`, `flushNow()` for the explicit-Save path, plus `beforeunload` warning. `<SaveBadge>` not added to the community surface — kept the existing inline status text (`✓ Saved` / `Error: …`) since the surface already had it and it reads fine. The submit button now flushes via `flushNow()` instead of building the payload itself; auto-save ticks skip `router.refresh()` (would flicker mid-edit), only the explicit Save click refreshes.
- Owner asks (literal):
  - Button label `Save changes` → `Save`. Renamed both surfaces.
  - The `<span>No unsaved changes</span>` hint that used to render when `!isDirty && saveState !== 'saved'` is gone. The button just sits disabled — the SaveBadge / lack of activity is the signal.

**Decisions**:
- **Did NOT extract `<SaveBadge>` into a shared component.** Two surfaces, two slightly different status surfaces (listing has badge pill; community already had inline text). Sharing would force a single visual treatment on both — surgical-changes principle says don't.
- **Auto-save tick failures still surface fieldErrors / formError on the community side.** Asked owner whether to expose them in the auto-save path; default-yes was the right call — silent invalid state on auto-save would be worse than a surfaced error pill while the agent is still typing.
- **Did NOT touch `flush-registry`** — that's the listing↔PublishPanel handshake. Community has no publish flow, no need for the registry.

**Issues**: none — tsc clean, build clean on first try.

**Verification**:
- `npx tsc --noEmit` clean
- `npm run build` clean (Next 15.5)
- `git log` SHA captured below

**Learnings**:
- The flush-now-as-explicit-save pattern is dead simple when auto-save already exists: the explicit button just calls the same flush path PublishPanel uses. Adding it to community took 90% rewriting the save state machine to mirror the listing's, 10% wiring the button.
- listing/community pair drift bites again — this is exactly the case in `references/listing-community-pair-drift.md`. Two surfaces should have moved in lockstep at Phase 8; instead one got auto-save and the other didn't. Ten phases later we're paying the synchronisation cost.

**Next steps**: none — feature complete on this surface. If the agent dashboard grows a third "save-while-edit" surface, the auto-save state machine should probably get extracted into a hook (`useDebouncedAutoSave`) at that point, not before.

## 2026-06-24 — Phase 50.18: hotfix `createStubCommunity` CHECK violation + Danger zone color

**Objective**: kill two production bugs reported by qiaoxux on the agent hub My Community surface — (a) "Upload as Community" was failing with `Could not create — please retry.` (and the implied chain failures: "video upload is not prefilled", "photos can not be uploaded"); (b) "Danger zone color is fainted".

**Root causes**:
- (a) Phase 50.17's `createStubCommunity` server action inserts a row with `status='draft'`. But `supabase/migrations/0030_simplify_status.sql` redefined `communities.status` with `check (status in ('active', 'inactive'))` — there is no `'draft'` slot. Every stub insert therefore returns a CHECK constraint violation (Postgres SQLSTATE `23514`), the action returns `{ ok: false, error: 'insert_failed' }`, the FAB shows the red error, no row exists for `?prefill=` to land on, and both video prefill + photo upload fail downstream because they require the stub row.
- (b) The DangerZone block on both the listing edit page and the community hub used `border-rose-300/60` + `bg-rose-50/40`. The `/40` opacity over the cream `bg-bg` surface drains the rose almost to invisible — visually neighbours an info card more than a destructive warning.

**Actions**:
- `app/dashboard/communities/actions.ts`: `createStubCommunity` now inserts `status='inactive'` instead of `'draft'`. Updated the doc comment to spell out the CHECK constraint and the public-grid filter (`status='active'` in `lib/feed/browse-cards.ts`) so future contributors don't repeat the same trap. Stubs remain hidden from the public communities grid because that grid filters on `active`, and the agent can promote the row by flipping the InstantStatusToggle once the metadata is filled in.
- `app/dashboard/listings/[id]/edit/DangerZone.tsx` + `app/dashboard/communities/[id]/CommunityEditor.tsx` (`CommunityDangerZone`): bumped border `rose-300/60 → rose-400` and bg `rose-50/40 → rose-50` (no opacity). Listing + community changed in lockstep per the listing/community pair-drift convention; the in-code "mirrors the listing DangerZone" comment now tracks Phase 50.18.

**Decisions**:
- Use `inactive` (not invent a new status). Adding a `'draft'` slot would require a migration + grid filter update; `inactive` already exists and already does the right thing for the public grid.
- No DB migration. Pure app-layer fix.
- Pair-drift fix: change both listing and community DangerZone, even though qiaoxux only mentioned the community surface. They're meant to look identical; if we only fixed one, listing would drift to "fainted" the next time someone notices.

**Pitfalls / lessons**:
- **Always run a schema/CHECK-constraint check when introducing a literal status string in code.** Phase 50.17 added a `status='draft'` literal without grepping migrations for `check (status in …)`. This is the second time this kind of trap has bitten the project (saved a memory note + added it to the `schema-vs-ui-status-simplification.md` skill notes).
- The 50.17 build passed because tsc has no awareness of DB CHECK constraints, and there's no integration test that actually exercises the FAB → stub → hub flow against a real Supabase instance. Worth a follow-up smoke test (out of scope for this hotfix).

**Verification**:
- `npx tsc --noEmit` clean
- `npx next build` clean (bundle sizes unchanged)
- Visual sanity: the community hub Danger zone now reads as a clearly dangerous block on the cream surface; `Could not create` error path no longer triggered.

**Files**:
- `app/dashboard/communities/actions.ts` — `'draft' → 'inactive'` + comment
- `app/dashboard/listings/[id]/edit/DangerZone.tsx` — class fix
- `app/dashboard/communities/[id]/CommunityEditor.tsx` — class fix + comment refresh

## 2026-06-23 07:30 UTC — Phase 50.17: fold `/communities/new` into the community Hub

**Objective**: collapse the two-step "FAB → /new form → Hub" community-creation flow into a single hop "FAB → Hub", with the queued media auto-uploading in the background while the agent edits Details. Also kills two pesky bugs that surfaced after 50.16: the very first click on Create-community didn't always navigate (server action + `redirect()` racing with the prefill stash), and video prefill was still empirically flaky on slow hydration paths.

**Actions**:
- `app/dashboard/communities/actions.ts`: added `createStubCommunity()` server action — inserts a `status='draft'` row with `name='Untitled community'` and `slug='untitled-<rand6>'` (collision retry). No zod validation, no redirect; returns `{ ok: true, data: { id } }`. Status `draft` keeps stubs out of the public communities grid until renamed.
- `app/_components/upload-status-store.ts` (NEW): module-level pub/sub keyed by `communityId`. `setUploadTotal(id, n)` / `reportUploadDone(id)` / `reportUploadFailed(id)` plus a `useUploadStatus(id)` React hook. Mirrors the `upload-prefill-store` pattern.
- `app/dashboard/communities/[id]/PrefillUploadBanner.tsx` (NEW): client banner shown at the top of the Details tab. Subscribes via `useUploadStatus`, shows amber spinner while in flight, emerald ✅ on success (auto-dismiss after 8 s), rose ⚠️ on partial failure. Hidden when total = 0.
- `app/dashboard/communities/CreateCommunityButton.tsx` (NEW): client button replacing the empty-state `<Link href="/communities/new">`. `useTransition` + `createStubCommunity` + `router.push` to the new hub. Shows inline error on failure.
- `app/_components/UploadSheet.tsx`: `pickType('communities')` now `await`s `createStubCommunity()`, calls `setUploadTotal(id, files.length)`, then pushes to `/dashboard/communities/<id>?prefill=…`. The "Community" sheet row disables and renames to "Creating community…" while the action is in flight; on failure shows an inline rose error and keeps the files queued so the agent can retry. `pickType('listings')` is unchanged.
- `app/dashboard/_components/HubTabs.tsx`: added optional `eagerMount` prop. When true, renders every panel in the DOM, hidden via `hidden` attribute on a wrapping `<div role="tabpanel">`. Default behaviour (lazy: only the active panel renders) is preserved for the listing hub.
- `app/dashboard/communities/[id]/page.tsx`: turned on `eagerMount`, set `defaultTab="details"`, dropped `<PrefillUploadBanner />` at the top of the Details panel.
- `app/dashboard/communities/[id]/CommunityMediaPanel.tsx`: imported `setUploadTotal/reportUploadDone/reportUploadFailed` from the status store. On first render with prefill files, calls `setUploadTotal(communityId, prefillFiles.length)` (idempotent — guarded by a ref) so a hard refresh of the URL still wires the banner totals. `handleVideoUploaded` now reports done; new `handlePhotoResolved` callback funnels per-photo success/failure into the store.
- `app/dashboard/communities/[id]/CommunityPhotoPanel.tsx`: added optional `onUploadResolved?: (ok: boolean) => void` prop, latched through a ref so `handleFiles` keeps a stable identity. Each file end (validation reject, upload error, recordCommunityPhoto error, or success) fires the callback exactly once.
- `app/dashboard/communities/new/` (DIR): deleted entirely (`page.tsx` + `NewCommunityForm.tsx`). The only import of `createCommunity` was here, so the existing action is now dead code we can prune in a follow-up — kept for now in case any test references it.

**Decisions**:
- **eagerMount over lifting state**: the alternative was lifting prefill consumption out of `CommunityMediaPanel` into the page, but that drags photo/video state across the tab boundary and complicates `CommunityPhotoPanel`'s imperative handle wiring. Eager-mount with `display:none` is one prop and zero behaviour change for non-eager callers (listing hub).
- **status='draft' stubs**: deliberately dirty — yes, an agent who closes the tab mid-create leaves an "Untitled community" in their dashboard list. The Danger Zone in the Details tab can delete it; the public grid never sees it because of `status='draft'`. Cheaper than a server-side cron sweep.
- **Slug = `untitled-<rand6>`**: `updateCommunity` already auto-rewrites the slug when the agent saves a name change, with collision retry. So renaming "Untitled community" → "Buckhead" rewrites the slug to `buckhead` (or `buckhead-2` etc). No follow-up migration needed.
- **No toast system**: the project has no shared toast utility (grep returned 0 matches), so the banner is a tab-local component. Living in Details tab is right because that's where the agent's eyes are while the upload happens.
- **First-click-doesn't-navigate fix is structural**: the previous `/new` form did `await createCommunity(...)` server-side, then called `redirect()` which threw a `NEXT_REDIRECT` error. Sometimes that fired before the `useFormState` Promise resolved and the SPA never re-rendered. The new flow is `await action()` from a client component → `router.push` — no thrown redirect, no race. Both empty-state and FAB share the same code path.
- **Video prefill fix is structural**: the Media tab now mounts on every Hub render (eagerMount), so `consumePrefill` runs synchronously during the first paint regardless of which tab the agent looks at. No more "is `useSearchParams()` populated yet" hydration races.

**Verification**:
- `npx tsc --noEmit` (after `rm -rf .next`): clean.
- `npx biome check` on the 9 touched + new files: clean (the 4 errors in `UploadSheet.tsx` are pre-existing svg-title / role-status warnings, verified via `git stash`).
- `npx next build`: succeeds. Bundle size unchanged for `/dashboard/communities/[id]` (the eager-mount panels were already in the closure for that route).
- Manual e2e to follow on Vercel preview.

**Pitfalls noted**:
- `setUploadTotal` is called twice in the FAB path (once in UploadSheet pre-navigation, once on Media panel mount via the idempotent guard). The second call resets `done`/`failed` to 0 — this is fine in the FAB case (banner hasn't seen any reports yet) but would clobber state if the agent navigates away and back. Refs guard against that for the SPA lifetime; a hard refresh wipes it anyway because the prefill File[] is gone too.
- The eagerMount `hidden` attribute on `<div>` is the simple way; if any panel relies on `IntersectionObserver` or measures DOM dimensions it'll see `display:none` and behave wrong. Spot-checked: none of the four panels do that.

## 2026-06-23 06:30 UTC — Phase 50.16: community Danger Zone solid color + video prefill fix

**Objective**: qiaoxux on agent hub "my community": (1) "danger zone color is fainted", (2) "video upload is not prefilled".

**Actions**:
- `app/dashboard/communities/[id]/CommunityEditor.tsx` (`CommunityDangerZone`): swapped translucent dark-theme palette (`border-red-500/40 bg-red-500/5 text-red-300`) for the same solid-rose treatment Phase 47.12 applied to listing `DangerZone.tsx` — `border-rose-300/60 bg-rose-50/40` card with a solid `bg-rose-600` button. Now visually parities the listing hub.
- `app/dashboard/communities/[id]/CommunityMediaPanel.tsx`: replaced the `useEffect(() => consumePrefill(...), [prefillId])` async consumer with the lazy-init pattern listing `MediaPanel.tsx` uses — `useRef` captured during the first render synchronously calls `consumePrefill`, then videos go into `pendingVideos` via a deferred `setTimeout(0)` (so VideoUploader children mount cleanly) and photos forward to `photoRef.current.addFiles()` once that handle is mounted.

**Decisions**:
- Danger Zone: parity with listing was the right answer — same destructive surface, same chrome. Avoided inventing a third treatment.
- Video prefill: the previous useEffect approach was racy. By the time the effect ran, `consumePrefill` would correctly return the File[], BUT in some hydration paths `useSearchParams()` returned `null` on the very first render and only populated on a subsequent re-render — so consumption happened *after* a paint in which photos had already been forwarded via `handlePicked` and videos skipped because of an intermediate state. Lazy `useRef` init runs once during render and matches the listing pattern that's been in production for two phases without bug reports.

**Verification**: `npx tsc --noEmit` clean. `rm -rf .next && npx next build` clean — community detail page (`/dashboard/communities/[id]`) builds as a dynamic route as expected.

**Learnings**: when copying the listing/community pair, always copy the *full* pattern, not the high-level idea. The original Phase 50.12 community implementation reinvented prefill consumption using `useEffect` because the author thought it was simpler — but the listing version's lazy useState/useRef init exists for a reason (hydration timing), and skipping it cost a bug report. Memory updated.

**Next steps**: none.

## 2026-06-23 05:05 UTC — Remove "Community marketing copy" panel title

**Objective**: qiaoxux: "remove title of Community marketing copy" on the community agent hub.

**Actions**: deleted the `<h2>Community marketing copy</h2>` line in `app/dashboard/communities/[id]/CommunityMarketingPanel.tsx`. Description paragraph below it kept.

**Decisions**: surgical one-line removal. Kept the wrapping `<div className="mb-4">` since the paragraph still needs that spacing.

**Verification**: `npx tsc --noEmit` clean.

**Next steps**: none.

## Phase 50.15 — Prune dead community upload code (2026-06-23)

**Objective**: qiaoxux: "清理所有不用的老页面 老逻辑". After Phase 50.12 lifted the prefill consumer into `<CommunityMediaPanel>` and collapsed `/upload` to a redirect, three legacy components became orphans + the `/upload` route itself was dead weight.

**Approach**: dependency-walk first to confirm nothing reachable.
- `CommunityUploadPrefillBridge` only referenced by itself + `CommunityUploadShell`.
- `CommunityUploadShell` only by `CommunityUploadPrefillBridge`.
- `CommunityVideoPanel` only by `CommunityUploadShell` (component usage). The exported `CommunityVideoRow` / `CommunityOption` types DO appear elsewhere (`lib/feed/browse-cards.ts`, `EditListingForm.tsx`) but those are local re-declarations or live in a different file with the same name — no cross-import. Confirmed via `rg "from '\\./CommunityVideoPanel'"` → only the two orphans.
- `/upload` route: nothing redirects to it after Phase 50.12 (`createCommunity()` already lands on `?tab=media`). `/photos` + `/videos` redirected to `/upload`, which then bounced to `?tab=media` — collapse that double-hop into one.

**Files deleted**:
- `app/dashboard/communities/[id]/CommunityUploadPrefillBridge.tsx`
- `app/dashboard/communities/[id]/CommunityUploadShell.tsx`
- `app/dashboard/communities/[id]/CommunityVideoPanel.tsx`
- `app/dashboard/communities/[id]/upload/page.tsx` (and its parent dir)

**Files updated**:
- `app/dashboard/communities/[id]/photos/page.tsx` — redirect destination from `/upload` to `?tab=media` (single hop).
- `app/dashboard/communities/[id]/videos/page.tsx` — same.
- `app/dashboard/communities/[id]/CommunityMediaPanel.tsx` — strip "/upload subroute keeps working", "Same picker the /upload subroute uses", "bridge that used to live on /upload" comments. Replace with Phase 50.13 note clarifying this is the only upload surface now.
- `app/dashboard/communities/actions.ts` — drop "(The legacy /upload route now just redirects here too.)" comment.
- `app/dashboard/communities/[id]/page.tsx` — "match what /upload loads" → "Photos for the Media tab.".

**Verification**: `npx tsc --noEmit` clean (after `rm -rf .next` to flush stale typed-routes), `npm run build` clean. `rg "/upload"` under `app/dashboard/communities/` returns zero hits.

**Lessons**:
- **Single-hop redirects are kinder than chains.** `/photos → /upload → ?tab=media` worked but `/photos → ?tab=media` is the same outcome with one fewer round trip and one fewer thing to maintain.
- **Stale `.next/types` after deleting a route**: `tsc` complained about `.next/types/app/.../upload/page.ts` referencing the now-gone module. `rm -rf .next` fixes it; this is a Next.js typed-routes artifact, not a real source error.
- **Dependency walk before delete.** Before removing a component, `rg -l "from '\\./X'"` AND `rg "<X" -g '*.tsx'` — the first catches type-only imports, the second catches JSX-only callers. Deleting the file shows up in both if it's the last one standing.

## Phase 50.14 — BrandMark: drop gold fill, use ink (2026-06-23)

**Objective**: qiaoxux follow-up: 50.13 cleaned the chrome but the wordmark "颜色不搭配 其他地方没有金色的". Confirmed via prod CSS audit on `/login`: `body` text `#313131`, `h1` `#313131`, `Continue` button bg `#313131`, `Sign up` link `#313131`, `Forgot password?` `#5a5651` (muted) — gold `#c9a24a` is the only chromatic accent on the entire surface. Same situation on dashboard chrome (SiteHeader uses BrandMark too).

**Approach**: drop the gold inline `color` from BrandMark, switch to `text-ink` (same `#313131` token H1/buttons/links use). Tracking + uppercase preserved — still reads as an editorial wordmark, just in the page's only ink color now. Hover opacity-70 for affordance, focus-visible underline for keyboard. Landing hero eyebrow (`app/page.tsx`) is a separate component over the dark Pexels video and KEEPS its gold — that's where the chromatic pop is earned.

**Files**:
- `components/site/BrandMark.tsx` — remove `style.color: '#c9a24a'`, add `text-ink` class. Swap `hover:brightness-110` → `hover:opacity-70` (opacity is the cleaner affordance for ink-on-cream; brightness is for chromatic colors).

**Verification**:
- `npx tsc --noEmit` clean.
- Token check: `tailwind.config.ts` line 11 `ink: '#313131'` ✓.
- Dashboard SiteHeader (`app/dashboard/layout.tsx`) uses the same component — auth + dashboard chrome inherit the ink wordmark together.

**Lessons**:
- **Audit the surface palette before keeping any chromatic accent.** A token color is "out of place" when it's the only one of its hue on the surface. The systematic check: dump computed `color` / `backgroundColor` of every visible element and compare hues. If your chromatic accent is a hue-of-one, it's not a palette — it's an outlier. (The Aman/Hermès idiom that justified gold in the hero earned it because it sits over a dark video where ink would be invisible. Move the same wordmark onto cream and the same gold becomes orphaned.)

## Phase 50.13 — Login page BrandMark: drop button chrome (2026-06-23)

**Objective**: qiaoxux flagged that the top-left gold "VICINITY" wordmark on `/login` (the home-link) "is not fit style".

**Root cause**: `<BrandMark>` (used by `app/(auth)/layout.tsx` and SiteHeader) was styled like a tiny CTA — `rounded-md`, `border-transparent`, `px-2 py-1.5`, plus hover/focus states that painted a gold-tinted bordered box (`hover:border-[#c9a24a]/40 hover:bg-[#c9a24a]/5`). Against the cream auth surface (`--bg: #f3eee7`) the wordmark already harmonizes; framing it in a button rectangle reads as a corner CTA and clashes with the editorial-luxury idiom (Aman / Hermès) that the landing hero eyebrow (`app/page.tsx`) sets — that one is flat tracked caps with no chrome at all.

**Approach**: strip padding, border, rounded box, and hover/focus tint from `<BrandMark>`. Match the landing eyebrow exactly: flat tracked uppercase, gold (#c9a24a), 13px, 0.32em tracking. Hover signals via `brightness-110`; focus-visible signals via underline (kbd-only path, doesn't paint a box for mouse users). The `Link` behavior is preserved — only the chrome is removed.

**Files**:
- `components/site/BrandMark.tsx` — drop `rounded-md border border-transparent px-2 py-1.5 hover:border-… hover:bg-… focus-visible:border-… focus-visible:bg-…` and the `group` token. Replace with `hover:brightness-110 focus-visible:underline focus-visible:underline-offset-4`. Bumped doc comment with phase50.13 rationale.

**Verification**:
- `npx tsc --noEmit` clean.
- Same component is used by SiteHeader (`app/dashboard/layout.tsx` chrome) and the auth layout — both surfaces inherit the cleaner mark, no per-route override needed.

**Lessons**:
- **Hover button chrome on a brand wordmark reads as CTA, not link.** When the same wordmark is used both as a hero label (no chrome) and as a chrome link (in SiteHeader / auth corners), the chrome version should still look identical to the hero — hover signals belong on `brightness` / `underline`, not on a painted box. A boxed-out wordmark in the corner of a login page is the visual equivalent of putting `[VICINITY]` brackets around it.

## Phase 50.12 — Community upload: kill legacy /upload page, soften buttons (2026-06-23)

**Objective**: qiaoxux uploaded a video on the new hub Media tab and hit two regressions:
1. The `Start upload` / `Upload another` buttons rendered near-black on the cream background.
2. After picking a file from the FAB → "Upload as Community" → New community, the redirect landed on the OLD standalone `/upload` page (the one with the inline Address input and "Applies to both video and photos uploaded below" callout) instead of the new hub Media tab.

**Root causes**:
1. `VideoUploader.tsx` two action buttons used `style={{ background: 'var(--brand)', color: '#0c0c0c' }}`. The cream theme aliases `--brand: var(--ink)` (`#313131`), so the buttons rendered as near-black solids on cream — visually identical to the BottomNav `+` FAB and out of step with the outlined `Click to upload` button right next to them.
2. `createCommunity()` in `app/dashboard/communities/actions.ts` redirected the prefill flow to `/dashboard/communities/[id]/upload?prefill=…`. That route is the legacy `<CommunityUploadShell>` (Phase 25/45.16) — it predates Phase 50.x's hub Media tab and still has its own Address input + sibling category callout. It was the destination of the FAB handoff because the new hub MediaPanel didn't know how to consume `?prefill=`.

**Approach**:
- **Buttons**: re-skin Start / Upload-another / Pick-another-file as `border border-line bg-bg text-ink` outlined buttons (matches the existing `Click to upload` button in `MediaPanel`/`CommunityMediaPanel`).
- **Prefill bridge**: lift the `consumePrefill()` call from `<CommunityUploadPrefillBridge>` into `<CommunityMediaPanel>` directly. On mount, if `?prefill=<id>` is set, pull the File[] from the upload-prefill-store and feed it to the existing `handlePicked()` (which already routes images → photoRef and videos → pendingVideos). After consumption, strip the param via `history.replaceState` so a hard refresh doesn't look weird.
- **Redirect cascade**: `createCommunity()` now redirects to `?tab=media&prefill=…` on the hub. The old `/upload` page becomes a thin server redirect to `?tab=media` (preserving any `?prefill`). Old `/photos` and `/videos` redirects already point at `/upload` so they auto-cascade.

**Files**:
- `components/dashboard/VideoUploader.tsx` — three button restyles (Start upload, Pick another file, Upload another), drop inline `--brand` styles.
- `app/dashboard/communities/[id]/CommunityMediaPanel.tsx` — `useSearchParams` + a one-shot effect that calls `consumePrefill(prefillId)` → `handlePicked(files)` → `history.replaceState` to drop the param.
- `app/dashboard/communities/[id]/upload/page.tsx` — collapsed from a server-component shell that loaded videos/photos/communities to a 25-line redirect: `redirect('/dashboard/communities/${id}?tab=media' + prefill)`.
- `app/dashboard/communities/actions.ts` — `createCommunity()` prefill redirect now points at `?tab=media&prefill=…` instead of `/upload?prefill=…`.

**Verification**:
- `npx tsc --noEmit` clean.
- `npm run build` clean.
- `/dashboard/communities/[id]/upload` route still appears in build output as a tiny redirect — old bookmarks survive.
- Hub Media tab consumes `?prefill=<id>` exactly like `/upload` did: photos auto-upload via `photoRef.current?.addFiles(images)`, videos appear as pending VideoUploader rows the agent confirms.

**Lessons**:
- **Inline `style={{ background: 'var(--brand)' }}` is a footgun in palette swaps.** The cream theme intentionally aliases `--brand` to `--ink` so legacy chromatic-accent code degrades to neutral, but neutral on cream looks aggressive. Buttons that used to be a green/blue accent are now near-black solids unless explicitly restyled. Audit-and-purge any remaining `var(--brand)` inline styles after a palette flip.
- **Folding a route into a tab is a 3-step move, not 1.** When the hub Media tab supersedes a standalone `/upload` page, you have to (a) port the prefill consumer into the panel, (b) collapse the route to a redirect, AND (c) update every internal redirect (createCommunity, in this case) to skip the legacy URL. Missing (c) means the new hub looks complete in dev but the prod FAB flow still routes around it.
- **`searchParams.get('prefill')` + `history.replaceState`** is a clean one-shot consumer pattern when the side-effect (here: handing files to handlePicked) shouldn't run twice. Prefer it over a separate bridge component when the hub panel already lives on a client boundary.

## Phase 50.11.2 — Community Media: trim CategorySpecCard to blurb only (2026-06-23)

**Objective**: qiaoxux reviewed the v0.54.11 result and asked: of the four lines under the Category dropdown ("Morning Rush" / "The commute, on a real weekday" / "Must include: Dashcam timestamp must be visible." / "Applies to videos and photos uploaded next."), keep only the second line.

**Actions**:
- `CategoryPicker.tsx`: `CategorySpecCard` reduced to a single `<div className="text-xs leading-snug text-ink2">{meta.blurb}</div>`. Removed the bordered/padded card wrapper, the bold label, and the "Must include: ..." line.
- `CommunityMediaPanel.tsx`: deleted the separate `<p>` help paragraph ("Category applies to videos and photos uploaded next. Photos (JPEG / PNG / WebP, up to 10 MB) and videos (MP4 / MOV, up to 2 GB).") that lived between the controls row and the SpecCard band.

**Decisions**: Kept `meta.label` and `meta.hardRule` in the data (`category-meta.ts`) — only the rendering was stripped. Easy to surface back in a tooltip or info popover later if agents start mis-categorizing without the rule visible.

**Verification**: `npx tsc --noEmit` clean. `npm run build` clean.

**Next**: ship and let qiaoxux confirm the Media tab matches her listing tab layout now.

## Phase 50.11.1 — Community Media: SpecCard split out so dropdown can sit beside Upload (2026-06-23)

**Objective**: Phase 50.11 wrapped Category + Upload in a `flex items-end` row, but qiaoxux reported "don't see the left and right change" — the Category column was still visually taller than the Upload button because `<CategoryPicker>` rendered both the dropdown AND the SpecCard (label + blurb + hard rule, ~120px tall) inside a single column. With `items-end` the Upload button hugged the bottom of a much taller sibling, so the row read as stacked.

**Actions**:
- `CategoryPicker.tsx` — added optional `hideSpec` prop and exported `<CategorySpecCard meta={…} />` separately. Dropdown alone when `hideSpec`, full bundle (current behavior) otherwise.
- `CommunityMediaPanel.tsx` — pass `hideSpec` to `<CategoryPicker>` in the side-by-side row, then render `<CategorySpecCard meta={getCategoryMeta(category)} />` in its own full-width band below. Help text + unsupported notice also moved out of the right column to a single full-width line so the left and right columns are both ~36px tall and read as obviously side-by-side.

**Decisions**:
- *Export `CategorySpecCard` instead of inlining the markup*: keeps the CategoryPicker file as the single source of truth for the spec card visual and lets a future caller (e.g. a category sheet) reuse it.
- *Help text moved out of the upload column*: avoids the same height-mismatch problem the SpecCard caused; the row now contains ONLY same-height controls.

**Issues**: None — pure layout refactor.

**Resolution**: tsc clean, build clean. v0.54.11 bumped.

**Learnings**: When `flex items-end` is involved, audit children for "tall extras" that pad the column. Side-by-side intent fails silently when one column has far more content than the other — `items-end` aligns the BOTTOMS, not the rows visually. Pull tall content out into a sibling row instead.

**Next steps**: Wait for qiaoxux re-verification.

## Phase 50.11 — Community Media: side-by-side controls + video descriptions (2026-06-23)

**Objective**: Two follow-ups to the Phase 50.9 community Media tab refactor:
(1) Move the Category dropdown and Upload button onto a single row (left/right
side-by-side) instead of stacked. (2) Replace the yellow "needs review" pill
on video rows with an inline editable description, which doesn't currently
exist on the schema.

**Actions**:
- New migration `supabase/migrations/0040_community_video_description.sql` — adds nullable `description text` column to `community_videos`, plus a comment column. Applied to remote via `npx supabase db push --include-all`.
- `app/dashboard/communities/actions.ts` — added `updateCommunityVideoDescription(videoId, communityId, description)` server action. Trims, caps at 280 chars, stores empty as NULL, owner-only, revalidates the community page.
- `app/dashboard/communities/[id]/page.tsx` — added `description` to the manage video select + mapper.
- `app/dashboard/communities/[id]/CommunityVideoManageList.tsx` — added `description` to `ManageVideoRow`. Removed yellow `needs_review` badge from the row meta line. Added `<DescriptionEditor>` sub-component: three states (view-text, view-empty-owner, edit). Click-to-edit textarea with Enter-saves / Shift+Enter-newline / Esc-cancel / blur-saves; optimistic local state synced from props on `router.refresh()`.
- `app/dashboard/communities/[id]/CommunityMediaPanel.tsx` — wrapped Category and Upload in a single `flex flex-wrap items-end gap-4` row. Category gets `flex-1 min-w-[12rem]` so it grows; Upload sits to the right with its own `min-w-[12rem]`. Stacks on narrow viewports via flex-wrap.

**Decisions**:
- *Inline editor instead of a sheet/modal*: matches the listing edit page's "click-the-thing-to-edit-the-thing" pattern. No extra page chrome.
- *Empty string → NULL in DB*: lets a future buyer-facing surface use `description IS NOT NULL` to gate display without worrying about whitespace-only strings sneaking through.
- *Kept the `category_needs_review` column intact*: the bot still flips it on AI-categorized rows; only the manage-UI surface was removed. Bringing the badge back is a one-line restore if agents miss it.
- *280-char cap*: tweet-sized — enough for a one-line context blurb, short enough to discourage long-form copy that belongs on the listing description instead. Cap enforced both client-side (textarea `maxLength`) and server-side (action validation).
- *Side-by-side via flex-wrap*, not a CSS grid: agents on narrow widths still get a clean stack; no breakpoint plumbing needed.
- *Owner-only edit*: non-owners see the description as static text if present, nothing if empty.

**Issues**: None during implementation.

**Resolution**: tsc clean, `npm run build` clean, route bundle stayed at 12.4 kB / 209 kB First Load (description editor is small enough it doesn't move the needle). Migration applied to remote.

**Learnings**:
- `supabase.storage.from(X).copy()` cross-bucket limitation noted in 50.9 still relevant for any future media moves; not in play here.
- Three-state inline editor (view-text / view-empty-owner / edit) is becoming the canonical pattern for optional free-text fields in this codebase — worth lifting into a shared component if a third surface picks it up.

**Next steps**: Wait for real-flow verdict from qiaoxux. Possible follow-ups:
- Surface description on the public community page (currently agent-side only).
- Re-add the "needs review" badge as a folded "advanced" indicator if agents miss the AI-confidence signal.
- Lift `<DescriptionEditor>` into `components/ui/` if a third call site appears.

## Phase 50.10 — Community editor form-level cleanup (2026-06-23)

**Owner ask in 5 lines** (Slack, 2026-06-23, Vivian):
1. City and ZIP are required
2. Year built range — show two dropdowns for start and end, both optional
3. Price range — similar (two optional inputs)
4. Remove all categories like Identity, Location…
5. Remove tagline, redundant with Highlights and Description
6. Property types: use official ones, not sure what "55+" is

**What changed in `CommunityEditor.tsx`:**
- **Section grouping deleted.** "Identity / Location / Pitch / Property /
  Contact" `<FieldGroup>` headings are gone. Form is now a flat field
  stream — fewer visual layers, less for the eye to parse on mobile.
  The `FieldGroup` helper component itself was removed.
- **City + ZIP required.** Both starred. zod: `city.trim().min(1)`,
  `zip.trim().min(1)`. Sale-side geo filtering needs them; a community
  without a ZIP is not addressable on a map.
- **Year built = two optional `<select>` dropdowns** (start + end). The
  Phase 50.5 dual-mode "Type a year…" escape hatch and the Phase 50.6
  opt-in toggle (with "+ Add end year" link) are both gone — owner's ask
  was literal: "two dropdowns for start and end, both optional". Cross-
  field check (end >= start when both present) still runs server-side
  via existing zod refine.
- **Price = two optional `DollarInput`s** side-by-side. The 50.6 opt-in
  toggle (with "+ Add max price (range)") removed for the same reason.
  Suffix labels: "from" / "to". Cross-field check (max >= min) still
  runs server-side.
- **Tagline dropped.** Migration `0039_drop_community_tagline.sql` drops
  the column. UI field, zod schema, server action insert, and `page.tsx`
  select column list all updated.
- **Property types swapped.** Old list mixed taxonomy levels:
  - Building type ("Single Family", "Townhouse", "Condo")
  - Sale stage ("New Construction", "Resale", "Custom Build")
  - Demographic restriction ("Active Adult 55+")
  This conflated "what kind of unit" with "who's buying" and "is it
  brand-new". Owner: "not sure what is 55" — that's the demographic
  category for age-restricted communities, NAR jargon.
  New list (NAR/Zillow consumer-facing): Single Family, Townhouse,
  Condo, Co-op, Multi-Family, Manufactured, Land. Sale stage and age
  restriction are intentionally left out — they're properties of an
  individual listing or a marketing tag, not a build type.

**Why this overrides Phase 50.6's "less friction" opt-in design**: the
50.6 toggle hid the second input behind a click to spare agents one
empty box. Owner's literal ask — "show two dropdowns" — explicitly
prefers the two-box layout. Sometimes the owner wants the empty box;
agent-time-saved is not always the optimization that matters. Logged
this to memory: "instructions take literal precedence over inferred
optimization".

**Verification:** `npx tsc --noEmit` clean. `npm run build` clean —
`/dashboard/communities/[id]` route shrank from 14 kB → 11.8 kB
(removing the dual-mode + opt-in state machines paid for itself in
bundle size).

**Migrations:** `0039_drop_community_tagline.sql` (single column drop;
applied to remote via `npm run db:push`).

**Files touched:**
- `lib/zod/community.ts` — city min(1), drop tagline, replace
  `COMMUNITY_PROPERTY_TYPES` list
- `app/dashboard/communities/actions.ts` — drop tagline insert
- `app/dashboard/communities/[id]/page.tsx` — drop tagline select +
  interface field
- `app/dashboard/communities/[id]/CommunityEditor.tsx` — flatten form,
  drop FieldGroup helper, simplify year + price
- `supabase/migrations/0039_drop_community_tagline.sql` — new

**Commit:** `2430754`

---

## Phase 50.9 — Community Media tab full parity with Listing Media (2026-06-23)

**Trigger**: qiaoxux — "My community media tab: follow the same layout as
my listing media, plus the category tags. Do refactoring if needed",
followed by a 5-point reorder/trim ask: Upload first → Category next →
flat video rows with Set-as-cover + Delete only → photo Set-as-cover →
drop the standalone Cover panel.

**What changed**:

1. **CommunityMediaPanel reorder.** Upload button now sits at the top of
   the card, Category picker directly underneath it. Visual flow reads
   "what do I want to add → tag it → drop your files" — same as the
   listing edit page.
2. **CommunityVideoManageList rewrite.** Replaced the rich Phase 35.x row
   (visibility chips, archive/restore/private buttons, uploader byline,
   group-by-visibility, edit-category sheet) with a flat row matching
   listing `VideoPanel`:

       [thumb] · title · category pill · [Set as cover] · [Delete]

   Cover badge appears next to the title for the current cover; the
   "Set as cover" button collapses to a "Current cover" pill on that
   row. Read-only category pill replaces the edit-category sheet.
3. **Photo Set-as-cover.** Each photo card in `CommunityPhotoPanel` now
   has a ⭐ button (visible on hover, owner-only) and a Cover badge for
   the current cover photo. New server action
   `setCommunityCoverFromPhoto` downloads the source object from the
   private `community-photos` bucket and re-uploads to the public
   `community-covers` bucket (cross-bucket; storage `.copy()` is
   single-bucket only), then reuses the existing
   `recordCommunityCoverImage` setter so prior cover cleanup +
   revalidation are unchanged.
4. **CommunityCoverPanel deleted.** The standalone "Cover" section in
   the Media tab is gone — cover selection is fully inline now.
   `page.tsx` no longer derives `coverVideos` since the video list gates
   on `status === 'ready'` itself.

**Trade-offs accepted** (concerns table approved by qiaoxux ahead of the
rewrite):

- **Visibility/archive controls dropped** from videos. Delete is now the
  only way to take a video off buyer surfaces; archive/restore/private
  are no longer reachable from the dashboard. Existing rows with
  `visibility != 'public'` continue to render, just without controls to
  flip them — agents can still delete.
- **Photo-as-cover via storage copy, not migration to public bucket.**
  ~1 file duplicated per cover change. We keep `community-photos`
  private (raw photo lib never needs public read) and only the chosen
  cover ends up in the public bucket.
- **Video re-categorize gone** with the edit sheet. Category is set at
  upload time via the shared CategoryPicker; mistakes mean
  delete-and-reupload until/unless the sheet comes back.

**Why this works**: photo grid + video row UX now match listing-side
muscle memory exactly, with one exception — community keeps the category
pill / category picker since communities have richer semantic tagging
than listings (which have one logical "this is the listing"). Categories
were the explicit ask, the rest of the UX collapses to listing parity.

**Files**:
- `app/dashboard/communities/[id]/cover-actions.ts` — added
  `setCommunityCoverFromPhoto`.
- `app/dashboard/communities/[id]/CommunityVideoManageList.tsx` —
  full rewrite (350 → 245 lines).
- `app/dashboard/communities/[id]/CommunityPhotoPanel.tsx` — Cover
  badge + ⭐ button + new props (`coverStoragePath`, `canSetCover`).
- `app/dashboard/communities/[id]/CommunityMediaPanel.tsx` — reorder
  Upload→Category, thread cover props.
- `app/dashboard/communities/[id]/page.tsx` — drop
  `<CommunityCoverPanel>`, drop `coverVideos`, pass cover state
  inline.
- `app/dashboard/communities/[id]/CommunityCoverPanel.tsx` — DELETED.

Verified: tsc clean, next build clean.

## Phase 50.8 — CategoryPicker becomes a labeled dropdown (2026-06-23)

**Trigger**: qiaoxux — "Make category a dropdown list with explain. Can you
follow this for video and photos and everything else."

**What changed**: `CategoryPicker.tsx` swapped its 12-chip cloud for a native
`<select>` element. The "explain" surface (label / blurb / hard rule spec
card) underneath the field is unchanged — agents still see what each
category means as soon as they pick it.

**Why one file is enough for "video and photos and everything else"**:
`CategoryPicker` is the single shared component used by every entry point
that tags content with a community category — the unified Media tab
(photos + videos), the `/upload` shell (FAB prefill flow), and the video
edit list. So one refactor flows through every surface.

**What does NOT change**:
- The category set itself (still `COMMUNITY_VIDEO_CATEGORIES`).
- The spec card content / styling.
- The CategoryPicker public API (`mode` / `selected` / `onPick` /
  `disabled`).
- Anywhere that imports `CategoryPicker` — no call-site edits needed.

**Why native `<select>` (vs. a custom popover)**: mobile is the primary
form factor here. The OS picker is a full-height list with the right
scroll/wheel idiom, free a11y, and doesn't require us to reimplement
focus trapping. It also takes ~one line in a column instead of the chip
cloud's wrapping rows.

**Verification**: `npx tsc --noEmit` clean, `npx next build` clean.

**Files**:
- `app/dashboard/communities/[id]/CategoryPicker.tsx` — chip cloud → native
  `<select>` with spec card; `Chip` helper deleted.

## Phase 50.7 — Community Media tab matches Listing Media tab (2026-06-23)

**Trigger**: qiaoxux — "My community media tab: follow the same layout as
my listing media, plus the category tags. Do refactoring if needed."

**What changed**: community Media tab is now one Content card with a
single "Click to upload" button (image/* + video/*) and stacked Videos /
Photos sub-sections — same shell pattern as the listing edit hub
(`MediaPanel.tsx`). Plus what listing doesn't need: a shared
`<CategoryPicker>` lifted to the top of the card so the same category
tags BOTH the uploaded video and the uploaded photo batch — no more
bouncing to `/upload` to pick one. Mixing photos and videos in a single
file pick fans out by MIME after selection.

**What does NOT change**:
- Photo upload pipeline (Supabase batch, JPEG/PNG/WebP, 10 MB).
- Video upload pipeline (Cloudflare Stream tus, 2 GB) + the per-video
  "edit title before start" step (VideoUploader gets `initialFile`).
- `CommunityVideoManageList` rich edit UX (category edit, visibility
  toggle, archive/restore, delete) — still the bottom sub-section.
- `/upload` subroute keeps working (FAB prefill flow goes there).

**Refactors**:
- `CommunityPhotoPanel`: now `forwardRef` exposing
  `CommunityPhotoPanelHandle.addFiles(File[])`. New `hideUploadButton`
  prop hides the upload UI + outer card chrome and renders photos as a
  flat grid (no `<details>` toggle) when embedded.
- `CommunityVideoPanel`: same treatment — `forwardRef` exposing
  `CommunityVideoPanelHandle.pushUploaded(UploadedVideo)`. New
  `hideUploader` prop hides the embedded VideoUploader + address input.
  (Currently unused by the Media tab — kept for parity with listing
  pattern; the Media tab uses `CommunityVideoManageList` for the videos
  sub-section so it gets the visibility/archive UX.)
- `CommunityMediaPanel`: full rewrite from a thin server wrapper into a
  client shell that owns category state + per-file pending video
  uploaders, and routes picked files through the existing pipelines.
- `CommunityPhotosTab`: deleted (49 lines absorbed into the new shell).

**Why a `Wrapper` element on the photo panel**: the panel ships in two
modes — standalone (`/upload` subroute) where it renders its own
`<section>` card with heading, and embedded (Media tab) where it would
otherwise nest a card inside CommunityMediaPanel's outer card. Switch
the wrapper element to `'div'` + drop the chrome when `hideUploadButton`
is set; same component, two callsites, no fork.

## Phase 50.6 — Community editor: low-friction ranges (2026-06-22)

**Trigger**: qiaoxux feedback on 50.5 — "actually you are right, range
makes sense for some fields in a community, I agree, but can you make
them easy to use? Less friction as possible."

**Translation**: 50.5 forced agents to look at two empty input boxes for
both year built and price even when 80% of communities only need one
value (single delivery year, "starting at $X" pricing). Two boxes ≠
free; an empty second box is visual noise that asks "should I fill this
in?" every time.

**Solution — opt-in second input:**

1. **Year built** — adds optional `year_built_end int` column. Default UI
   shows the existing single-year select (with "Type a year…" escape
   hatch); a small "+ Add end year (phased delivery)" link below the
   field reveals a second number input rendered to the right with a
   `–` separator. "− Remove end year" collapses it back and clears the
   value. Schema enforces `year_built_end >= year_built` when both
   present (DB CHECK + zod refine).
2. **Price** — `price_min` and `price_max` already existed. Default UI
   now shows only the From input (suffix "starting at"). "+ Add max
   price (range)" reveals the To input and the From suffix flips to
   "from". Removing the max clears `price_max` to null on save.
3. **HOA** — left as a single value (community-wide HOA ranges are rare
   enough that adding the toggle would just be noise — YAGNI).

**Friction wins**:
- Single-delivery community: 1 click on year (was 1), 1 click on price
  (was 2 — From and To both prompted attention). Net: same or fewer
  decisions.
- Phased / variable-price community: 1 extra click to expand vs. always
  showing two inputs. Trivial cost for the minority case.
- Default form-load shows ~2 fewer empty input boxes per visit, which
  reads as "less work to do here."

**Files**:
- `supabase/migrations/0038_community_year_built_end.sql` — adds
  `year_built_end int` (nullable) + range CHECK 1800–2100 + cross-field
  CHECK `year_built_end >= year_built`. NOT VALID then VALIDATE.
- `lib/zod/community.ts` — adds `year_built_end` (nullable int 1800–
  2100) + cross-field `.refine()` mirroring DB constraint.
- `app/dashboard/communities/actions.ts` — passes `year_built_end`
  through to update.
- `app/dashboard/communities/[id]/page.tsx` — `CommunityRow` +
  `.select(...)` adds `year_built_end`.
- `app/dashboard/communities/[id]/CommunityEditor.tsx` — adds
  `yearBuiltEnd` / `yearEndShown` / `priceMaxShown` state + toggles +
  conditional second-input rendering. `isDirty` and `onSubmit` send
  null when toggle is off so cleared values clear the DB row.

**Verification**: `npx tsc --noEmit` clean, `npm run build` clean.
`/dashboard/communities/[id]` route 14 kB / 192 kB (was 13.5 kB —
+0.5 kB for the toggles + extra state).

**Commit**: `236b2f0`

## Phase 50.5 — Community editor input parity with listing (2026-06-22)

**Trigger**: qiaoxux feedback on the 50.4 community editor —
"Remove hints. Add units. Year built — see how it is done in my listing,
you should do the same for my community. Proactively check others as well.
Be consistent with all inputs."

**Objective**: bring the community metadata form's three free-text numeric
fields (year built / HOA / price range) up to the same typed-numeric +
unit-adornment shape as the listing editor, and strip the per-field hint
strings the 50.4 pass had introduced.

**Actions**:
- New migration `supabase/migrations/0037_community_metadata_typed.sql` —
  drops the three `_text` columns added 4 hours ago in 0036 (no agent had
  populated them yet) and adds typed replacements:
    * `year_built integer` (CHECK 1800–2100)
    * `hoa_fee_monthly integer` (CHECK ≥ 0)
    * `price_min integer` + `price_max integer` (CHECK both ≥ 0 AND
      `price_min <= price_max`).
  All constraints `NOT VALID` then `VALIDATE` so existing rows are
  unaffected. Pushed via `npm run db:push` — supabase CLI applied 0037 to
  prod.
- `lib/zod/community.ts` — replaced `hoa_fee_text` / `year_built_text` /
  `price_range_text` schemas with `z.number().int()` schemas matching the
  DB constraints, plus a `.refine()` cross-field check so the UI shows
  "Price (from) must be ≤ price (to)" before round-tripping. JSDoc updated.
- `app/dashboard/communities/actions.ts` — `updateCommunity` writes the new
  typed columns instead of the dropped text columns; null-coalescing logic
  unchanged.
- `app/dashboard/communities/[id]/page.tsx` — `CommunityRow` interface +
  `.select(...)` updated.
- `app/dashboard/communities/[id]/CommunityEditor.tsx` — full rewrite of
  the affected fields:
    * **Year built**: copied the listing editor's dual-mode pattern verbatim
      — `<select>` of current-year + 24 prior years with a "Type a year…"
      escape hatch into a `<input type=number min=1800 max=2100>`. Same UI,
      same affordances, same "Use list" toggle.
    * **HOA fee**: `<input type=number>` with absolute-positioned `$` prefix
      and `/month` suffix, matching the listing HOA field exactly.
    * **Price range**: split into two `$`-prefixed number inputs labeled
      "from" / "to" in a 2-column grid. This is friendlier than free-text
      "$450k–$1.2M" because agents never have to think about which dash
      character to use, "k" abbreviations, or whether to put a space around
      the en-dash.
    * Extracted a small `DollarInput` helper (12 lines) to keep the three
      `$`-prefixed inputs DRY.
    * Removed every `hint=` prop on `<Field>` calls per owner ask. Kept all
      placeholders showing real example values — those communicate format
      without the visual noise of hint lines.
    * `isDirty` and `onSubmit` logic now compares numeric state via a
      `sameInt(a, b)` helper that parses the input string before comparison.
- DEVLOG (this entry) + RELEASE.md v0.54.4 entry added.

**Decisions**:
- *Why drop+rebuild the 0036 columns instead of in-place ALTER COLUMN
  TYPE?* 0036 was applied to prod ~4 hours before this migration and no
  agent had touched a community since. A clean drop+add avoids `USING`
  cast clauses that would have to handle "$450k–$1.2M"-style free-text
  values that we know don't exist yet. Cheaper now than in two weeks.
- *Why split price into min/max instead of a single `price_text`?* The
  owner specifically asked for input parity with the listing editor. The
  listing editor uses typed numerics with adornments; the community editor
  now does too. Splitting also unlocks a future "filter communities by
  price range" buyer search that needs structured data.
- *Why a single year (not a range) for year_built?* Listing's year_built
  is `int`. The owner asked for the same shape. Communities that span
  multiple build years (2018–2024) lose some fidelity, but the listing
  editor treats the same trade-off as acceptable, and the description /
  highlights / tagline fields can carry "phased delivery 2018–2024" if it
  matters. If this proves too lossy in practice, a `year_built_end` int
  is a one-column add — but YAGNI for now.
- *Why remove all hints?* Owner explicit ask. Placeholders + adornments
  (`$` / `/month`) carry the same information; hints below the input were
  visual clutter once the form already has clear labels and example
  placeholders. The Tagline field's "Optional" hint and the County's
  "Helps property-tax lookups" gloss are gone — if either becomes
  confusing in user testing we add them back as lighter inline help.

**Verification**:
- `npx tsc --noEmit` → clean.
- `npm run build` → clean. `/dashboard/communities/[id]` 13.5 kB / 192 kB
  (50.4 was 13 / 191 — 0.5 kB delta from the DollarInput helper +
  dual-mode year selector).
- DB: 0037 applied to remote.
- Awaiting Vercel preview + qiaoxux UI sign-off.

**Pitfalls / learnings**:
- `parseIntOrNull` matters at three sites — initial state hydration,
  isDirty comparison, and onSubmit payload — and they all need to agree
  on "empty string ↔ null". Centralizing the helper meant one of those
  three didn't silently disagree.
- The listing editor already had the exact `buildYearOptions()` /
  dual-mode pattern. Cargo-culting it byte-for-byte is the right call here
  — once the same field starts diverging across two editors, the inputs
  feel "almost-but-not-quite" alike and that's the worst kind of UX.

**Next steps**:
- Buyer-side `/c/[slug]` rendering of `year_built` / `hoa_fee_monthly` /
  `price_min..price_max` (will need a small `formatPriceRange` helper).
- Community list cards on `/dashboard/communities` could show the
  `price_min` "from $X" badge if present.
- Search filter by `property_types` (still pending from 50.4).

---

## Phase 50.4 — Community metadata expansion (2026-06-22)

**Trigger**: qiaoxux on community detail page after the 50.3 cleanup landed —
"Add all you mentioned in tier 1 and 2, make input user friendly, less
friction. Users only need to make minimal changes and each input is
self-explained."

**What's added.** 10 new optional metadata fields on `communities`:

- **Tier 1 (high-ROI buyer questions)**: `zip`, `county`, `hoa_fee_text`,
  `year_built_text`, `price_range_text`, `property_types text[]`
- **Tier 2 (nice-to-have)**: `highlights text[]`, `builder`, `website`,
  `tagline`

Migration `0036_community_metadata_fields.sql` — all `add column if not
exists ... text` (or `text[]`), all nullable. Existing rows stay valid.
RLS unchanged — the existing creator-only update policy already covers any
column on `communities`.

**Why "_text" suffixes on numeric-ish fields.** Agents routinely write
ranges like `$450k–$1.2M`, `2018–2024`, `$220/mo + one-time initiation`.
Forcing strict numeric types would create more friction than it saves
(every range needs a workaround) and make the UI worse for the 80% case.
Filterability traded for input ergonomics — V1 trade-off.

**`property_types`** is the one enum we kept strict. Capped to a small
canonical list (`COMMUNITY_PROPERTY_TYPES` in `lib/zod/community.ts`) so
the eventual buyer-side filter UI has stable values: Single Family,
Townhome, Condo, Active Adult 55+, New Construction, Resale, Custom Build.
Surfaced as multi-select chips in the editor — agents click to toggle
instead of remembering a CSV format.

**Friction-minimization patterns** baked into the editor rewrite:

1. **Real example placeholders**, not format hints. e.g. price-range
   placeholder is `$450k – $1.2M`, not `<low>-<high>`. Agents start typing
   without thinking about format.
2. **Short purpose hints** under each field (5–7 words). Tells the agent
   *why* the field exists, not how to fill it.
3. **Chip-style inputs for arrays.** `highlights` and `property_types` use
   chip UI — Enter or comma to commit, ✕ to remove. The input *is* the
   format; agents don't have to learn a serialization. Inspired by Linear's
   label picker.
4. **Sectioned form**, not a flat wall of inputs. Identity / Location /
   Pitch / Property / Contact — reads as a story.
5. **Save button gates on dirty state.** `isDirty` memo compares all
   fields against the loaded row; button disables when nothing changed.
   Removes the "did it actually save?" foot-gun. Adds a small
   "No unsaved changes" hint when idle and clean.
6. **Empty arrays normalize to NULL** server-side. Distinguishes "agent
   never touched this" from "agent set and then cleared", which matters
   for future feature-flagging like "communities missing price range".

**Files**:
- `supabase/migrations/0036_community_metadata_fields.sql` — added (10 cols)
- `lib/zod/community.ts` — extended `UpdateCommunityInput` with 10 fields,
  added `COMMUNITY_PROPERTY_TYPES` const + `CommunityPropertyType` type,
  added `optionalText` and `optionalUrl` helpers
- `app/dashboard/communities/actions.ts` — `updateCommunity` writes the 10
  new columns; arrays collapse to NULL when empty
- `app/dashboard/communities/[id]/page.tsx` — `CommunityRow` type extended,
  `select(...)` widened to include the 10 cols
- `app/dashboard/communities/[id]/CommunityEditor.tsx` — full rewrite of
  the form: 5 grouped fieldsets, ChipInput primitive for arrays, real
  example placeholders, isDirty-gated submit, single Save button at the
  bottom (no per-field auto-save — community editor has always been
  explicit-save unlike listings)

**Build & validation**:
- `npx tsc --noEmit` clean
- `npm run build` clean — `/dashboard/communities/[id]` route 13 kB / 191 kB
  (was 10.5 kB / 189 kB; +2.5 kB for 10 new fields and the chip primitive
  is acceptable)
- `npm run db:push --include-all` applied — 0034/0035/0036 all pushed
  successfully (0034 community drafts, 0035 community events, 0036 metadata
  fields — 0034/0035 had been authored earlier but not yet pushed)

**Known follow-ups** (not in this phase):
- Buyer-facing public community page (`/c/[slug]`) doesn't yet render the
  new fields. Currently only name/city/state/description show. Next phase
  should surface `tagline` near hero, `highlights` as a chip strip,
  `property_types`/`builder`/`year_built`/`price_range`/`hoa_fee` as a
  fact panel, `website` as an outbound link, `zip`/`county` discreetly.
- Search/filter doesn't index `property_types` yet. When buyer search gets
  a property-type filter, this column is what it queries.
- The agent-side community list (`/dashboard/communities`) doesn't show
  `tagline` on the card. Quick win.

## Phase 50.2 — Community hub: hero parity + flatten Details (2026-06-22)

**Trigger**: qiaoxux on community detail page — "Preview and state at top
right - reuse the same logic from my listing hero page. Nested box should
be removed, you can check how my listing page is implemented."

**Hero parity.** Listing hero had `Preview ↗` + `InstantStatusToggle`
(chromeless, frosted hover, instant flip + missing-fields popover for
listings). Community hero had only the older `CommunityStatusPill` →
`StatusPill` bridge, with an outline pill style and no Preview link.

Fix: extended `InstantStatusToggle` with a `kind: 'listing' | 'community'`
prop. The component now branches between listing publish actions and
community status actions internally. Community hero now renders the same
`<HeroControl href="/c/{slug}">↗ Preview</HeroControl>` + toggle pair as
the listing hero. Visually identical.

`StatusPill.tsx` and the `CommunityStatusPill` bridge file deleted — no
remaining consumers (verified via grep).

**Flatten Details.** Details panel rendered:
```
<section> ─ "Community details" + View public page →
  <CommunityEditor>
    └─ <section> ─ "Community details"  ← duplicate inner box + heading
       <form>...</form>
    └─ <DangerZone>
```

Refactor: `CommunityEditor` now renders only the form content (no outer
section, no duplicate heading), matching how `EditListingForm` is shaped.
The `DangerZone` was lifted out of `CommunityEditor` and renamed
`CommunityDangerZone` (still in the same file). Page-level `details` panel
now mirrors the listing layout: outer section card with heading + "View
public page" link, form inside, `<CommunityDangerZone>` as a sibling
section below — identical to listing's `details: { <section>EditListingForm + <DangerZone> }`.

The "View only" badge + non-owner "you can still upload" notice migrated
from inside CommunityEditor up to the page-level details panel since the
form no longer owns its frame.

**Files**:
- `app/dashboard/_components/InstantStatusToggle.tsx` — added `kind` prop +
  community branch (calls `setCommunityStatus`).
- `app/dashboard/communities/[id]/page.tsx` — hero controls now mirror
  listing; details panel flattened, DangerZone lifted out.
- `app/dashboard/communities/[id]/CommunityEditor.tsx` — section/heading
  removed, DangerZone exported as `CommunityDangerZone`.
- `app/dashboard/communities/[id]/CommunityStatusPill.tsx` — deleted.
- `app/dashboard/_components/StatusPill.tsx` — deleted.

**Verify**: `npx tsc --noEmit` clean, `npm run build` clean.

## Phase 50.1 — Community hub: Marketing/Analytics gate fix (2026-06-22)

**Bug**: qiaoxux reported "only see details and media tabs from my community"
right after Phase 50 shipped. Root cause: tabs were gated on a strict
`isOwner = created_by != null && created_by === myAgentId`, but
**legacy communities have `created_by = null`** (created before
authorship was tracked). Those communities are editable by anyone
(`canEditMetadata = true`) but failed the strict ownership check, so
Marketing and Analytics tabs disappeared even for users actively
managing the community.

**Fix**: gate Marketing / Analytics / Cover / StatusPill on
`canEditMetadata` instead of `isOwner`. Now:
- legacy null-`created_by` communities → all 4 tabs visible to anyone
  who can edit them (matches existing CommunityEditor permission).
- modern owned communities → unchanged: only the creator sees the 4
  tabs, contributors see Details + Media.

One-liner: `isOwner` → `canEditMetadata` in 4 spots in
`app/dashboard/communities/[id]/page.tsx`.

## Phase 50 — Community agent hub mirrors listing edit hub (2026-06-22)

**Objective**: qiaoxux: "agent hub my community, select one community,
there are 3 tabs: details, video and photo, do you have any suggestions
to add or update or remove anything?" The community detail page only had
Details / Videos / Photos — no Marketing copy, no Analytics, and Cover
sat as its own owner-only tab. The listing edit hub right next door has
five icon chips (Details · Media · Marketing · Leads · Analytics). The
two surfaces should read the same so an agent's brain reuses the same
mental model across both nouns.

**Approach**: rebuild `/dashboard/communities/[id]` as a 4-icon-tab hub
mirroring the listing edit hub, and DRY the cross-cutting machinery
(events, analytics, drafts, marketing prompt) so both nouns share one
implementation. Skip Leads on community side (community pages don't
collect leads — leads are listing-scoped).

**Tabs**:
- **Details** (FileText) — `<CommunityEditor>` + public-page link.
- **Media** (ImageIcon) — Videos + Photos in a single card. Cover panel
  folded in beneath them, owner-only.
- **Marketing** (Megaphone, owner-only) — language-only generator (5
  buyer languages). Listing's `SocialCopyPanel` is platform×language;
  community is language only because buyers reach `/c/<slug>` via a
  single URL and the platform axis adds no signal.
- **Analytics** (LineChart, owner-only) — same KPIs and funnel as the
  listing analytics tab.

**DRY refactors**:
- `lib/analytics/listing-stats.ts` → re-export shim around new
  `lib/analytics/entity-stats.ts` (`getEntityStats({ entityType, entityId })`,
  `getRollupEntityStats(...)`). Same `EntityStats` shape for both.
- `app/dashboard/_components/AnalyticsPanel.tsx` — generic
  `<AnalyticsPanel entityKind entityId>`; old `edit/AnalyticsPanel.tsx`
  deleted, listing edit page rewired.
- `lib/events/track.ts`: `EventInput` now `{ listing_id?, community_id? }`
  XOR. `app/api/events/route.ts` zod-enforces XOR on the wire.
- `lib/ai/anthropic.ts` adds `generateCommunityMarketing` (community
  vocabulary, no platform axis), distinct from the listing one.
- New `app/api/generate-marketing/route.ts` (community-only) and
  `app/api/communities/[id]/social-drafts/route.ts` (CRUD on
  `saved_social_drafts` rows where `community_id` is set, `platform`
  null, `language` set).

**Migrations**:
- `0034_saved_social_drafts_community.sql` — adds `community_id` FK,
  makes `platform` nullable, XOR check, RLS on `community_id` ownership.
- `0035_events_community.sql` — adds `community_id` FK + RLS that scopes
  reads to communities the calling agent created.

**Buyer-side**: `app/(public)/c/[slug]/_components/CommunityBody.tsx`
fires `track({ event_type: 'page_view', community_id })` on mount. Same
shape as the listing video feed page_view. This is what feeds the
community Analytics tab.

**Tests**: extended `lib/analytics/__tests__/listing-stats.test.ts` to
cover both entity types (single + rollup). `tsc --noEmit` clean. Biome
clean on phase-50 surface (the two pre-existing useTemplate hits in
the listing prompt and one community-feed test failure on `main`
predate this phase).

**Out of scope (future)**:
- Wire community_id into per-card / per-video events on the feed pages
  so the funnel beyond page_view fills in. Today only page_view fires
  on /c/[slug].
- Listing/community Leads parity — communities don't collect leads at
  all yet; if that changes we'll add a Leads tab.

## Phase 49.3 — My-listing tabs: Amazon-style icon chips (2026-06-22)

**Objective**: qiaoxux flagged the 5 sub-tabs on the listing-edit hub
(Details · Media · Marketing · Leads · Analytics) overflow on mobile —
only ~3 of 5 are visible in the horizontal pill row today. Goal: make
the row visually distinct from any text-tab nav above/below, identical
desktop and mobile, with all 5 reachable.

**Approach**: built 4 prototype variants under
`public/prototype/agenthub-tabs-vertical.html` (A vertical sidebar /
B icon rail / C hybrid / D Amazon-chip). Owner picked **D** —
horizontal layout on both surfaces, but the flat text pills become
**circular icon chips with a label below**, modelled on Amazon
Grocery's subcategory shortcuts. Icons differentiate the sub-tab row
from sibling text-pill nav (BottomNav, page header) and give each tab
its own identity.

**Changes**:
- `app/dashboard/_components/HubTabs.tsx`: added optional `icon: ReactNode`
  field on `HubTab`. When *any* tab passes an icon the component
  switches to **chip mode** (circle icon + label below + active
  underline + soft right-edge mask hinting at scroll on mobile);
  otherwise the original pill mode is preserved unchanged. This keeps
  the community detail hub (`/dashboard/communities/[id]`) on the
  existing pill row — only my-listing opts in.
- `app/dashboard/listings/[id]/edit/page.tsx`: pass lucide icons
  (`FileText` / `ImageIcon` / `Megaphone` / `Users` / `LineChart`) on
  each of the 5 tabs.

**Decisions**:
- Backwards-compat over a forced rewrite: `icon` is optional, mixed
  icon/no-icon is supported (chip mode triggers on any), so the
  community hub keeps its current pill row with zero churn.
- Chip size 56 px mobile / 64 px desktop — tactile target without
  blowing up vertical space too much.
- Active state = `border-2 border-ink` + `bg-cream` + bottom underline
  (not a fill colour) — stays inside the muted ink/cream/surface
  palette, no chromatic accent introduced.
- Right-edge mask only on mobile (`sm:[mask-image:none]`) — desktop
  fits all 5 chips without scroll, no fade needed.

**Verification**: `npx tsc --noEmit` clean, `npx next build` green.

**Next steps**: ship to main so qiaoxux can verify on the live deploy
and the AgentHub demo.

## Phase 49.2 — Agent-hub My Leads + Analytics redesign (2026-06-22)

**Objective**: qiaoxux clarified Phase 49/49.1 had hit the *listing-edit*
hub by mistake. Real target: top-level agent-hub sub-tabs at
`/dashboard/leads` and `/dashboard/analytics`. Also rename the tab from
"Leads" to "My Leads".

**Changes**:
- `app/_components/nav-config.ts`: agent sub-tab `Leads` → `My Leads`.
- `app/dashboard/leads/leads-live.tsx` — V1 Inbox redesign:
  - **4-stat strip dropped** (Total / This week / Pending email /
    Awaiting follow-up). Filter chips below carry the same scoping; the
    strip was redundant noise above the actual data.
  - **Counts removed from chips** ("All", "Awaiting follow-up", "This
    week", "Pending email" — pills only). Per owner: drop the count
    from the tab.
  - Each lead is now a single grid row: status dot (sage `#6b7a5a` open
    / outline followed-up) · name · message + listing meta · timeAgo ·
    Email/Text/Mark icon buttons. Followed-up rows fade to 55%.
  - Email + Text icon buttons auto-mark followed-up on click (one tap
    instead of menu).
  - Inline action menu removed; explicit Mark/Undo icon kept at row end.
  - Search box + Export CSV moved into the controls row.
- `app/dashboard/analytics/page.tsx` — V3 Asymmetric redesign:
  - **Likes card removed** from the top-level rollup view (it remains
    available per-listing). Owner-actionable performance only.
  - **Unique sessions demoted** from a card to a sub-line under Views
    ("N unique sessions"). It's context for Views, not a goal.
  - Cover Views card spans 2 rows on `sm+`, with the existing 7-day
    sparkline rendered inside it.
  - Sidebar cards: Leads (with conversion % sub-line), Watch-through
    ring (`videoCompletes / pageViews`, conic-gradient sage).
  - 4-step funnel (Page views → Card views → Video completes → Leads)
    added below KPIs. Terminal step (Leads) painted in sage.
- Phase 49 (listing-edit hub) intentionally **left in place** per
  owner ("All good now").

**Verification**: `npx tsc --noEmit` clean; `npx next build` clean.
`/dashboard/leads` route bundle 3.39 kB (164 kB First Load), unchanged
order of magnitude.

**Pitfalls fixed during impl**:
- `getRollupStats` already exposes `videoCompletes`, `cardViews`,
  `leadConversionPct` — no schema changes needed.
- 7-day sparkline at the *agent rollup* level is honest (real
  page_view events bucketed by date), unlike the per-listing variant
  reverted in 49.1.

## Phase 49 — Leads + Analytics tab redesign (2026-06-22)

**Objective**: qiaoxux: drop the count from the Leads tab, redesign the
Leads and Analytics panels to be more concise and focused. Picked
**Leads B** (left status bar) + **Analytics A** (3 KPIs + funnel) from
prototype `/prototype/leads-analytics-redesign.html`.

**Changes**:
- `app/dashboard/listings/[id]/edit/page.tsx`:
  - Tab label hardcoded to `Leads` (was `Leads · ${openLeads}`).
  - Removed the open-leads SSR fetch that fed the badge — no consumer
    left, kills one Supabase round-trip per page load.
- `ListingLeadsPanel.tsx` — Leads B redesign:
  - Sage left bar (`#6b7a5a`) marks awaiting-follow-up rows; line-color
    bar marks followed-up. Replaces the "New" pill so status is readable
    at a glance without a chip.
  - Email + phone collapsed to one muted meta line.
  - `source` column dropped (agent already knows where they shared).
  - Message `line-clamp` reduced 2 → 1.
  - Section header still carries `N total · M awaiting follow-up`.
  - Sage color is inline (no Tailwind token — Vicinity has no `accent`
    that isn't aliased to ink).
- `AnalyticsPanel.tsx` — Analytics A redesign:
  - Six headline KPIs (Page views, Unique sessions, Card views, Video
    completes, Leads, Conv. %) collapsed to three: **Views · Leads ·
    Conv. %**. Conv. % is **hidden when leads = 0** (per owner: don't
    show a 0% number that's just "no data" — Leads card already says).
  - Grid auto-switches `grid-cols-3` ↔ `grid-cols-2` based on Conv. %
    visibility.
  - Top-cards section dropped (rarely actioned at the listing-agent
    level; still computable from `getListingStats` if a global rollup
    wants it later).
  - Engagement funnel kept verbatim — it's the one number set Vivian
    actually digs into.
  - Funnel header subtitle changed `% relative to N page views` →
    `% of step before` to match what the right column actually computes.

**Verification**:
- Prototype reviewed at `https://www.vicinities.cc/prototype/leads-analytics-redesign.html`.
  Owner picked Leads B + Analytics A explicitly with the
  hide-Conv%-when-leads=0 caveat.
- `npx tsc --noEmit` clean.
- `npx next build` clean.

**Decisions**:
- Sage color inlined as a single hex constant rather than adding a
  token. Single-purpose, single file. Tailwind JIT only emits classes
  that exist, and there's no broader theme need yet.
- Kept the "Conv. % hidden when leads=0" logic in the panel rather
  than a `lib/analytics/listing-stats.ts` shape change. The stat library
  still returns the full ListingStats; only the UI elides the card.
  This keeps `getRollupStats` (dashboard rollup) unchanged.

**Next steps**:
- Watch for owner pushback on the dropped Top cards / Unique sessions /
  Video completes / Card views KPIs. They're still present in
  `ListingStats`; we can resurface any of them as a secondary panel
  if Vivian asks.

## Phase 48.6 — Quiet cache + default heading (2026-06-22)

**Objective**: qiaoxux 48.5 follow-up. Two trims:
1. The green "cached" pill on the output card was ops/internal info
   leaking into agent UX — agents don't care whether we called Claude
   or returned a saved draft, only that the right text is in the box.
2. Saved-draft rows without a custom title showed empty heading +
   "Title" CTA, which read as a missing field instead of an optional
   one. Default the heading to `Platform · Language` and drop the
   redundant lower meta line.

**Changes**:
- `SocialCopyPanel`:
  - Removed the `outputCached` state, the green pill, and the cached
    detection in the response handler. Server still returns
    `cached: true` (kept for telemetry/debug); UI just ignores it.
  - `DraftRow` heading is now always rendered. Falls back to
    `Platform · Language` (e.g. "Facebook · English") when no custom
    title is set — styled `text-ink2` to telegraph "auto" — and
    bumps to `text-ink font-medium` once renamed.
  - Dropped the secondary platform + language pills below the
    heading; they were duplicate info now that the heading carries
    them by default.
  - Single button label: **Rename** (was conditionally "Title" /
    "Rename" depending on whether a custom title existed).
- API and DB unchanged — `cached` flag still set, `title` column
  still nullable, semantics intact.

## Phase 48.5 — Social drafts: cache + rename + tour-panel polish (2026-06-22)

**Objective**: qiaoxux follow-up on 48.4.
1. Tour panel teaser was ambiguous — needed "— coming soon." appended
   so agents know the disabled button isn't a bug.
2. Re-clicking Generate with identical inputs was hitting Claude every
   time, burning tokens for a result we already had on disk as a saved
   draft.
3. Saved drafts list quickly accumulated rows that were
   indistinguishable at a glance ("Facebook · English · 6/22 7:42 PM" ×
   12). Needed user-supplied titles for triage.

**Changes**:
- `GenerateTourPanel`: blurb extended to "Turn 10 listing photos into a
  30-second home tour video — coming soon."
- `lib/ai/social-cache.ts` (new): server-side input fingerprint.
  `socialDraftHash({platform, language, highlights})` normalizes
  highlights (trim → lowercase → dedupe → sort) then sha256 of the
  JSON payload. Server-only — clients never compute or send the hash,
  so a malicious client can't poison or flush the cache.
- `app/api/generate-social/route.ts`: before charging the rate limit
  and calling Claude, check `saved_social_drafts` for a row with
  matching `(listing_id, input_hash)`. Hit → return that body with
  `cached: true`. Skipped on refine (`previous_drafts` present) and on
  multi-cell calls (forward-compat, nobody uses it today).
- `app/api/listings/[id]/social-drafts/route.ts`:
  - POST stamps `input_hash` so the row becomes a cache target the
    next time the agent generates with identical inputs.
  - PATCH now accepts `title` (≤ 120 chars; empty string clears).
    `body`/`title`/`language` are all optional — refine zod requires
    at least one. Body edit invalidates `input_hash` via DB trigger
    (set NULL), so a stale tweaked body never serves as the cache
    answer for a future fresh prompt.
  - GET returns `title` alongside the existing fields.
- `supabase/migrations/0033_saved_social_drafts_title_and_cache.sql`:
  adds `title text` (with 1..120 char_length check) + `input_hash text`
  + sparse index on `(listing_id, input_hash) where input_hash is not
  null` + trigger that nulls `input_hash` on body change.
- `SocialCopyPanel`:
  - Output card shows a green **cached** pill when the response was
    served from a saved draft.
  - Saved-draft rows now show their title (when set) as the heading,
    with a **Title** / **Rename** button (`Tag` icon). Inline input,
    Save/Cancel, ≤ 120 chars, empty value clears.
  - Edit and rename are mutually exclusive (only one inline editor
    open per row at a time) so the actions row stays sane.

**Cache semantics deliberately chosen**:
- Cache key = `(listing_id, sha256(platform, language, sorted highlights))`.
  Listing facts (price, beds, etc.) are intentionally NOT in the key —
  they live on the listing and a listing facts change doesn't
  invalidate. Trade-off accepted: an agent who edits listing price and
  hits Generate gets the old cached body. Mitigation: the cached pill
  is visible, and the agent can click Refine to force a fresh call.
- Edits null out `input_hash` automatically — once a row diverges from
  "the canonical answer for this prompt", we never serve it as one.
- Refine path always bypasses the cache (intent is to regenerate).

**Migration**: 0033 to push to remote after merge.

## Phase 48.4 — Social drafts: editable + refine-from-edits (2026-06-22)

**Objective**: qiaoxux follow-up on 48.3. Two pain points after the
persistence ship:
1. The tour panel had a section `<h2>` that duplicated the button label
   and added visual chrome to a section that's currently just a teaser.
2. Saved drafts were immutable — a typo or polish required delete +
   re-save (lost the row's history). And worse, hitting **Regenerate**
   on an edited output threw away the agent's edits because the model
   had no idea they happened.

**Changes**:
- `GenerateTourPanel`: dropped the `<h2>` ("Create a home tour video from
  photos") and the "Coming soon" badge that lived next to it. The
  disabled CTA already says "Create a home tour video" with a tooltip,
  so the section is self-describing.
- `lib/ai/anthropic.ts` `generateSocialCopy`: new optional
  `previousDrafts` param shaped exactly like the output map. When a
  cell has a non-empty seed, the user payload carries `previous_drafts`
  + a `previous_drafts_note` instructing the model to treat that string
  as the agent-edited starting point — preserve voice, phrasing, and
  any specific facts the agent added; refine only to better match the
  platform brief and requested language. Each seed defensively trimmed
  to 8 KB (matches the `saved_social_drafts.body` column constraint).
- `app/api/generate-social/route.ts`: schema accepts
  `previous_drafts: Record<platform, Record<language, string>>` (≤ 8 KB
  each), forwards to `generateSocialCopy`.
- `SocialCopyPanel`:
  - Right-pane textarea is now editable. As soon as the agent types,
    `outputEdited` flips and the Generate button re-labels to **Refine
    from edits**, signaling that hitting it will *refine* not regen
    from scratch.
  - Live "edited" pill next to the platform tag while edits are
    pending.
  - When `outputEdited` is true, Generate sends
    `{ previous_drafts: { [platform]: { [language]: output } } }`
    alongside the usual fields; on a successful response the flag
    resets so the next click is a normal regen.
  - **Saved drafts** rows now have a **Refine** button (loads draft
    into the editor + sets platform/language + flips edited so the
    next Generate click refines from this body) and an **Edit**
    button (inline textarea + Save/Cancel). The "(edited)" suffix
    appears on rows where `updated_at != created_at`.
- `app/api/listings/[id]/social-drafts/route.ts`: new `PATCH` handler
  takes `{ draft_id, body, language? }`. Validates with the same zod
  enums and 8 KB cap. Hits the `social_copy` rate bucket so edit churn
  can't bypass the rate limit. Filtered by `id` + `listing_id` to pin
  the row; RLS update policy gates by agent → user. GET response now
  includes `updated_at` and orders by `updated_at desc` so freshly
  edited drafts float to the top.
- `supabase/migrations/0032_saved_social_drafts_update.sql`: adds
  `updated_at` column + auto-touch trigger + RLS update policy
  mirroring the select policy.

**Why edits feed back as "refine seed" (not just plain regen)**: the
agent has insider knowledge — exact street names, neighborhood
shorthand, school references, language-specific idioms. Throwing that
away every regen click trains them to never click Regenerate. Treating
their edits as the seed turns Regenerate into an iterative polish loop
instead of a destructive lottery.

**Why edit + refine on saved drafts (not just on the live output)**:
saved drafts are the durable artifact — they survive a refresh, a tab
close, a teammate handoff. Mutating them in place keeps the row
identity (and timestamp lineage) stable; the alternative (delete +
re-save) loses the original `created_at` and counts toward the 50-row
cap twice during the brief window before optimistic delete settles.

**Migration target**: 0032 deployed to remote via `supabase db push`.

## Phase 48.3 — Social drafts: persistence + tour panel polish (2026-06-22)

**Objective**: qiaoxux follow-up on Phase 48.1. Tour panel still had
dated "Q4 2026" text and a paragraph promising provider eval; selling
points hint was a paragraph; platform/language dropdowns each carried a
hint; generated copy was lost on refresh; save surface had no abuse
controls.

**Changes**:
- `GenerateTourPanel`: dropped "Q4 2026" badge text → just "Coming
  soon". Removed the "We'll evaluate the best provider this fall…"
  blurb. Renamed CTA "Generate AI tour video" → "Create a home tour
  video". Section title unchanged ("Create a home tour video from
  photos"). Tooltip + button now say the same thing for consistency.
- `SocialCopyPanel`:
  - Selling points hint trimmed to a bare word counter:
    "Up to 50 words (N/50)" — turns red when over. Generate disabled
    while over the cap.
  - Removed all hints from Platform / Language selects (no more target
    length under platform; languages never had one).
  - **Save** button next to Copy on the output card. Persists the
    generated body + platform + language + highlights to a new
    `saved_social_drafts` table.
  - **Saved drafts** card below the L/R split, listing every saved
    draft for this listing (newest first) with copy + delete actions.
    Optimistic delete; rollback on failure.
- `supabase/migrations/0031_saved_social_drafts.sql`: new table with
  RLS scoped agent → listing → drafts. Body length capped at 8 KB at
  the column level; per-listing 50-row cap enforced by trigger
  (`enforce_saved_social_drafts_cap`). Insert policy joins through
  listings → agents → user_id (defense-in-depth alongside the route
  handler ownership check). No update policy — drafts are immutable;
  edit means delete + re-save.
- `app/api/listings/[id]/social-drafts/route.ts`: GET / POST / DELETE.
  - All three require an authenticated agent.
  - Listing ownership verified explicitly even though RLS would catch
    it (fail-fast 404 vs. silent empty result).
  - POST validates platform/language enums + body ≤ 8 KB; double-up
    with DB constraints.
  - POST shares the `social_copy` rate-limit bucket (10/min/agent) so
    saving can't be abused as a free unbounded write surface.
  - 409 cap_reached when the trigger fires.
  - DELETE is RLS-gated; agent can't pass another agent's draft id.

**Verification**: `npx tsc --noEmit` clean, `npx next build --no-lint`
succeeds.

**Decisions**:
- 50 drafts per listing is plenty: 9 platforms × 5 languages = 45 cells
  if an agent saved every variant once. Soft cap with surfaced error
  beats silent eviction.
- 8 KB body cap: longest legitimate single-cell output is ~2 KB
  (Facebook long-form post in zh). 8 KB allows generous over-shoot
  without enabling abuse.
- Reuse `social_copy` rate bucket on save: keeps the abuse surface to
  one knob. If a user saves at 10 req/min legitimately, they're also
  generating, so the bucket is already warm — no UX regression.
- Drafts stored as plain rows, not jsonb blobs, so we can later index
  by platform/language for analytics without migration churn.

## Phase 48.1 — Marketing tab layout cleanup + tour script relocation (2026-06-22)

**Objective**: qiaoxux follow-up on Phase 48. Layout was cluttered: tour
generator card sat above the social copy in the Marketing tab; copy panel
had a redundant "Facebook + Instagram drafts" header from before Phase 48
that the checkbox grid replaced; checkbox grid felt like overkill when
agents typically generate one cell at a time and pick the next platform
manually.

**Changes**:
- `GenerateTourPanel`: relocated from Marketing tab into Media tab as a
  standalone bottom section. Renamed "AI tour video" → "Create a home
  tour video from photos" so the affordance is self-describing.
- `MarketingPanel.tsx`: deleted. The Marketing tab's `marketing` slot
  now renders `<SocialCopyPanel>` directly — no wrapper title, no
  sub-tabs, no redundant chrome.
- `SocialCopyPanel`: rebuilt as a 2-column L/R split.
  - Left: Selling points input (with an upper-limit hint instead of a
    descriptive blurb), Platform dropdown (9 options, each with its
    target-length hint surfaced under the select), Language dropdown
    (5 options), single Generate button.
  - Right: single output card with Copy button. Empty state shows
    "Generated copy will appear here."
  - Lost the Phase 48 checkbox grid + per-platform card list. The API
    still accepts platforms/languages arrays for forward compat — we
    just send 1-element arrays.

**Verification**: `npx tsc --noEmit` clean, `npx next build --no-lint`
succeeds. MarketingPanel.tsx removed; only DEVLOG history references it
now.

**Reasoning for single-cell**: with 9 platforms × 5 languages, the
checkbox grid encouraged spraying; agents reported reading one cell at a
time anyway. Dropdown + Regenerate is fewer clicks for the common case
(one platform, regenerate until happy, switch platform, repeat) and
keeps the right column readable instead of scrolling through a stack of
half-read cards. If batching becomes important again the API contract
hasn't changed.

## Phase 48 — Marketing tab: multi-platform × multi-language social copy (2026-06-22)

**Objective**: qiaoxux — agent hub Marketing tab is poorly organised, only 3
platforms (Facebook / Instagram / Email), English only. Add Rednote (小红书)
plus the popular US homebuyer languages, and ground the generator in actual
listing content (description text, photo captions, video titles) instead of
hallucinating from address + price alone.

**Positioning pivot** (CLAUDE.md §1): the US homebuyer pool is multilingual.
Non-English buyers are part of the target audience, not a separate
Chinese-community spinoff. Buyer-facing marketing copy generators may now
emit multiple languages on agent opt-in; Rednote / WeChat Moments are
allowed there for the same reason. Schema, dashboard chrome, and buyer-
facing UI strings stay English-only — the change is scoped to the social
copy generator. CLAUDE.md §1 rewritten to reflect this.

**Actions**:

- `lib/ai/anthropic.ts`: rebuilt `generateSocialCopy` to take `platforms[]`
  and `languages[]` arrays and return a 2-D `{ [platform]: { [language]: string } }`
  map. Added platform briefs for the 9 supported platforms (facebook,
  instagram, email, tiktok, x, linkedin, threads, rednote, wechat) so the
  prompt encodes platform-specific norms (URL conventions, hashtag
  conventions, character caps for X, "no link in TikTok caption", "no
  hashtags on WeChat Moments", etc.). Languages: en, zh, es, vi, ko.
  `maxTokens` scales with `platforms × languages` (capped at 8000).
- `app/api/generate-social/route.ts`: schema accepts `platforms` (1..6) and
  `languages` (1..4) per call. Backend now also pulls `listings.description`,
  `listing_photos.alt_text` (≤12 in sort order), and `listing_videos.title`
  (≤12) and passes them to the model as grounding. Pure text — no vision
  tokens. Empty values are dropped before the prompt.
- `app/dashboard/listings/[id]/edit/SocialCopyPanel.tsx`: rebuilt UI from
  fixed 3-tab to a checkbox grid — two side-by-side fieldsets (Platforms /
  Languages) with pill toggles, then a Generate button that produces every
  selected (platform, language) cell in one Anthropic call. Output renders
  as one card per platform with a language sub-tab strip + per-cell Copy
  button. Counter on each fieldset shows N/cap; the Generate button is
  disabled and explains why if 0 selected or over the cap.
- `CLAUDE.md` §1 rewritten — see "Positioning pivot" above.

**Decisions**:

- 6×4 caps. Hard cap is the model's max_tokens budget (8000) and the
  agent's signal-to-noise ratio — generating 9 platforms × 5 languages = 45
  cells per click is wasteful and produces output the agent will never
  read. 6×4 lets the common Bay Area case (Facebook/Instagram/Email/Rednote
  × EN/ZH/ES) fit comfortably with headroom for one more.
- Single round-trip rather than per-cell parallel calls. Cost and consistency
  win — same listing facts in the same prompt → consistent angle across
  cells. Failure mode: one model hiccup loses everything; the rate limit
  bucket charges the same regardless, so retry is cheap.
- Light grounding (text only) per qiaoxux's call. Vision-block per cover
  photo is a 5× token bump for marginal copy quality given that listing
  descriptions usually already encode what's interesting about the
  property.

**Verification**: `npx tsc --noEmit` clean. Manual UI verification pending
after Vercel preview build.

## Phase 47.18 — Drop "Content" title from Media tab (2026-06-22)

**Objective**: qiaoxux — "Rename context title from agent hub media tab" → "remove it". Drop the "Content" `<h2>` from `MediaPanel`.

**Actions**: removed the title `<h2>` and surrounding flex wrapper in `app/dashboard/listings/[id]/edit/MediaPanel.tsx`; kept the helper line. tsc clean.

**Decisions**: tab is already labelled "Media" — the card title was redundant.

## Phase 47.17 — Agent hub Details panel cleanup (2026-06-22)

User asked for a "cleanup" of the listing /edit Details panel — explicitly *"do
not remove any sections or features, just delete hints if the input is
self-explained"*. Plus three concrete additions: units for **Square feet**,
units for **HOA**, and a **Year built** dropdown that also accepts free typing
(same pattern as Beds/Baths).

Changes (all in `app/dashboard/listings/[id]/edit/EditListingForm.tsx`):

- **Hints removed** (every input is self-evident from its label/placeholder):
  - Top legend `* = required to publish` → row collapses to just the
    `<SaveBadge>` aligned right.
  - Bedrooms `0 = studio. Pick 7 or more for larger homes.`
  - Bathrooms `Half baths count as 0.5. Pick more than 5 for custom.`
  - HOA `Leave blank if none.`
  - Community `Links this listing to a shared community for school + POI data…`
  - Description `One paragraph per blank line. Up to 10 paragraphs, English only.`
  - `<SaveBadge>` `idle` state (`"Auto-save on"` pill) → returns `null`. Pill
    only shows for the meaningful states: `pending` / `saving` / `saved` / `error`.
- **Square feet** input: gray `sq ft` suffix inside the right edge of the field
  (`pointer-events-none absolute inset-y-0 right-3`).
- **HOA** input: type changed from free `text` to `number`. Gray `$` prefix on
  the left, gray `/month` suffix on the right. Schema column `listings.hoa`
  stays `text` (legacy callers + buyer-facing renderers untouched). New helpers
  `parseHoaAmount` (read: extract first integer from any stored string like
  `"$120/mo"` or `"None"` → `"120"`) and `composeHoa` (write: `"$<n>/month"`)
  bridge the UI ↔ DB. Old free-text values that have no digit become an empty
  input — agent re-enters once.
- **Year built** input: number input → hybrid select↔custom, mirroring the
  Beds/Baths pattern. Default mode is `<select>` showing current year → 1900
  (reverse chronological) plus a `Type a year…` option that switches to a
  number input with a `Use list` revert button. Initial mode picks `custom`
  if the stored value falls outside 1900..currentYear, else `list`.

Did **not** touch:

- `NewListingForm.tsx` (the create page) — request was scoped to the agent
  hub Details tab.
- Any schema, server action validator, buyer-facing renderer, or autosave
  behavior.
- The `description` field, AI generate button, community dropdown options,
  required-field red `*` markers — only their *hint* text was deleted.

Verification:

- `npx tsc --noEmit` clean.
- Manual UI verification pending after Vercel preview build.

Concerns surfaced before patching:

- `* = required` legend removal: required fields still carry a red `*` next
  to the label — the legend was redundant. Server-side publish errors should
  still name the missing field; if not, follow-up work needed.
- HOA schema mismatch (text vs number) handled by the `parseHoaAmount`/
  `composeHoa` adapter; explicit DEVLOG entry here so the next person doesn't
  silently switch `listings.hoa` to integer and break legacy rows.
- User flagged that eventually these data should be **prepopulated from MLS**.
  That's a separate phase (ATTOM Data Property API is the cheapest first step
  — $0.15-0.30/lookup, no MLS-board approval needed; full RESO Web API
  integration is V2). Not in scope here.

## Phase 47.16 — Media tab: unified upload (B2) (2026-06-21)

User asked to merge the upload UI for photos and videos on the listing /edit
Media tab — *"at end of the day they are just content"*. Picked B2 from the
sign-off prototype (`public/prototype/media-tab-merge-v2.html`): one
**Click to upload** button accepting both `image/*` and `video/*`, files fan
out by MIME after pick. The existing per-video pick→title→tus pipeline and
per-photo Supabase batch pipeline are untouched — only the entry point is
unified.

Changes:

- `app/dashboard/listings/[id]/edit/MediaPanel.tsx` (new) — wrapper panel
  rendering one `<input accept="image/*,video/*" multiple>` button.
  - `image/*` files → forwarded to `PhotoPanel.addFiles()` via imperative
    handle (existing `handleFiles` → Supabase upload + `recordListingPhoto`).
  - `video/*` files → spawn one `<VideoUploader>` instance per file with
    `initialFile` prefilled, so the agent skips the picker but still
    confirms the title before bytes leave the device. On success,
    `VideoPanel.pushUploaded()` registers the row optimistically.
  - Absorbs the `?prefill=<id>` URL handling from
    `PhotoPanelPrefillBridge` and now also routes prefilled video files
    (previously dropped with a `console.warn`).
- `app/dashboard/listings/[id]/edit/PhotoPanel.tsx` —
  `forwardRef<PhotoPanelHandle>` exposes `addFiles`. New `hideUploadButton`
  prop hides the local "Add photos" button when MediaPanel owns the entry.
- `app/dashboard/listings/[id]/edit/VideoPanel.tsx` —
  `forwardRef<VideoPanelHandle>` exposes `pushUploaded`. New `hideUploader`
  prop hides the embedded `<VideoUploader>` when MediaPanel owns the entry.
- `app/dashboard/listings/[id]/edit/page.tsx` — two stacked `<section>`s
  ("Videos" + "Photos") collapse to one `<MediaPanel>`. Inside MediaPanel
  the panels still render as stacked sub-sections "Videos (N)" /
  "Photos (N)" with a hairline separator, so existing reorder/cover/delete
  affordances are untouched.
- `app/dashboard/listings/[id]/edit/PhotoPanelPrefillBridge.tsx` — deleted
  (functionality absorbed by MediaPanel).

Out of scope (deferred until asked): community hub `/dashboard/communities/[id]`
where Videos and Photos are top-level tabs — not merged in this pass.

Verification:

- `npx tsc --noEmit` clean.
- `npx next build` succeeds, no new pages affected.

Pitfalls / things to watch:

- VideoUploader's `initialFile` path is the Phase 45.16 codepath (FAB
  prefill); this is the second consumer. If we ever change that contract
  the unified upload breaks silently — the file would still be rendered
  in the picker UI but the agent has to re-pick.
- Files with non-image/non-video MIME types are skipped with an inline
  notice listing the first three names, instead of failing silently.
- StrictMode double-mount safe: prefill consume is lazy-init, video
  pending-list registration is gated by a ref flag.

## Phase 47.15 — Delete consolidated to Details tab (2026-06-21)

User feedback after 47.11/47.12: on community detail the Delete affordance lived
in the hero ⋯ menu *and* inline in the Details tab — confusing, asymmetric vs
listing detail (which had moved to a bottom DangerZone in 47.12). User asked to
align both: **Delete only inside the Details tab, identical rose DangerZone
block, never on the hero**.

Changes:

- `app/dashboard/listings/[id]/edit/page.tsx` — `<DangerZone>` moved from
  outside `<HubTabs>` into the `details:` panel (wrapped with the form in a
  `space-y-6` flex column). Dropped now-unused `HeroDeleteButton` import.
- `app/dashboard/listings/[id]/edit/DangerZone.tsx` — outer `mx-auto mt-12
  max-w-6xl px-4 pb-16` shell stripped (HubTabs panel already provides the
  6xl/padding container).
- `app/dashboard/communities/[id]/page.tsx` — removed `<CommunityDetailMenu>`
  from the hero `rightOverlay`; `CommunityStatusPill` is the only hero pill
  again.
- `app/dashboard/communities/[id]/CommunityEditor.tsx` — inline `<DangerZone>`
  upgraded to match listing's rose 2xl block (rose-300/60 border, rose-50/40
  bg, rose-600 solid CTA). Same prose, same `confirm()`.

Orphans removed:
- `app/dashboard/listings/[id]/edit/ListingDetailMenu.tsx`
- `app/dashboard/communities/[id]/CommunityDetailMenu.tsx`
- `app/dashboard/_components/HeroDeleteButton.tsx`

Verification: `npx tsc --noEmit` clean.

Result: both detail pages now have one Delete affordance, in the same place
(Details tab, bottom of form), with identical visual weight. Other tabs (Media,
Marketing, Leads, Analytics, Videos, Photos, Cover) no longer carry the Delete
block — it is genuinely tied to "this is the master record for this listing/
community".


## Phase 47.11 — AgentHub mylisting hero polish (2026-06-21)

Agent feedback after Phase 47.10 ship surfaced four UX papercuts:

1. **Dashboard `/dashboard` filter+sort feels two-island'd** → merged into one
   natural row: `Show: [All N] [Active N] [Inactive N] | Sort by: dotted-underline select`.
   Removed the right-aligned bordered pill around the sort; underline-only
   feels lighter and reads as one sentence with the filter chips.
2. **Hero Preview button "not responsive" (looked unclickable)** → kept
   chromeless base but added `border-white/35 bg-white/15 backdrop-blur-md`
   default state + ↗ arrow glyph. Now it visibly invites a click on bright
   covers without losing the chromeless aesthetic.
3. **Active/Inactive popover felt like a 2-step "deactivate" gesture** →
   new `InstantStatusToggle` replaces hero `StatusPill`. Active→Inactive is
   silent and instant (no popover, no "→ deactivate" hint). Inactive→Active
   still surfaces the missing-fields popover when validation fails (that's
   genuinely useful). One click, no chrome.
4. **Delete hidden behind ⋯ menu** → new `HeroDeleteButton` is a visible
   chromeless rose-tinted control on the hero. `confirm()` still gates the
   destructive call. The old `ListingDetailMenu` stays in-tree (used by
   nothing on the hero now) — left for any future overflow needs.
5. **Stats removed from hero** → hero is back to "hero pic". The detailed
   funnel + breakdowns already live in the Analytics tab; the open-leads
   tab badge (`Leads · N`) carries the only number the agent really needs
   at a glance. HeroHeader simplified from 3-section grid (`auto · 1fr · auto`)
   to 2-section (`auto · 1fr`); zero-overlap guarantee preserved.

### Code

- New `app/dashboard/_components/InstantStatusToggle.tsx` (5,620 B) —
  client, calls `publishListing` / `unpublishListing`, uses `flushPending`
  from edit flush-registry, portals validation popover to `document.body`
  to escape stacking contexts (per phase 45.33 lesson).
- New `app/dashboard/_components/HeroDeleteButton.tsx` (1,820 B) — client,
  rose-tinted chromeless variant matching HeroControl pattern.
- `app/dashboard/_components/HeroHeader.tsx` — dropped `stats` prop and
  `HeroStat` type; grid template `auto 1fr auto` → `auto 1fr`. The home
  info column moved from `justify-center` to `justify-end pb-2` so the
  title sits naturally near the bottom of the hero plate.
- `app/dashboard/listings/[id]/edit/page.tsx` — removed the 3-promise
  parallel SSR fetch for views/saves/leads counts. Kept a single
  lightweight leads fetch just to compute `openLeads` for the tab badge.
  Swapped `StatusPill` → `InstantStatusToggle`, `ListingDetailMenu` →
  `HeroDeleteButton`. Preview link now carries explicit visible chrome.
- `app/dashboard/_components/DashboardListingGrid.tsx` — flat single-row
  layout: `Show <chips>  |  Sort by <underlined select>`.

### Verification

- `npx tsc --noEmit` → exit 0
- `npx next build` → success. `/dashboard` 2.23 kB / 98.2 kB,
  `/dashboard/listings/[id]/edit` 28.9 kB / 205 kB (-0.4 kB vs phase 47.10
  thanks to dropped stat-fetch path).

### Pitfalls captured

- Existing helper `flushPending` lives at
  `@/app/dashboard/listings/[id]/edit/flush-registry` — there is no
  `@/lib/forms/pending` module. Wrong import compiles via path alias but
  fails TS resolution.
- After dropping a `HeroHeader` prop, must read **then** rewrite the
  caller block, not just patch the prop line — leftover usage caused TS
  errors until the `stats={...}` line was removed.

### Files changed

- `app/dashboard/_components/HeroHeader.tsx` (modified, simpler)
- `app/dashboard/_components/InstantStatusToggle.tsx` (new)
- `app/dashboard/_components/HeroDeleteButton.tsx` (new)
- `app/dashboard/_components/DashboardListingGrid.tsx` (modified)
- `app/dashboard/listings/[id]/edit/page.tsx` (modified)

`StatusPill.tsx` and `ListingDetailMenu.tsx` remain in-tree but are not
referenced from the hero. Other dashboard surfaces (community detail
hub) still use `StatusPill` via its `variant="community"` path.

---

## Phase 47.5–47.10 — AgentHub mylisting redesign (2026-06-21)

Owner ask: "关于agenthub里的mylisting 的子页面们 你有什么建议吗 增加或改动或布局".
Iterated 6 HTML prototypes (`public/prototype/agenthub-mylisting{,-v2…v6}.html`)
to lock visual + interaction direction, then shipped the full redesign in
one batch: hero rebuilt as a 3-section CSS grid, sub-tabs reorganised to
5 tabs, Analytics inlined, per-listing Leads tab added, and the dashboard
grid gained filter chips + sort.

**Hero (Phase 47.5).** New `app/dashboard/_components/HeroHeader.tsx` —
CSS grid `auto · 1fr · auto` with three explicit rows: §1 right-aligned
controls, §2 left-aligned title/subtitle filling the middle, §3 three
frosted-glass stat tiles (Views / Saves / Leads + delta). No
`position:absolute` anywhere — physical separation, zero overlap risk on
arbitrary-length addresses (we tested with "1247 Peachtree Ridge Manor
Crossing Lane" in the prototype). Companion `HeroControl.tsx` provides
the chromeless button: transparent + text-shadow at rest, frosted-glass
surface on hover (160ms transition, scale(0.97) on active), focus ring
on `focus-visible`.

**5 tabs (Phase 47.6).** Order: `Details · Media · Marketing · Leads ·
Analytics`. Marketing replaces the old Social + Tour tabs — sibling tab
count down from 6 to 5 to keep mobile from horizontally scrolling. The
Leads tab label appends `· N` when there are unfollowed-up leads, so
the agent sees actionable count without opening the tab.

**Marketing merge (Phase 47.6).** New
`app/dashboard/listings/[id]/edit/MarketingPanel.tsx` — pill sub-tabs
(Social copy / Home tour script) over plain `useState`, no URL
persistence. Hosts the existing `SocialCopyPanel` and `GenerateTourPanel`
unchanged; the merge is purely a routing/structural change.

**Per-listing Leads (Phase 47.7).** New
`app/dashboard/listings/[id]/edit/ListingLeadsPanel.tsx` — server
component that selects from `public.leads` filtered by `listing_id`
(RLS already gates to agent-owned listings). Renders a compact list with
the same mailto/sms affordances as the global `/dashboard/leads` inbox,
plus a "See all leads →" backlink. Empty state copy:
"No leads on this listing yet. Leads from the public listing page will
appear here in real time." — uses the listing context to set agent
expectation. No realtime subscription here; per-page-view freshness is
fine for the inline tab. If we need it later, swap to `LeadsLive` with
a `listing_id` filter.

**Analytics inline + redirect (Phase 47.8).** New
`app/dashboard/listings/[id]/edit/AnalyticsPanel.tsx` — lifted from the
old standalone `app/dashboard/listings/[id]/analytics/page.tsx`. Same
data shape (Stat tiles + Funnel + TopCards) but now scoped to a tab; the
crumbs / H1 are dropped because the hero already shows them. The old
route now `permanentRedirect`s to `/dashboard/listings/[id]/edit?tab=analytics`
so existing bookmarks survive. Replaced `from-gold/80 to-gold/40` funnel
gradient with `from-ink/40 to-ink/20` to match the burgundy-free Aman
direction (the gold alias still resolves to ink, but explicit is clearer).

**Hero stats SSR (Phase 47.5).** Edit page now runs three count queries
in parallel after the listing fetch:
- `events` count where `event_type='page_view'` (Views)
- `saved_listings` count by `listing_id` (Saves)
- `leads` count + `followed_up_at` rows (Leads + open delta)
Three counts hit different tables with `head: true` on the first two;
leads needs the rows to compute the open count (no `is null` count
shortcut on the supabase-js client we use). Total cost: 3 round-trips,
well under the page's existing video/photo/community fetches.

**Dashboard grid (Phase 47.10).** New
`app/dashboard/_components/DashboardListingGrid.tsx` — client wrapper
around the existing `ListingGrid`. Adds filter chips (All / Active /
Inactive with inline counts) and a sort dropdown (Recently updated /
Newest / Most viewed). Filtering and sorting are pure client-side over
the SSR-hydrated rows — agent portfolios are bounded enough that we
don't need server pagination. View counts are aggregated in one
`events.select('listing_id').in('listing_id', ids)` query, then folded
into a Map in JS.

**Files created** (8): `HeroHeader.tsx`, `HeroControl.tsx`,
`DashboardListingGrid.tsx`, `MarketingPanel.tsx`, `ListingLeadsPanel.tsx`,
`AnalyticsPanel.tsx`. **Modified** (3): `app/dashboard/page.tsx`,
`app/dashboard/listings/[id]/edit/page.tsx`,
`app/dashboard/listings/[id]/analytics/page.tsx`.

**Verification.** `npx tsc --noEmit` clean; `npx next build` succeeded
(edit page first-load JS 29.3 kB / 206 kB total, dashboard grid 2.23 kB /
98.2 kB total).

**Process note.** Plan was 6 phases originally laid out as
`Phase A: hero → B: 5-tab → C: marketing → D: leads → E: redirect →
F: dashboard grid`. Per the memory pattern about the 50-call subagent
cap, this phase was mechanical (8 file creates + 3 modifies, ~12 patches
total, no nontrivial reasoning), so the parent agent handled it directly
in ~22 tool calls. No subagent dispatch needed.

## Phase 47.4 — Portfolio internal rhythm (2026-06-21)

Owner feedback after Phase 47.3 ship: "可以放大一点 并且同一个页面内各处间距尽量保持一致 这里是 agent profile 不需要和 grid view 里的设置一样 但是自己页面内要协调."

The dense feed grid (3/4 aspect, 8px inset, 15px price, 11px sub) is correct
for `/browse` and friends because cards are small. The portfolio's 4:5 cards
are much larger, so the same overlay sizes felt visually under-weighted, and
the page mixed several spacing scales (`pt-16 pb-10 md:pt-24 md:pb-14`,
`mb-10`, `mb-12`, `gap-x-8 gap-y-14`, `py-10`) that didn't read as one
coherent surface.

Changes:
- `app/_components/GridCard.tsx`: added optional `captionInsetClass` prop
  (default `inset-x-2 bottom-2` — every other grid is unaffected).
- `app/(public)/a/[agentSlug]/page.tsx`:
  - Hero & listings sections unified to `py-20 md:py-28`.
  - Headers `mb-8`, hero flex `gap-8`, grid `gap-8` (square rhythm — was
    `gap-x-8 gap-y-14`), bio `mt-8`, footer `py-8`.
  - Card overlay inset `inset-x-2 bottom-2` → `inset-x-5 bottom-5` (20px).
  - Card caption: price `text-[15px]` → `font-serif text-[22px] md:text-[26px]`
    (serif to echo the page's `display-md` heading); sub-lines `text-[11px]`
    → `text-[13px] md:text-[14px]`.
  - Replaced shared `GridCardCaption` with inline custom caption so the
    portfolio can carry its own typography without affecting feed cards.

Result: `/a/[agentSlug]` reads on a single 8px spacing scale with overlay
text sized in proportion to its larger image. `/browse`, `/communities`,
`/dashboard`, `/saved`, `/search`, `/nearby`, `/c/[slug]` unchanged.

Files: 2 modified.
Verification: tsc clean, biome clean (1 auto-fixed), next build success.

## 2026-06-21 — Phase 47.3: portfolio text format unified

**Objective**: qiaoxux follow-up after phase47.2 — agent portfolio
page (`/a/[agentSlug]`) keeps its editorial 1/2/3-column 4:5 layout
with wide gaps (different visual family from feed grids), but the
card text format + placement should match every other grid: price /
specs / address overlaid on the bottom-left of the image with the
shared font, size, and gradient.

**Approach**:
- Added optional `aspectClass` prop to `GridCard` (default
  `aspect-[3/4]`) so portfolio cards can pass `aspect-[4/5]` while
  still using the shared overlay caption + gradient + hover.
- Replaced inline `ListingCardView` markup in
  `app/(public)/a/[agentSlug]/page.tsx` with `<GridCard>` +
  `<GridCardCaption>` + `<GridCardBadgeDark>` (for the Stock pill).
- Removed the "No. 01" eyebrow + "City, State" tracked-caps pair
  and the post-image text block — text now reads price → specs →
  address as an overlay on the cover image, identical to every
  other grid surface.

**Verification**: tsc 0, biome clean, next build success.
## 2026-06-21 — Phase 47.2: unify all remaining grid surfaces + flush gutters

**Objective**: qiaoxux follow-up after phase47.1 — (a) make the page's
left/right padding equal to the inter-card gap so the visual rhythm
matches all the way to the screen edge; (b) extend the unified grid
(GridPageShell + GridFrame + GridCard / ListingGrid / CommunityGrid)
to *every* page that renders a card grid, not just the four already
done in phase47.

**Surfaces unified in this pass**:
- `/saved` (SavedClient — buyer favorites, listings + communities)
- `/search` (site-wide search results — listings + communities)
- `/nearby` (geolocation feed; distance pill now routes through
  `ListingGridItem.distanceMi` → `GridCard topLeft`)
- `/c/[slug]` (community detail; both VideosGrid and ListingsGrid
  rebuilt on top of GridFrame + GridCard / ListingGrid)
- 5 corresponding `loading.tsx` skeletons

**Gutter alignment**: GridPageShell padding changed from
`px-3 sm:px-6` to `px-1 md:px-1.5` — i.e. exactly the gap value.
The whole grid now reads as a continuous rhythm of equal whitespace
from edge to edge with no special margin around the page.

**API extension**: `ListingGridItem` gained an optional `distanceMi`
field; `ListingGrid` renders it as a top-left dark badge so /nearby
no longer needs its own card markup.

**Decisions**:
- `app/(public)/a/[agentSlug]` (agent portfolio page) intentionally
  left alone — it uses an editorial 1/2/3-column layout with large
  gaps and a different card design; that's a separate visual family,
  not a feed/search/list grid. Will revisit if owner asks.
- Inline `formatPrice` and `ListingCard` helpers deleted from
  /search and /nearby; price formatting lives in GridCardPrice.

**Verification**:
- `npx tsc --noEmit` → 0 errors
- `npx biome check` → clean
- `npx next build` → success, all routes built
- Manual: every grid page now shares the same px-1 md:px-1.5
  outer padding, gap-1 md:gap-1.5 inter-card gutters, aspect-[3/4]
  cards, and identical caption / badge typography.

**Files changed**: 11 (1 modified primitive + 4 page refactors +
5 loading skeletons + 1 ListingGrid extension).

## 2026-06-21 — Phase 47.1: equal grid gaps

**Objective**: qiaoxux follow-up — wanted horizontal + vertical gaps in
the grid to be the same (the phase45.26 density used `gap-x-1 gap-y-2`,
which made cards read as horizontal stripes rather than a uniform mesh).

**Change**: `app/_components/GridFrame.tsx` — `gap-x-1 gap-y-2
md:gap-x-1.5 md:gap-y-3` → `gap-1 md:gap-1.5`. One line, lands across
all four grid pages (`/browse`, `/communities`, `/dashboard`,
`/dashboard/communities`) because they all share `<GridFrame>` from
phase 47.

**Verification**: tsc clean, biome clean (after auto-format).

## 2026-06-21 — Phase 47: shared grid primitives (GridPageShell / GridCard)

**Objective**: qiaoxux flagged that the My Listings + My Communities grids
"looked different" from the buyer-side For You + Communities grids. Asked
to unify them and refactor so the same change wouldn't have to be made in
two places again.

**Root cause**: container chrome was authored 4 different ways. `/browse`
and `/communities` used `mx-auto max-w-6xl px-3 pb-6 sm:px-6`, while
`dashboard/layout.tsx` wrapped its children in `mx-auto max-w-6xl px-6 py-8`
(no `px-3`, extra `py-8`), and `/dashboard/communities` doubled up
(layout's px-6 + page's own px-3 sm:px-6). On top of that the listing-card
markup was duplicated between `/browse/page.tsx` and
`app/dashboard/_components/ListingsTabbedList.tsx`.

**Changes**:
- New `app/_components/GridPageShell.tsx` — single source of truth for the
  grid-page horizontal padding + max width.
- New `app/_components/GridFrame.tsx` — single source of truth for the
  2/4-up grid wrapper (cols + gaps).
- New `app/_components/GridCard.tsx` — slot-based 3:4 cover card with
  helpers `GridCardCaption`, `GridCardBadgeDark`, `GridCardBadgeLight`.
  Caller supplies cover URL, fallback, optional top-left/top-right badges,
  caption, and a `dimmed` flag.
- New `app/_components/ListingGrid.tsx` — buyer-facing listing grid
  mapper. Takes a normalized `ListingGridItem[]` (id/href/cover/price/
  beds/baths/sqft/address/badge/dimmed); composes GridCard + GridFrame.
- Refactored `app/_components/CommunityGrid.tsx` on top of GridCard so
  community + listing grids share frame, aspect, hover, gradient.
- `app/(public)/browse/page.tsx` — collapsed inline grid markup into a
  short mapper that calls `<GridPageShell><ListingGrid items={…} /></…>`.
- `app/dashboard/page.tsx` (My Listings) — same pattern. Inactive
  listings render with `dimmed` + a light `Inactive` badge.
- `app/(public)/communities/page.tsx` and `app/dashboard/communities/page.tsx`
  — wrap CommunityGrid in `<GridPageShell>`; dashboard variant passes a
  custom `hrefBuilder` to send agents to their editor.
- Deleted `app/dashboard/_components/ListingsTabbedList.tsx` (logic
  absorbed into the page above).
- `app/dashboard/layout.tsx` — dropped the `mx-auto max-w-6xl px-6 py-8`
  inner `<main>` wrapper. Each child page now owns its own container.
  The outer `<main>` keeps `pb-24 md:pb-8` so the mobile BottomNav
  doesn't overlap content.
- Added `px-4 sm:px-6` to the form/detail pages that previously relied
  on the dashboard layout's chrome (`listings/new`, `communities/new`,
  `listings/[id]/edit` empty state, `communities/[id]` empty state,
  `communities/[id]/upload`).
- Updated the explanatory comment in `listings/[id]/preview/page.tsx`
  (the file uses `fixed inset-0` so the dashboard chrome change doesn't
  affect it; comment was lying about the why).

**Decisions**:
- *Why a slot-based GridCard instead of two near-identical grids?* The
  card frame (column rules, aspect 3:4, bg-surface, hover scale, bottom
  gradient, caption typography, badge corner pinning) was 100% identical
  between listings and communities. Only the data fields differed. Slot
  composition costs one layer of indirection but means a designer can
  retune the cover hover or the caption type ramp in one file.
- *Why keep two mappers (`ListingGrid`, `CommunityGrid`) instead of
  letting pages call `<GridCard>` directly?* Type-safety on the page side.
  Pages pass a normalized item array; mappers handle field formatting
  (price, ½-bath, distance pill, "Inactive" badge). Future divergence
  (e.g. community gets a video count, listing gets a mini map) only
  touches the mapper, not the pages.
- *Why drop the dashboard layout's `<main>` chrome rather than make the
  buyer-side grids match it?* The dashboard chrome was the outlier
  (px-6 not px-3, extra py-8). Moving padding ownership to each page
  also means form pages and grid pages can have different paddings without
  fighting the layout.

**Verification**: `tsc --noEmit` clean, `biome check` clean on all 10
touched files, `next build` succeeded with all four grid routes
present (`/browse`, `/communities`, `/dashboard`, `/dashboard/communities`).
Pre-existing test failures in `lib/analytics/__tests__/listing-stats.test.ts`
and `app/api/.../route.test.ts` are unrelated (verified via stash + rerun
on main: same 2 failed / 41 passed).

**Files touched**: 4 new (`GridPageShell.tsx`, `GridFrame.tsx`,
`GridCard.tsx`, `ListingGrid.tsx`) + 1 rewrite (`CommunityGrid.tsx`) +
4 grid page rewrites + 1 layout rewrite + 5 form/detail page padding
patches + 1 deletion (`ListingsTabbedList.tsx`).

**Next steps**: push branch, verify Vercel preview, ask qiaoxux to
side-by-side `/browse` vs `/dashboard` and `/communities` vs
`/dashboard/communities` on the preview before merging to main.

## 2026-06-21 — Phase 46 follow-up: inline Photos tab + buyer-side active gating

**Objective**: qiaoxux follow-up after phase46 merge — (1) inline the
community Photos panel inside the new HubDetailShell instead of linking
out to /upload, (2) buyer surfaces only show `status='active'` communities.

**Changes**:
- `app/dashboard/communities/[id]/CommunityPhotosTab.tsx` — new client
  wrapper: CategoryPicker + CommunityPhotoPanel, mirroring the photo
  half of /upload (same shared category drives uploads).
- `app/dashboard/communities/[id]/page.tsx` — load `community_photos`
  rows + sign URLs server-side (same loader path as /upload), pass to
  CommunityPhotosTab. Photos tab is now in-place editable.
- `lib/communities/list.ts` — `fetchCommunityListCards()` now takes
  `{ includeInactive?: boolean }`. Default false (buyer surfaces:
  /communities, /browse?tab=communities). Dashboard's
  /dashboard/communities passes `includeInactive: true` so the agent
  can still see and reactivate her own inactive communities.
- `lib/feed/browse-cards.ts` — both community fetches gate
  `status='active'`: the listing-feed slug lookup
  (fetchBrowseCardsForCommunity) and the inline community-sheet hydration.
- `app/(public)/c/[slug]/page.tsx` — selects `status` and `notFound()`
  on non-active. Inactive communities now 404 for buyers; the creating
  agent still sees them in /dashboard/communities.

Build green; tsc clean.

## 2026-06-21 — Phase 46: agent hub rebuild (HubDetailShell + status simplification)

**Objective**: qiaoxux —「let's rebuild the agent hub now」, two acceptance criteria:
1. My-listings & my-communities reuse the same buyer-facing grid (kill the
   empty-spaces gripe on /dashboard).
2. Click → unified detail shell: hero cover with status pill top-right,
   sticky sub-tabs underneath, inline switching, auto-saved edits.

Plus a status-model simplification: collapse listing's `draft|published|archived`
three-state into Active/Inactive only. Communities gain the same two-state
field. No more PublishPanel block, no more separate publish/archive flows.

**Schema migration (0030_simplify_status.sql)**:
- `listings.status`: backfill `published → active`, `draft|archived → inactive`,
  rewrite check constraint to `('active','inactive')`, default `'inactive'`.
- `communities.status`: new column added, default `'active'`, all existing
  rows backfilled. Buyer-facing RLS unchanged this phase (full visibility
  preserved; future phase can gate `/c/<slug>` on status if owner asks).
- Applied to remote DB via `supabase db push --include-all`.

**Status literal collapse across app/lib (18 files)**:
- `lib/zod/schemas.ts` ListingStatus enum simplified.
- `publish-actions.ts`: `publishListing()` activates, `unpublishListing()`
  deactivates. Names preserved for stable imports.
- `archive-actions.ts`: archive helpers gone — only `deleteListing()` /
  `deleteListingAndRedirect()` remain.
- All buyer-facing reads (browse-cards, communities/list, listing-feed,
  saved-listings, leads/route, search, agent profile, community feed,
  buyer/likes) gate on `status='active'`.
- New listings default to `'inactive'`.
- PublishPanel.tsx deleted (dead after detail-page rebuild).

**New shared components**:
- `app/dashboard/_components/HubDetailShell.tsx` — server component.
  Hero (`max-w-6xl aspect-[5/2] md:aspect-[5/1] sm:rounded-b-xl`, matches
  the canonical community public-page hero from phase 45.28) with optional
  title/subtitle gradient and right-overlay slot. Renders `<HubTabs />`
  underneath.
- `app/dashboard/_components/HubTabs.tsx` — client island. Sticky pill row;
  tab switch is `router.replace('?tab=...', { scroll: false })` so
  there's no server nav and no scroll jump. Active tab shows underline.
- `app/dashboard/_components/StatusPill.tsx` — generic Active/Inactive
  toggle. For listings calls publishListing/unpublishListing; for
  communities takes a `setCommunityStatus` action prop. Calls
  `flushPending()` before activate so EditListingForm debounce can't
  spuriously fail the publish gate. Error popover portalled to
  `document.body` (stacking-context guard, per phase 45.33 lesson).
- `ListingDetailMenu.tsx` / `CommunityDetailMenu.tsx` — three-dot
  overflow with Delete only. Menu sheet portalled to body for the same
  z-40 reason.

**Listing detail rebuild (`/dashboard/listings/[id]/edit`)**:
- Old: long-scroll page with header → PublishPanel → Details → Videos →
  Photos → Social → Tour. Six fully-rendered sections + a status panel
  taking up vertical real estate.
- New: HubDetailShell hero with cover (cover_url → first ready video
  thumb → first photo URL fallback), StatusPill + ⋮ menu top-right.
  Sticky tabs: Details · Media · Social · Tour. Media tab merges Videos
  and Photos panels stacked vertically (no sub-sub-tab — phase 46 design
  decision: less friction beats finer granularity).

**Community detail rebuild (`/dashboard/communities/[id]`)**:
- Same shell. Hero uses the public page's cover-resolution helper
  (`resolveCommunityCoverWithCfIds` + `demoCoverFor`) so the dashboard
  hero exactly matches what the buyer sees on `/c/<slug>`.
- Tabs: Details · Videos · Photos · Cover (Cover only for the creating
  agent). Defaults to Videos because that's why agents come here.
- StatusPill + ⋮ menu only render for the creating agent. Non-creators
  see a read-only Details panel explaining the metadata is owned, but
  can still manage their own videos/photos.
- New `status-actions.ts`: `setCommunityStatus()` and
  `deleteCommunityAction()` server actions, both gated to creator.

**Grid parity with buyer-facing surfaces**:
- `/dashboard` (my listings): removed `max-w-6xl px-3 sm:px-6 py-6 sm:py-8`
  wrapper; `ListingsTabbedList` gutted from 322 → 130 lines (status tabs
  and list view dropped). Single grid matches `/browse`:
  `grid-cols-2 gap-x-1 gap-y-2 md:grid-cols-4 md:gap-x-1.5 md:gap-y-3`,
  `aspect-[3/4]` cards, bottom-gradient overlay, opacity-60 + small
  "Inactive" pill on inactive cards.
- `/dashboard/communities`: already used `CommunityGrid`; just dropped
  the extra `py-*` padding to match `/communities` (`pb-6`).

**Verification**:
- `npx tsc --noEmit` — clean.
- `npx next build` — green; new dashboard listing detail bundle
  26.3kB (was ~12kB pre-46 because we now ship StatusPill/HubTabs
  client-side, but old PublishPanel was bigger).
- Migration applied to remote DB; `supabase migration list --linked`
  shows 0030 present.

**Pitfalls navigated**:
- `flushPending()` before activate — per existing EditListingForm
  contract; without it a fresh price typed seconds ago gets eaten by
  the publish gate.
- StatusPill error popover and detail menus portalled to body. Anything
  rendered inside the hero header sits in BottomNav's z-40 stacking
  context on mobile — without portal escape the menu/popover would be
  capped under feed cards. (Phase 45.33 lesson, codified in
  `references/stacking-context-modal-portal.md`.)
- New listings default to `inactive` — back-compat callers that read
  status===`'published'` were already migrated by 46.2's mechanical
  pass.

## 2026-06-21 — Phase 45.33: fix scrim z-index escape + redesign source picker

**Objective**: qiaoxux 测试 45.32 实装后报两个 bug:
1. 「点击别的地方并没有取消 sheet,并且打开了另一个窗口」— 点 listing
   card 区域的「取消」实际触发了卡片导航
2. 上一版 sheet 视觉太平,4 个白矩形(被 45.32 收敛到 3 个但仍是平按钮)

**Root cause**: `UploadSheet` 的 portal JSX 渲染在 `<UploadFAB>` 内部,而
`<UploadFAB>` 嵌在 `<BottomNav>`(`fixed z-40`)里。`fixed` + `z-index` 会
创建新的 stacking context,所以 sheet 自己的 `z-50` 只在 BottomNav 这个 z-40
盒子内部生效,**全局上整个 sheet 被封顶在 z-40 层**。页面上的 listing card
(在 BottomNav 的 stacking context 之外)即使是 z-auto 也排在 sheet 之上,
点击事件实际命中卡片本身,不是 scrim button。

**Actions**:
- `app/_components/UploadSheet.tsx`:
  - 改用 `createPortal(sheetUI, document.body)` 把 sheet 渲染到 body,
    彻底逃出 BottomNav 的 stacking context。Hidden file inputs 留在原
    组件树(refs 必须共享同一 React tree)。
  - SSR-safe:`useEffect` mount flag + `mounted ?? null` 守门,避免
    `document is undefined` 的 server render 报错。
  - 提升 z-index 到 `z-[80]`(超过现有 LeadModal 的 z-[70]),给上传流
    一个全局最高优先级。
  - Source picker 视觉重做:从 3 行平按钮换成 2 个 icon tile(Album /
    Camera),inline SVG icon + label + hint。删除 Cancel 按钮,改成底
    部 hint「Tap outside to cancel」+ 加深 scrim(`bg-ink/50` + 弱
    blur)+ 入场动画(fade-in scrim + slide-in-from-bottom sheet)。
  - Type-picker(第二步)保留 Listing/Community 两行 + 同样的 hint。

**Decisions**:
- 不改 BottomNav 的 z-40 自己 — 那会影响 sticky/safe-area 行为。Portal
  逃逸是更隔离的修法。
- 不用 `event.stopPropagation` 拦底层卡片 click:scrim 是 `<button>`,
  click event 的 target 就是 button 本身,不存在「穿透」语义,问题
  纯粹是 stacking context 把 scrim 物理排到了卡片之后。修 z-index/
  portal 才是根因修复。

**Verification**:
- `npx tsc --noEmit` clean
- `npm run build` green
- 待 qiaoxux 手机端验证:点击外部 → 只关 sheet,不进卡片;sheet
  视觉是否顺眼

## 2026-06-21 — Phase 45.32: revert fan, simplify to album/camera/cancel

**Objective**: qiaoxux 看完 fan-out 实装后改主意 — "改成之前的 sheet 只
留 Choose from album and Camera and Cancel, 并且点击别的区域会取消,
注意,只是取消但是不会进入别的界面". Two requirements:
1. 退回 bottom sheet 形态(扇形不要)
2. 选项收敛成 3 个:Album / Camera / Cancel(Photo+Video 合并成 Camera)
3. 点击 sheet 外区域只关 sheet,不能触发底层 listing/video 元素

**Actions**:
- `app/_components/UploadSheet.tsx` 重写回 sheet 形态。`open` 重新变成
  `() => void`(扇形 mode 参数移除)。Source picker 3 行:
  `Choose from album` / `Camera` / `Cancel`。
- Photo + Video 合并成 Camera:相机 input 改为 `accept="image/*,video/*"
  capture="environment"`,iOS Safari 在打开相机时让用户选拍照或录像,
  减一个分支。
- `UploadFAB.tsx` / `DesktopSidebar.tsx` 把 `onClick={() => open('xxx')}`
  改回 `onClick={open}`。
- Scrim 行为没变:`<button type="button" onClick={close}>` 全屏 z-50,
  DOM click event 不会穿透到底层元素 — 用户的"点视频不开视频"需求
  已经被原结构满足,不需要额外的 stopPropagation。

**Decisions**:
- Photo + Video → Camera:用户原话只列了 album 和 camera 两个 source,
  说明她要的就是 2 选 1。把 capture input 的 accept 同时收 image+video
  最贴近她的语言。
- 没把扇形 prototype/v2 文件删除 — `public/prototype/` 是 throwaway
  目录,留作历史快照(future "为啥当时没用扇形" 的查询)。
- LSP 报 phantom error 因为缓存了旧 union type;实际 tsc 通过,build
  绿。

**Issues**: 无。Build first try green.

**Verification**: `npm run build` green. Push to main 后人肉验证手机
端 sheet 渲染 + 点击外部不触发底层。

## 2026-06-21 — Phase 45.31: upload source-picker — fan-out radial menu

**Objective**: qiaoxux complaint — the existing 4-button vertical sheet
(Choose from album / Video / Photo / Cancel) "太难看了 而且必须点 Cancel
才能取消". Two issues: visually flat (4 identical rectangles), and the
backdrop tap-to-close worked but had no visual hint so users felt
trapped into hitting Cancel.

**Actions**:
- Wrote `public/prototype/upload-sheet.html` (Current vs A/B/C — iOS
  grouped / icon grid / inline pillbar). User: 都不好.
- Wrote `public/prototype/upload-sheet-v2.html` (3 fan-spread angles:
  180° / 120° / 160° upward arcs). User picked **C** (160° wide upward).
- Reworked `app/_components/UploadSheet.tsx`:
  - Added `open(mode: 'fan' | 'sheet')` parameter.
  - `'fan'` mode renders 3 satellite buttons (Album / Photo / Video)
    fanning out from the FAB at angles 160° / 90° / 20° (offsets
    `(-99,-36)`, `(0,-105)`, `(99,-36)`). Center FAB rotates to ✕ —
    tap ✕ OR scrim closes. No more Cancel row.
  - Stagger animation: each satellite 220ms cubic-bezier ease-out with
    0/60/120ms delays.
  - `'sheet'` mode keeps the original bottom-sheet for desktop sidebar
    "+ New" (no FAB to fan around) and for the type-picker confirmation
    step (Listing / Community after files chosen — a confirmation flow
    with metadata, not suited for radial layout).
- `app/_components/UploadFAB.tsx` — call `open('fan')`.
- `app/_components/DesktopSidebar.tsx` — call `open('sheet')`.

**Decisions**:
- Type-picker stays as bottom sheet, not fan. Reason: it shows
  "N files selected" metadata and is a confirmation step. Fan is for
  source choice (3 equal-weight branches). Mixing layouts per step is
  fine; reuse forces a worse fit.
- Desktop sidebar keeps sheet. Fan-around-FAB pattern doesn't translate
  to a sidebar button.
- Animation uses cubic-bezier(0.34, 1.4, 0.5, 1) for a tiny overshoot
  ("pop" feel) — matches the playful spirit of fan menus.

**Issues**: TypeScript caught two stale `onClick={open}` callsites
(UploadFAB + DesktopSidebar) — handler signature changed from `() =>
void` to `(mode?: 'fan' | 'sheet') => void`, React mouse event signature
incompatible. Fixed with arrow wrappers.

**Verification**: `npm run build` green first try after type fixes.
Will verify Vercel preview before claiming shipped.

**Next steps**: deploy + visual check on phone (Vivian / qiaoxux).
Possible follow-up: swipe-to-dismiss the satellites individually, or
subtle haptic feedback on iOS.

## 2026-06-21 — Phase 45.30: dot + icon + text chip, dropped to 25vh

**Objective**: qiaoxux follow-up on 45.29 — banner cut-edge was too
sharp; final form should be **status-dot + emoji + text** in a soft
squircle (10px radius — "rounded but not too rounded"), and moved
**down to ~1/4 of viewport height** to breathe away from the top
search/title chrome.

**Changes** (both surfaces, identical pattern):
- Position: `top-16` → `top: 25vh` (≈ 25% down the screen).
- Shape: `rounded-md` + clip-path banner-cut → `rounded-[10px]` plain
  squircle. Drops the diagonal cut entirely.
- Prepended a 6px emerald status dot (`bg-emerald-400` + soft glow
  via boxShadow) before the existing emoji + text — reads as a "live
  / active" indicator, gives the chip a wayfinding feel without extra
  text weight.
- Sibling 45.28.6 hero CTA pass landed on these files concurrently
  (sibling subagent `20260621_080328_d88a62`) — re-read before
  patching to avoid stomping each other.

Files: `app/(public)/c/[slug]/feed/CommunityVideoFeed.tsx`,
`app/(public)/browse/_components/BrowseFeed.tsx`.

## 2026-06-21 — Phase 45.29: top-left "Live here" banner-cut chip (shape #3)

**Objective**: qiaoxux flagged the top-left community pill on the
community video feed reads chip-y and breaks immersion against the
right-rail circular icons (Like / Save / Contact). Round pill +
round icons = no contrast, but switching the pill to a hard rectangle
felt too abrupt. Wanted a shape that asserts itself differently from
the surrounding chrome without shouting.

**Decision**: ran a 6-shape prototype shootout in
`public/prototype/community-pill-v4.html` (squircle-10, asymmetric tag,
banner cut-edge, half-pill bleeding off-screen, underline-only,
squircle-14 + status dot). qiaoxux picked **shape #3 — banner with
right-side cut-edge** (clip-path polygon, arrow-tip on the right,
6px corner radius). Reads editorial / wayfinding rather than UI chip,
and the diagonal cut visually keys against round icon buttons without
collision.

**Surfaces unified** (same shape on both, only text changes):
- `app/(public)/c/[slug]/feed/CommunityVideoFeed.tsx`: "🏠 N homes
  here ›" → "🏠 Live here" (banner cut, no chevron, no border).
- `app/(public)/browse/_components/BrowseFeed.tsx`: dual-line
  community chip with video count → single-line community name only,
  banner cut applied.

**Material kept**: `bg-ink/65 backdrop-blur-md`, removed the cream
border (was reading as a label outline against the new shape).
Middle title pill (community name · city) and back/share buttons
not touched per scope.

**Prototype lineage**: v1 glass material → v2 rect (rejected: too
square) → v3 immersive title pill (mis-scoped, owner clarified left
button is separate) → v4 shape shootout → shape #3 wins.

## 2026-06-21 — Phase 45.28: community hero immersion pass

**Objective**: qiaoxux owner pass on `/c/[slug]` — reduce friction, make
the page feel as immersive as possible. Three asks: (1) shrink hero
height further, (2) drop the [Community Videos | Active Listings] pill
toggle row since videos are the default, (3) move the active-listings
entry point into the hero itself, bottom-right, renamed from "Active
Listings" to a softer "see homes here…"-style CTA. Owner picked
**"Live here →"** from a 10-option shortlist.
**Actions**:
- New client island `app/(public)/c/[slug]/_components/CommunityBody.tsx`
  takes ownership of both the hero and the body grid (so the CTA can sit
  absolute inside the hero and drive the videos↔listings tab state
  without a route round-trip). Old `CommunityTabs.tsx` deleted.
- Hero aspect: `aspect-[16/7] md:aspect-[21/5]` → `aspect-[5/2]
  md:aspect-[5/1]` (~9% shorter mobile, ~16% shorter desktop).
- Pill toggle row removed. Videos render by default; the grid now butts
  directly against the hero's bottom edge.
- CTA pill `Live here →` placed `absolute right-3 bottom-3 sm:right-4
  sm:bottom-4`, cream background / ink text / shadow-md, only visible
  on the videos tab. Switching to listings hides the CTA and reveals a
  lightweight `← Community videos` text link above the listings grid as
  the return path.
- `page.tsx` reduced to data fetching + prop forwarding (computes
  `heroCoverUrl` once on the server with `demoCoverFor`, passes the
  resolved string in to the client island so we don't ship the
  `resolveCommunityCoverWithCfIds` machinery to the browser).
**Decisions**:
- Considered keeping the hero in `page.tsx` and hosting only the CTA
  inside a tiny client island, but the CTA needs to mutate the same
  state that drives the body's videos/listings switch — splitting the
  hero from that state would force either a URL param round-trip or
  cross-island state plumbing. Folding the hero into the same client
  component is the surgical option.
- "Live here" picked over "See homes here →" / data-driven "N homes
  available →" — the double meaning ("reside here" + "active/live
  listings") fit the immersive-not-utilitarian framing the owner asked
  for, and 4 chars stays out of the way of the hero text on the left.
- Kept `← Community videos` as a plain text link, not a pill — once the
  user has flipped to listings, a second pill in the same place as the
  CTA they just clicked would feel like a tab strip we just deleted.
**Issues / Resolution**: None. tsc clean on first try.
**Learnings**: When a CTA's job is to drive state that lives inside a
sibling component, the cheapest fix is usually to merge the two into
one client island — not to invent a state-sharing layer. The
`page.tsx` stays as a thin server wrapper that just gathers data.
**Next steps**: qiaoxux verifies on Vercel preview. If the CTA's
contrast feels off against light hero photos, drop to ink/cream
inversion or add a stronger backdrop-blur ring.

## 2026-06-21 — Phase 45.27.1: nearby geolocation diagnostics + retry

**Objective**: qiaoxux clicked "Enable location" in the soft prompt and
still landed on the "Enable location access in your browser…" empty
state. Need to (a) figure out *why* — was it timeout, hard deny, or
sticky-deny from a prior test session? — and (b) give a retry path so
the user isn't stuck.
**Actions**: `app/(public)/nearby/NearbyClient.tsx` —
- Added `geoError` state holding `denied | timeout | unavailable | unsupported | unknown`.
- `getCurrentPosition` error handler now reads `err.code` (1/2/3) and
  records the reason instead of dropping it.
- Bumped timeout 8s → 30s, added `maximumAge: 60_000` so a recent fix
  is reused inside a minute (avoids a second permission round-trip
  during dev iteration).
- Empty state now branches per reason: hard `denied` tells the user to
  open lock-icon site settings (no Try again button — browser permission
  is sticky and re-firing `getCurrentPosition` does nothing); `timeout`
  / `unavailable` / `unknown` get a Try again button that re-fires the
  request from a user gesture.
**Decisions**: Did not switch to the Permissions API to pre-check state.
The native dialog only fires from a user gesture (the "Enable" button
click), so a passive permission check would just duplicate logic.
The localStorage `nearby_geo_prompted` flag stays set on the first
"Enable" click — we don't re-show the soft prompt on retry, only the
inline empty-state retry button.
**Issues**: Hit Rules of Hooks again — initial patch put
`handleRetryGeolocation = useCallback(...)` between the showSoftPrompt
early-return and the geoDenied early-return. Moved it next to the other
handlers above all returns; tsc clean.
**Learnings**: Geolocation fail modes are user-actionable but only if
the UI tells them which one happened. "Click Enable, get told to
'enable location' anyway" is the worst possible loop — silent
swallowing of `err.code` is what produced it.
**Next steps**: qiaoxux re-tests on Vercel preview. If the retry button
still leaves her stuck, the message will at least show `denied` /
`timeout` / `unavailable` so we can debug.

## 2026-06-21 — Phase 45.27: First-visit geolocation soft prompt on /nearby

**Objective**: Stop the bare browser geolocation dialog from appearing the
moment someone opens /nearby. Without context, qiaoxux flagged that users
reflexively deny.
**Actions**: `app/(public)/nearby/NearbyClient.tsx` — added
`vicinity:nearby_geo_prompted` localStorage flag, `showSoftPrompt` state,
extracted `requestGeolocation` into a `useCallback` so it can be invoked
both on mount and from the dialog's "Enable location" button. Added a
modal (`role="dialog"`, `bg-surface` card, ink/ink2 typography) explaining
why we ask and what we do with the data. Two actions: "Enable location"
(sets flag, calls `getCurrentPosition` → native prompt fires from a user
gesture) and "Not now" (sets flag, falls through to existing geoDenied
empty state).
**Decisions**: Soft prompt fires once per browser (flag set on either
action). Subsequent visits skip the modal and call geolocation directly
— the OS/browser remembers the actual permission, so re-asking would be
nagware. Kept the existing geoDenied copy unchanged. Did NOT add a "ask
again" button — if the user wants to re-grant, they do it via the
browser's site permissions UI.
**Issues**: First patch put the modal early-return between hooks, breaking
Rules of Hooks. Moved it after every useCallback/useEffect; tsc clean.
**Learnings**: Conditional early returns in client components have to live
*after* every hook declaration. `replace_all` on a duplicated block is
not a substitute for re-reading the file.
**Next steps**: Push, verify on Vercel preview that (a) fresh incognito
shows the soft prompt before the OS dialog, (b) clicking "Enable" still
triggers the native geolocation prompt as a user gesture, (c) reload
after either choice goes straight to results / empty state.

## 2026-06-21 — Phase 45.26: TikTok-density grid view (overlay variant D)

**Objective**: owner referenced TikTok's Community feed and asked for grid pages to feel more immersive — cover takes more space, less empty whitespace between feeds, all caption text on one line so a touch over 2 rows fits per screen (gesture affordance for swipe). Two prototype rounds: v1 (A/B/C) cut fields and was rejected ("保留 价 房型 大小 和 地址"); v2 (D/E/F) kept all 4 fields with three cover-density gradients. Owner picked **D** (cover 100% with bottom gradient scrim and overlaid caption).

**Actions**:

- `app/(public)/browse/page.tsx` — replaced caption-below-cover layout with overlay D. Cover is full card; gradient scrim `bg-gradient-to-t from-black/80 via-black/40 to-transparent` covers the bottom 60%; price (15px serif), specs (`X bd · Y ba · Z sqft` joined into one line via `[...].filter(Boolean).join(' · ')`), and address sit on the scrim. Grid gap dropped from `gap-x-3 gap-y-8 md:gap-x-5 md:gap-y-12` (12/32px → 20/48px) to `gap-x-1 gap-y-2 md:gap-x-1.5 md:gap-y-3` (4/8px → 6/12px).
- `app/(public)/nearby/NearbyClient.tsx` — same edit + the existing distance pill stays at top-left (above the bottom scrim).
- `app/(public)/saved/_components/SavedClient.tsx` — both the listings sub-grid and the communities sub-grid get the overlay; community variant shows `name` + `city, state`.
- `app/_components/CommunityGrid.tsx` (shared by Explore + saved + community-search results) — overlay with name + location.
- `app/(public)/c/[slug]/_components/CommunityTabs.tsx` — both `aspect-square` sub-grids (videos with category label/blurb, listings with price/specs/address) migrated.
- `app/(public)/search/page.tsx` ListingCard — same overlay; the wrapping grid `<div>` also got the new gap classes.
- `app/dashboard/_components/ListingsTabbedList.tsx` — agent-facing dashboard grid; the `StatusBadge` (top-right) gets `z-10` so it stays above the gradient scrim.
- Skeletons: `app/(public)/c/[slug]/loading.tsx` (already 3:4) and the four `9/16` rounded skeletons (`browse/saved/nearby/communities` `loading.tsx`) updated to `aspect-[3/4]` with the new gap and no text-bar children — caption is now overlaid so the skeleton-vs-loaded transition has no layout shift.
- `public/prototype/grid-tiktok.html` (v1 A/B/C) and `public/prototype/grid-tiktok-v2.html` (v2 D/E/F) used for the two sign-off rounds; left in `public/prototype/` per visual-prototype-workflow ("don't delete after merge — they double as institutional memory").

**Decisions**:

- **Overlay over caption-below.** Owner explicitly asked for "more immersive" + "all text in one line" — D maximises cover real estate (100%) and lets the caption sit on the image like TikTok. v1's options that dropped fields were rejected; the constraint was always "keep all 4 fields", and overlay was the only way to keep them while expanding the cover.
- **Specs on one line via `filter(Boolean).join(' · ')`.** The previous `<span> · ` chain produced inconsistent leading dots when `beds` was null and `baths` wasn't. The join idiom keeps the separator clean regardless of which fields are present, and matches the prototype.
- **Did not extract a shared `ListingCard` component.** Each grid has slightly different fields (community vs listing vs video, distance pill vs status badge vs nothing) and a shared component would need a half-dozen optional props. Same overlay markup is now repeated in ~6 places; if drift becomes a problem next phase the consolidation is mechanical (overlay block is identical text-byte-for-byte across files now).
- **Kept `aspect-square` for community videos.** The 1:1 frame is intentional — videos are recorded portrait but the category cards on `/c/[slug]` are a square mosaic by design (phase 45.10 decision). Only the gap / overlay changed.

**Verification**: `npx tsc --noEmit` clean. Visual sign-off via the v2 prototype on Vercel; D selected.

**Learnings**:

- When a redesign touches N grid pages that share a class string but not a component, doing the prototype round in `public/prototype/*.html` pays off twice: once for the design pick (D vs E vs F) and once as a literal copy-paste reference while editing the N call sites — the prototype's overlay block became the canonical snippet pasted into all 6 grids.
- Skeletons need to match the new layout, not just the new gap. Leaving the old `text-bar` children in skeletons would produce a layout shift when the real grid (which now has zero below-image content) replaces them.

**Next steps**: Owner to test on the Vercel deploy. If overlay legibility on light-cover photos is a problem, the scrim opacity (`from-black/80`) is the single knob to bump.

## 2026-06-21 — Phase 45.25: Drop manual lat/lng input fallback on geolocation deny

**Objective**: owner reported that when a user blocks browser geolocation, both `/browse/nearby` and `/communities/nearby` rendered an input box asking the user to type their latitude/longitude. Owner: "it is very stupid" — show empty result instead.

**Actions**:

- `app/(public)/nearby/NearbyClient.tsx` — removed `manualLat`, `manualLng`, `needsManual` state + the `applyManual()` handler + the input-box JSX block. Renamed remaining flag to `geoDenied`. On geo denied / unavailable, render a single-line empty state: "Enable location access in your browser to see listings near you."
- `app/(public)/communities/nearby/CommunitiesNearbyClient.tsx` — same edits applied; copy reads "…communities near you."

**Decisions**:

- Did NOT add a `/profile`-Preferences-style fallback location picker. Owner's request was specifically to show empty, not to migrate the input elsewhere. Out of scope.
- Kept `geoDenied` as a separate boolean (not folded into the no-coords branch) so the "Reading your location…" loading state still wins when geolocation is genuinely in-flight; only after the API errors out do we switch to the empty CTA.

**Verification**: `npx tsc --noEmit` clean. Visual sign-off via Vercel preview on `phase45.25/nearby-empty-on-deny`.

## 2026-06-21 — Phase 45.24: Full-screen feed on mobile Safari + remove swipe hints

**Objective**: owner reported (with iPhone screenshot of `/v/<agent>/<listing>`) that the feed wasn't using the full screen and asked to remove the "Swipe up for more" copy on the listing/explore feed and the "← swipe →" hint on community-videos carousels.

**Actions**:

- `app/(public)/_components/feed/constants.ts` — `FEED_FRAME_CLASS` switched from `h-screen` / `100vh` to `h-[100dvh]` and the desktop 9:16 column math from `100vh*9/16` to `100dvh*9/16`. Updated comment on `FEED_VSCROLL_CLASS` to note children should also be `h-[100dvh]`.
- `app/(public)/browse/_components/BrowseFeed.tsx` — both card containers (PhotoCard `<section>` and Card `<section>`) switched from `h-screen` to `h-[100dvh]`. Removed the `activeIndex === 0 && activeSource === 'hero'` "Swipe up for more" overlay (replaced with a comment block).
- `app/(public)/c/[slug]/feed/CommunityVideoFeed.tsx` — card `<section>` switched from `h-screen` to `h-[100dvh]`.
- `app/(public)/browse/_components/CommunityCarousel.tsx` — removed "← swipe →" hint pill on the community-videos horizontal carousel.
- `app/(public)/c/[slug]/feed/_components/CommunityListingCarousel.tsx` — removed "← swipe →" hint pill on the community → listing carousel.

**Decisions**:

