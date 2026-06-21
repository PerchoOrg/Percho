# Vicinity — Development Log

Institutional memory for the project. Updated incrementally, not at session end.

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
