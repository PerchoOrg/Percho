/**
 * shared layout constants for the three feed
 * surfaces (BrowseFeed, CommunityVideoFeed, CommunityCarousel). Centralized
 * so a fix in z-stack or safe-area math propagates to all three at once —
 * the recurring class of bugs we kept hitting through phases 45.19–45.22
 * (overlay buttons disappearing, modal hidden behind carousel, rail too
 * close to home indicator) was a direct consequence of three near-copies
 * drifting independently.
 */

// Right-rail bottom inset — hugs the bottom of the frame, clear only
// of the iOS home indicator. Phase 69 (2026-07-04): owner "都按照
// browse feed 里的半贴底做就行" — matched to the value BrowseFeed
// has been using inline since phase 68.1. Was 6rem pre-phase-69.
export const FEED_RAIL_BOTTOM = 'max(1rem, calc(env(safe-area-inset-bottom) + 0.5rem))';

// Caption block bottom inset — leaves space for the mobile home indicator
// without burying the price/title under it.
export const FEED_CAPTION_BOTTOM = 'max(1rem, env(safe-area-inset-bottom))';

// Z-stack constants. Modal is z-[70]. Keep modal
// above every overlay layer; nothing else here ever exceeds 40.
export const FEED_Z = {
  content: 'z-0',
  gradient: 'z-10',
  caption: 'z-20',
  rail: 'z-20',
  topbar: 'z-30',
  modal: 'z-[70]',
} as const;

// Outer phone-shape frame, used by all three feeds. On md+ the feed is
// constrained to a 9:16 portrait column so desktop users see the same
// crop as mobile rather than a stretched landscape video.
// use 100dvh (dynamic viewport height) instead of
// h-screen / 100vh so the feed actually fills mobile Safari's visible viewport
// when the browser's URL bar is shown. With 100vh the URL bar overlaps the
// bottom of the feed (caption + rail get clipped); 100dvh tracks the chrome.
// The desktop 9:16 column math also switches to dvh for consistency.
export const FEED_FRAME_CLASS =
  'relative mx-auto h-[100dvh] w-full overflow-hidden bg-black md:w-[min(430px,calc(100dvh*9/16))] md:shadow-2xl md:shadow-black/50';

// each snap card uses h-[100dvh] to track the
// dynamic viewport (mobile Safari URL bar). Keep in sync with FEED_FRAME_CLASS.
export const FEED_VSCROLL_CLASS =
  'h-full w-full snap-y snap-mandatory overflow-y-scroll overscroll-contain';
