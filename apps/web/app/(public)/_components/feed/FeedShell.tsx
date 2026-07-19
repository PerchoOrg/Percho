'use client';

import type { Ref, ReactNode } from 'react';

import { FEED_FRAME_CLASS, FEED_VSCROLL_CLASS } from './constants';

/**
 * Phase 45.23 (2026-06-21): shared shell for the three feed surfaces
 * (BrowseFeed, CommunityVideoFeed, CommunityCarousel). Owns the outer
 * phone-shape frame and (when `axis === 'vertical'`) the inner snap
 * scroller. Overlays — top header, right rail, captions, sheets, modals
 * — render as siblings of the scroller so they stay fixed relative to
 * the viewport while the cards scroll/swipe underneath.
 *
 * API shape: `cards` is the scrollable content (rendered inside the
 * snap scroller); `children` are the overlays (rendered as siblings of
 * the scroller, not inside it). This split means callers don't need to
 * stuff long overlay JSX into a prop value — the natural JSX child
 * position is for overlays, which is the bigger chunk.
 *
 * `axis === 'horizontal'` skips the inner snap scroller entirely — the
 * caller (CommunityCarousel today) provides its own swipe pager as the
 * `cards` value, rendered directly under the frame.
 */
export type FeedShellProps = {
  /** Ref forwarded to the inner snap scroller (vertical only). */
  scrollerRef?: Ref<HTMLDivElement>;
  /** Cards / pages rendered inside the scroller (or pager). */
  cards: ReactNode;
  /** Absolute-positioned overlays — siblings of the scroller. */
  children?: ReactNode;
  /** Vertical snap scroll (default) or horizontal pager (no scroller — caller owns). */
  axis?: 'vertical' | 'horizontal';
};

export function FeedShell({
  scrollerRef,
  cards,
  children,
  axis = 'vertical',
}: FeedShellProps) {
  return (
    <div className={FEED_FRAME_CLASS}>
      {axis === 'vertical' ? (
        <div
          ref={scrollerRef}
          className={FEED_VSCROLL_CLASS}
          style={{ scrollSnapType: 'y mandatory' }}
        >
          {cards}
        </div>
      ) : (
        cards
      )}
      {children}
    </div>
  );
}
