# Plan — Unify Three Feeds (Browse / CommunityVideo / CommunityCarousel)

> Status: **plan only, not yet executed**. Owner request 2026-06-20: "refactor the code so all feeds including browsing, community video and community carousel are always consistent and all share the same page / card layout logic."
>
> Trigger: phase 45.19 fixed buttons-disappearing on `/c/[slug]/feed` (CommunityVideoFeed) by mirroring BrowseFeed's outer/inner shell. Same shape of bug then surfaced on the in-listing community carousel ("I don't see all the small buttons"). Three feeds, three nearly-identical-but-subtly-different overlay implementations — bug fixes don't propagate. Time to consolidate.

## Goal

One layout/overlay primitive used by all three video surfaces. Bug fixes for "viewport shell + scroller + safe-area + overlay z-stack + caption + right rail" written **once**, picked up by **all three** automatically.

## Current state — what's actually different

| Aspect | BrowseFeed | CommunityVideoFeed | CommunityCarousel |
|---|---|---|---|
| File | `app/(public)/browse/_components/BrowseFeed.tsx` (1536 ln) | `app/(public)/c/[slug]/feed/CommunityVideoFeed.tsx` (791 ln) | `app/(public)/browse/_components/CommunityCarousel.tsx` (486 ln) |
| Scroll axis | vertical snap (`snap-y snap-mandatory`) | vertical snap (same) | horizontal swipe (touch dx>50 → idx±1, no native snap) |
| Anchor entity | listing | community | listing (entered from BrowseFeed) |
| Top-left button | Back-to-listing-video (when on community/photos) OR none | Back-to-community page | Back-to-listing |
| Top-right buttons | Share | Share | Share |
| Right rail | Like / Save / Contact (listing agent) | Like / Save / Contact (community owner) + homes chip | Like / Save / Contact (listing agent) |
| Caption block | listing price/title/specs | community pill + name + description | listing price/title (subset) |
| Bottom sheet | listing detail / community / map | community / map | listing detail |
| Safe-area | yes (45.21 = `max(6rem, calc(env(safe-area-inset-bottom)+5rem))`) | yes (matches) | yes (matches) |
| Overlay z-stack | content < gradients < captions < rail < topbar < modal=`z-[70]` (45.20) | same shape | same shape but earlier had inversion (carousel wrapper `z-[60]`, modal was `z-50` — fixed in 45.20 by bumping modal) |
| Outer shell pattern | `relative h-screen overflow-hidden` shell + inner `h-full w-full snap-y snap-mandatory overflow-y-scroll` | matches (45.19) | single wrapper `relative h-screen overflow-hidden` (no inner scroller because horizontal swipe ≠ scroll) |

**The convergence**: top-left back / top-right share / right-rail (Like/Save/Contact ± extras) / bottom caption / bottom-sheet trigger / gradients / safe-area math / z-stack — these are **identical concerns** across all three. Differences are in (a) what each button does (b) what the caption renders (c) what the scroller axis is.

## Proposed approach — three layers

```
┌────────────────────────────────────────────────────────────────┐
│ FeedShell                                                      │ ← layer 1 (pure layout)
│   - outer `relative h-screen overflow-hidden` + desktop frame  │
│   - children: <Scroller> | <SwipePager>                        │
│   - top-left slot, top-right slot, right-rail slot,            │
│     bottom-caption slot, bottom-sheet slot, gradient layer     │
│   - safe-area math, z-stack constants                          │
└────────────────────────────────────────────────────────────────┘
        △                              △                         △
        │                              │                         │
   uses Scroller                  uses Scroller              uses SwipePager
        │                              │                         │
┌─────────────────┐          ┌─────────────────┐         ┌─────────────────┐
│ BrowseFeed      │          │ CommunityVideoF │         │ CommunityCarous │ ← layer 3
│  (listing-     │          │ (community-    │         │ (listing-       │
│   anchored)    │          │  anchored)     │         │  anchored,      │
│                │          │                │         │  horizontal)    │
└─────────────────┘          └─────────────────┘         └─────────────────┘
```

