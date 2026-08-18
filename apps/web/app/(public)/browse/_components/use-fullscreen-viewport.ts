/**
 * In-page fullscreen for a feed card's landscape variant, plus the viewport
 * measurement it needs.
 *
 * Split out of VideoCard because it is a device-quirk concern, not a playback
 * one: most of its length is the record of which measurement approaches were
 * wrong on which iPhone. Keeping it here means VideoCard reads as "how the
 * video plays" and this file reads as "how big the fullscreen box is".
 *
 * The caller still owns the toggle — the HLS effects branch on `isFullscreen`
 * to swap between the portrait and landscape source — so it is returned
 * rather than kept private.
 */
import { useEffect, useRef, useState } from 'react';

export type Viewport = { w: number; h: number };

export function useFullscreenViewport() {
  // in-page fullscreen for the landscape variant.
  // Only exposed when the current selection carries a `cfVideoIdLandscape`
  // (populated by the render worker for listings whose photos are ≥80%
  // horizontal). Toggling flips the container to `fixed inset-0 z-[9999]`
  // and swaps the HLS source to the landscape uid — same BGM, same
  // Ken-Burns pass, just letterbox-free horizontal composition.
  //
  // Custom in-page fullscreen (not the native Fullscreen API) because
  // iOS Safari's `webkitEnterFullscreen` on <video> tears down the src
  // and re-attaches at a fixed player, which breaks HLS.js and the
  // src-swap trick we depend on. A plain overlay div works everywhere.
  const [isFullscreen, setIsFullscreen] = useState(false);

  // measure the actual `<section>` element's
  // bounding rect instead of window.innerWidth/innerHeight. On iPhone Plus /
  // Pro Max models (428×926), `window.innerHeight` reports the *small*
  // viewport (~781, URL bar visible) while `fixed inset-0` extends into the
  // *layout* viewport (~926 with URL bar hidden). Sizing the rotate-90 box
  // against innerHeight left ~30% black at top+bottom on those phones.
  //
  // Reading the section's live rect via ResizeObserver captures whatever
  // `fixed inset-0` actually resolves to on the current device — no phone
  // hardcoding, no viewport-model guessing. Also listens to
  // window.visualViewport `resize` so URL-bar collapse expansions repaint.
  //
  // 71.14/71.15 history: dvw/dvh (Tailwind arbitrary) was emitted but
  // fallback-substituted; raw px innerWidth/innerHeight was correct on
  // 393×852 devices but wrong on 428×926 due to the small/layout viewport
  // gap above.
  const sectionRef = useRef<HTMLElement | null>(null);
  const [vp, setVp] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    if (!isFullscreen) return;
    // measure the VIEWPORT, not sectionRef.
    // sectionRef is the feed <section> which keeps its non-fullscreen
    // layout even when the fullscreen `fixed inset-0 z-[9999]` overlay
    // is on top. Measuring section on the isFullscreen effect fired
    // AFTER the tap handler's sync setVp(window inner{Width,Height}),
    // overwriting the correct viewport dims with the smaller section
    // dims → user saw "big → small → big" as ResizeObserver later
    // resettled. window.innerWidth/Height matches the fullscreen
    // container's actual size (fixed inset-0), matches the tap
    // handler, single source of truth.
    function measure() {
      setVp({ w: window.innerWidth, h: window.innerHeight });
    }
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      vv?.removeEventListener('resize', measure);
    };
  }, [isFullscreen]);

  // ESC exits fullscreen — desktop keyboards and iPad Magic Keyboards.
  useEffect(() => {
    if (!isFullscreen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsFullscreen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  return { sectionRef, isFullscreen, setIsFullscreen, vp, setVp };
}
