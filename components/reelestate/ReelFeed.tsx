/**
 * <ReelFeed> — vertical, full-viewport scroll-snap container for the mobile
 * reel feed.
 *
 * ref: docs/design/reelestate-teardown/README.md §2.1 (Reel Hero / Feed)
 *
 * F1.1 scope (this file): container-only. Each child is one full-viewport
 * slide (100dvh) that snaps to the top on scroll. Cards render whatever the
 * parent passes in — F1.2 will supply the actual <ReelCard> visual layer.
 *
 * Design notes:
 *  - `overflow-y-scroll` + `snap-y snap-mandatory` on the container
 *  - each `<section>` is `h-[100dvh] snap-start` — full-bleed 9:16 slot
 *  - `overscroll-behavior: contain` stops the scroll chain from bubbling
 *    into the page (matters when the feed is embedded in a longer layout)
 *  - horizontally centered content area so ReelCard can grow to a
 *    reasonable max width on tablet/desktop while keeping mobile 100%
 */
import type { ReactNode } from 'react';

export interface ReelFeedItem {
  id: string;
  node: ReactNode;
}

export function ReelFeed({ items }: { items: ReelFeedItem[] }) {
  if (items.length === 0) {
    return <ReelFeedEmpty />;
  }
  return (
    <div
      className="h-[100dvh] w-full snap-y snap-mandatory overflow-y-scroll overscroll-contain bg-bg"
      data-testid="reel-feed"
    >
      {items.map((item) => (
        <section
          key={item.id}
          className="relative flex h-[100dvh] w-full snap-start items-center justify-center"
        >
          {item.node}
        </section>
      ))}
    </div>
  );
}

function ReelFeedEmpty() {
  return (
    <div className="flex h-[100dvh] w-full items-center justify-center bg-bg px-6 text-center">
      <p className="text-sm text-white/60">No listings available yet.</p>
    </div>
  );
}

/**
 * Skeleton for Suspense fallback while the RSC fetches listings.
 * Renders one full-viewport shimmering slot (no fake caption text — a
 * single dark panel with a subtle pulse). Matches page bg exactly so the
 * transition to the real feed doesn't flash.
 */
export function ReelFeedSkeleton() {
  return (
    <div
      className="h-[100dvh] w-full snap-y snap-mandatory overflow-y-scroll bg-bg"
      aria-busy="true"
      aria-label="Loading feed"
      data-testid="reel-feed-skeleton"
    >
      <section className="relative flex h-[100dvh] w-full snap-start items-center justify-center">
        <div className="h-full w-full animate-pulse bg-bg-surface/40" />
      </section>
    </div>
  );
}