### Layer 1 — `FeedShell` (new, ~150 ln)
Path: `app/(public)/_components/feed/FeedShell.tsx`

Owns:
- Viewport shell: `relative h-screen overflow-hidden` + desktop phone frame (`md:w-[min(430px,calc(100vh*9/16))] mx-auto`).
- Slot props: `topLeft`, `topRight`, `rightRail`, `caption`, `gradients`, `children` (the scroller/pager).
- Safe-area constants exported as `FEED_RAIL_BOTTOM = 'max(6rem, calc(env(safe-area-inset-bottom) + 5rem))'`, `FEED_CAPTION_BOTTOM = 'max(1rem, env(safe-area-inset-bottom))'`, `FEED_Z = { content: 'z-0', gradient: 'z-10', caption: 'z-20', rail: 'z-30', topbar: 'z-40', modal: 'z-[70]' }`.
- Default top + bottom gradient overlays (override-able via `gradients={false}`).

### Layer 2 — `<VerticalSnapScroller>` and `<HorizontalSwipePager>`
Paths:
- `app/(public)/_components/feed/VerticalSnapScroller.tsx` (~80 ln)
- `app/(public)/_components/feed/HorizontalSwipePager.tsx` (~100 ln)

`VerticalSnapScroller`:
- Inner `h-full w-full snap-y snap-mandatory overflow-y-scroll` div.
- Children render N pages each `h-screen w-full snap-start snap-always`.
- IntersectionObserver-based active-index callback (currently duplicated in BrowseFeed + CommunityVideoFeed).

`HorizontalSwipePager`:
- Touch dx threshold + activeIdx state (currently in CommunityCarousel).
- Renders single active child + transition.
- Exposes `onActiveChange(idx)`.

### Layer 3 — three feed components, slimmed
- `BrowseFeed` keeps its data/intent logic, no longer owns shell/scroller — just passes slots into `FeedShell` + uses `VerticalSnapScroller`. Photo sub-card extraction for listing-mode photos stays.
- `CommunityVideoFeed` same shape, with community caption + community-owner Contact rail.
- `CommunityCarousel` uses `FeedShell` + `HorizontalSwipePager`. Inherits same z-stack / rail bottom / caption math automatically. Bug from 45.20 (modal hidden behind carousel) is structurally impossible because z-constants are centralized.

### Shared building blocks (already partly factored, should also live in `feed/`)
- `<RightRail>` — Like / Save / Contact slot list. Receives `items: { icon, label, onClick, active?, hide? }[]`.
- `<TopLeftBack>` — back button or chip variant (BrowseFeed has chip; CommunityVideoFeed has named "Back to {community}"). One component, prop-driven.
- `<TopRightShare>` — share button.
- `<ActionButton>` — exists in BrowseFeed; promote to `feed/ActionButton.tsx`.
- Icon components (HeartIcon, BookmarkIcon, ShareIcon, BackArrowIcon, NearbyIcon, CommentIcon, PlayIcon) — promote to `feed/icons.tsx`.

## Step-by-step plan

Each step ends with `npx tsc --noEmit` green. Following memory pattern (parent does mechanical refactor; subagents only if reasoning needed).

1. **Audit + extract icon set** (mechanical; ~1 commit)
   - Move 7 icon fns from BrowseFeed.tsx to `feed/icons.tsx`. Update 3 import sites.
   - Verify: tsc clean, no visual change on any of `/browse`, `/c/peachtree-corners/feed`, in-listing carousel.
   - Phase tag: 45.22.1.

2. **Extract `ActionButton` + `RightRail`** (~1 commit)
   - `ActionButton` from BrowseFeed:227-323 → `feed/ActionButton.tsx`. Replace 3 inline rail blocks with `<RightRail items={…} />`. Items array gives each feed control over what shows.
   - Pitfall guard: each feed currently owns its hover-state colors (cream/ink). Keep `ActionButton` styling **byte-identical** to BrowseFeed's current — verified by visual diff on prod.
   - 45.22.2.

