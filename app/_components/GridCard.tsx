/**
 * GridCard — single source of truth for the 3:4 cover card used in
 * ListingGrid and CommunityGrid. Slot-based: caller supplies the cover
 * source, the optional top-left/top-right badges, the caption block, and
 * a fallback for missing covers.
 *
 * Phase 47 (2026-06-21): extracted from /browse, /dashboard (My Listings),
 * /communities, and /dashboard/communities so all four surfaces share one
 * card definition. Future tweaks to aspect ratio, hover transform, bottom
 * gradient, or text shadow happen in this one file.
 *
 * Slots:
 *   - href          — link target
 *   - coverUrl      — img src (any URL); when null we render `fallback`
 *   - fallback      — what to show when coverUrl is null (e.g. CommunityGrid
 *                     uses an "initial bubble", ListingGrid uses "No cover")
 *   - topLeft       — optional badge in the upper-left of the cover (e.g.
 *                     "0.4 mi" distance pill on community cards)
 *   - topRight      — optional badge in the upper-right (e.g. "Inactive"
 *                     on dimmed listings, "Stock" on demo media)
 *   - caption       — bottom-overlay caption block (price / specs / address
 *                     for listings, name / city,state for communities)
 *   - dimmed        — render the cover image at opacity-60 (used for the
 *                     "Inactive" listing case in My Listings)
 *   - alt           — img alt text
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

export type GridCardProps = {
  href: string;
  coverUrl: string | null;
  fallback: ReactNode;
  topLeft?: ReactNode;
  topRight?: ReactNode;
  caption: ReactNode;
  dimmed?: boolean;
  alt?: string;
  /** Tailwind aspect class. Defaults to `aspect-[3/4]` (the unified feed
   *  card). The agent portfolio page passes `aspect-[4/5]` to keep its
   *  editorial proportions while still using the shared overlay caption. */
  aspectClass?: string;
  /** Tailwind inset class for the bottom-overlay caption block. Default
   *  `inset-x-2 bottom-2` (8px) matches the dense feed grid. The portfolio
   *  page passes `inset-x-5 bottom-5` so its larger card has matching
   *  larger interior padding. */
  captionInsetClass?: string;
};

export function GridCard({
  href,
  coverUrl,
  fallback,
  topLeft,
  topRight,
  caption,
  dimmed,
  alt,
  aspectClass = 'aspect-[3/4]',
  captionInsetClass = 'inset-x-2 bottom-2',
}: GridCardProps) {
  return (
    <Link href={href} prefetch={false} className="group block">
      <div className={`relative ${aspectClass} w-full overflow-hidden bg-surface`}>
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={alt ?? ''}
            className={`h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02] ${
              dimmed ? 'opacity-60' : ''
            }`}
            loading="lazy"
          />
        ) : (
          fallback
        )}
        {topLeft && <div className="absolute top-2 left-2 z-10">{topLeft}</div>}
        {topRight && <div className="absolute top-2 right-2 z-10">{topRight}</div>}
        {/* Bottom-gradient scrim — Phase 45.26 TikTok-density overlay D. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        <div className={`absolute ${captionInsetClass} text-surface`}>{caption}</div>
      </div>
    </Link>
  );
}

/** Standard caption layout used by both ListingGrid and CommunityGrid. */
export function GridCardCaption({
  title,
  sub,
  sub2,
}: {
  title: ReactNode;
  sub?: ReactNode;
  sub2?: ReactNode;
}) {
  return (
    <>
      <div className="truncate font-serif text-[15px] font-semibold leading-tight tracking-[-0.01em]">
        {title}
      </div>
      {sub != null && (
        <div className="mt-0.5 truncate text-[11px] tracking-wide opacity-95">{sub}</div>
      )}
      {sub2 != null && <div className="mt-px truncate text-[11px] opacity-80">{sub2}</div>}
    </>
  );
}

/** Dark pill badge used for distance ("0.4 mi"), stock indicator, etc. */
export function GridCardBadgeDark({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-ink/85 px-2 py-0.5 text-[10px] text-surface backdrop-blur">
      {children}
    </span>
  );
}

/** Light pill badge used for "Inactive" / status pills on owner surfaces. */
export function GridCardBadgeLight({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-line bg-surface/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink2 backdrop-blur">
      {children}
    </span>
  );
}