3. **Introduce `FeedShell` + safe-area constants** (~1 commit)
   - New file `feed/FeedShell.tsx`. Slot-based composition (`topLeft`, `topRight`, `rightRail`, `caption`, `children`).
   - Migrate **only BrowseFeed first** to use it. Other two untouched.
   - tsc + build + manual `/browse` smoke. If buttons or scroll feel off, rollback only this commit (file-level git checkout).
   - 45.22.3.

4. **Migrate CommunityVideoFeed to `FeedShell`** (~1 commit)
   - Replace its outer/inner shell (45.19 fix) with `<FeedShell> + <VerticalSnapScroller>`.
   - Keep community-specific caption (pill + name + desc) as `caption` slot content.
   - Keep "homes chip" as extra rail item (or below-rail floating element — TBD by visual diff).
   - Manual smoke: `/c/peachtree-corners/feed` — first paint AND post-swipe overlays, exactly like 45.19.
   - 45.22.4.

5. **Extract `HorizontalSwipePager` + migrate CommunityCarousel** (~1 commit)
   - Pull touch-dx logic from CommunityCarousel:current swipe handler into `feed/HorizontalSwipePager.tsx`.
   - Wrap CommunityCarousel content in `<FeedShell><HorizontalSwipePager>…`.
   - z-stack now shared with the other two — modal-behind-carousel inversion (45.20 Bug A) is **structurally impossible**.
   - Manual smoke: `/browse` → tap a community card → verify Back / Share / Like / Save / Contact all visible and Contact opens modal on top.
   - 45.22.5.

6. **DEVLOG + RELEASE** (~1 commit, can be folded into 45.22.5)
   - Single phase-45.22 entry summarizing the consolidation. Bump to v0.46.0 (minor — no behavior change but architectural).
   - 45.22.6.

7. **Final cross-feed verify**
   - tsc clean, `timeout 120 npx next build` clean.
   - Manual smoke on Vercel preview for all three feeds (overlay positions, contact modal, swipe/scroll, safe-area on iOS Safari).

## Files likely to change

- New:
  - `app/(public)/_components/feed/FeedShell.tsx`
  - `app/(public)/_components/feed/VerticalSnapScroller.tsx`
  - `app/(public)/_components/feed/HorizontalSwipePager.tsx`
  - `app/(public)/_components/feed/RightRail.tsx`
  - `app/(public)/_components/feed/ActionButton.tsx`
  - `app/(public)/_components/feed/TopBar.tsx` (Back + Share slot wrappers)
  - `app/(public)/_components/feed/icons.tsx`
  - `app/(public)/_components/feed/constants.ts` (z-stack + safe-area)
- Modified:
  - `app/(public)/browse/_components/BrowseFeed.tsx` — drop ~400 ln of shell/icons/rail, keep listing-data + sub-card photo logic.
  - `app/(public)/c/[slug]/feed/CommunityVideoFeed.tsx` — drop ~250 ln similar.
  - `app/(public)/browse/_components/CommunityCarousel.tsx` — drop ~150 ln similar.
- Touch but probably no diff:
  - `app/(public)/_components/LeadModal.tsx` — z-stack constant import instead of hard-coded `z-[70]` (so consolidation is real).

## Desktop vs Mobile — current state and target

The three feeds already implement a desktop "phone-shape" frame, but **inconsistently**. Consolidation must encode all of these as `FeedShell`-level concerns so they apply identically everywhere.

### Audit — what's there today

| Concern | BrowseFeed | CommunityVideoFeed | CommunityCarousel |
|---|---|---|---|
| Desktop phone frame (`md:w-[min(430px,calc(100vh*9/16))] md:shadow-2xl md:shadow-black/50 mx-auto`) | ✅ ln 1271 | ✅ ln 602 | ✅ ln 157 |
| Desktop letterbox (`md:object-contain` on video/img) | ✅ | ✅ | partial — depends on inner video tag |
| Desktop blurred-bg fill (`hidden md:block` scaled blur) | ✅ ln 422,740 | ✅ ln 331 | ❌ missing |
| Desktop nav arrows for swipe/scroll | ✅ photo prev/next (ln 459/468), nearby up/down (ln 830/842) | ❌ **none** — no desktop equivalent for vertical scroll | ✅ outside-phone left/right (ln 231/241, `-left-14`/`-right-14`) |
| Mobile: native touch swipe / scroll-snap | ✅ vertical snap + photo dx | ✅ vertical snap | ✅ horizontal dx threshold |
| Right rail on desktop | hidden = no, shows both | shows both | shows both |
| Bottom safe-area inset | ✅ | ✅ | ✅ |
| iOS safe-area top inset (notch) on top buttons | partially — uses `top-3`/`top-4` constants, no `env(safe-area-inset-top)` math | same | same |

### Gaps to close

1. **CommunityVideoFeed has no desktop nav arrows** — vertical-scroll feeds on desktop work via wheel but a mouse user has no visual affordance. BrowseFeed's nearby up/down arrows fix that for one mode but not for the main vertical scroll. Decide once: do we expose desktop nav arrows for `VerticalSnapScroller` (up/down chevrons in the rail or center-aligned)? Recommend: **yes**, add center-bottom up/down chevrons (`md:flex` only), shared by both vertical feeds.
2. **CommunityCarousel missing blurred-bg fill** on desktop — short videos in 9:16 letterbox show black bars. Recommend: add the same `hidden md:block scale-110 blur-2xl opacity-60` backdrop layer in `FeedShell` so all three feeds get it free.
3. **Top-bar safe-area** — currently top buttons use fixed `top-3`/`top-4`. On notched mobile (iPhone Safari) they sit under the dynamic island in standalone PWA mode. `FeedShell` should default top slots to `top-[max(0.75rem,env(safe-area-inset-top))]`. Verify on real iOS Safari before shipping.
4. **Desktop interaction model** must be consistent: keyboard arrows (↑/↓ for vertical, ←/→ for horizontal) currently not wired. Out of scope for this refactor's first cut, but **add a `keyboard?: boolean` prop on `Scroller`/`Pager`** so we can toggle later without touching three feeds.

### Encoded in `FeedShell`

`FeedShell` itself owns:
- The `mx-auto md:w-[min(430px,calc(100vh*9/16))] md:shadow-2xl md:shadow-black/50` outer frame.
- The `hidden md:block` blurred-bg backdrop layer (rendered behind `children`, takes a `backdrop?: ReactNode` prop = current frame's video/photo).
- Top-slot safe-area math via `env(safe-area-inset-top)`.
- Right rail hidden under `md:hidden`? **No** — owner uses both desktop and mobile; rail must show on both. Confirm with owner if any rail item is mobile-only (e.g. native share API).

Encoded in `VerticalSnapScroller`:
- Optional desktop up/down chevrons (`md:flex` only, hidden on mobile where snap-scroll is the input).
- IntersectionObserver-based active-page callback (works identically on both).

Encoded in `HorizontalSwipePager`:
- Touch dx threshold (mobile primary input).
- Outside-phone left/right chevrons on desktop (`md:flex` only, current CommunityCarousel pattern).

### New validations for desktop/mobile

7. **Desktop ≥ md (≥768px)**: all three feeds render in 9:16 phone frame, centered, with blurred-bg fill on letterboxed video. Top + bottom shadow visible.
8. **Desktop nav**: BrowseFeed photo prev/next, listing→community carousel left/right, both vertical feeds up/down — all mouse-clickable.
9. **Mobile (iOS Safari, notched)**: top buttons clear of dynamic island; bottom rail clear of home indicator; no horizontal scroll bleed.
10. **Mobile (Android Chrome)**: same as iOS minus notch.
11. **Resize sanity**: drag desktop window from 1200px → 700px (crosses md breakpoint) — feed should reflow without overflow / scrollbar artifacts.

## Tests / validation

No automated test suite for these UI surfaces (historical pattern). Validation = tsc + build + manual smoke on Vercel preview against each of the four critical paths from prior phases:

1. `/c/peachtree-corners/feed` — first paint AND after one swipe: all 7 overlay buttons visible (Back, community pill, Share, Like, Save, Contact, homes chip). Re-validates 45.19.
2. `/browse` → click listing → community videos carousel → tap Contact → modal sits **on top** of carousel, fully interactive. Re-validates 45.20-A.
3. `/c/peachtree-corners/feed` (legacy `created_by = NULL`) — Contact button exists; tap → modal addressed to Qiaoxuan via listing-agent fallback. Re-validates 45.20-B.
4. `/browse` listing feed — right rail at thumb height (`max(6rem, …)`), not at bottom edge. Re-validates 45.21.

Plus new validations for this phase:
5. CommunityCarousel — Like/Save/Contact at exact same y-coordinate as BrowseFeed listing rail (visual diff, screenshot side-by-side).
6. Same for CommunityVideoFeed (modulo extra "homes" item).

## Risks, tradeoffs, open questions

- **Risk: regression surface is large**. Three feeds, ~700 lines being moved across files. Mitigation: 5 small commits, each shippable + rollback-able. Each commit migrates ONE feed only (after the shared lib lands).
- **Risk: visual drift**. Pixel-perfect parity hard to achieve when consolidating. Mitigation: byte-identical Tailwind classes for first cut, refactor styling later as a separate cosmetic phase if needed.
- **Risk: `<div>` balance bug** (memory: phase45.8 / 45.12 reversal). Mitigation: each migration commit runs `grep -c '<div'` == `grep -c '</div>'` per file before commit.
- **Risk: Tailwind JIT silent drop** (memory: paper/gold tokens). Mitigation: don't introduce new tokens, just move existing classes.
- **Tradeoff: Slot API vs subclassing**. Picked slot API because all three feeds want different content per slot (Back vs Back-with-name vs Back-to-listing). Subclassing would force inheritance hierarchy that doesn't fit the data shape diversity.
- **Open question: do CommunityCarousel and BrowseFeed photos sub-mode share enough to also unify?** Photos in BrowseFeed are within-card horizontal swipe (not a separate page). Probably yes — but out of scope for this phase. Note for follow-up.
- **Open question: should we stage this behind a feature flag?** The three feeds are public-facing and Qiaoxuan-tested. No flag system exists. Recommend ship-and-roll-back rather than introduce flag infra for one phase.
- **Open question: does owner want the carousel rail to **also** include the homes-chip-like extras (e.g. "view homes in this community")?** Currently only CommunityVideoFeed has it. Worth asking after the structural move so we know whether to make it a first-class rail item or keep as feed-specific.

## ❓ 需要你做

1. **Confirm scope**: 同意三层抽象(`FeedShell` + `Scroller`/`Pager` + 三个数据/intent 组件)?
2. **Desktop 三个新决策**(audit 出来发现的 gap):
   - 给两个**纵向 feed 加 desktop 上下箭头**(`md:flex` 居中下方),mouse 用户有可视入口?**推荐 yes**
   - 给 CommunityCarousel **补上 desktop 模糊背景**(letterbox 黑边换成模糊填色,跟另两个一致)?**推荐 yes**
   - **顶部 buttons 加 iOS notch safe-area**(`env(safe-area-inset-top)`)?**推荐 yes**(标准移动 web 卫生)
3. **Visual parity**: 这次 **不调视觉** —— 行么?除了上面 3 个 desktop/mobile gap fix 是真 bug。
4. **Phase 45.22 + bump v0.46.0** OK?
5. **Sequencing**:5 个小 commit 一个一个 ship 让你 verify(推荐),还是攒齐?之前都是单 commit,这次工作量大建议 ship-as-you-go。
