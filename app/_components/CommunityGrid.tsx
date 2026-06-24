import type { CommunityListCard } from '@/lib/communities/list';
/**
 * CommunityGrid — buyer-facing grid card for the communities surface.
 *
 * Used by /communities (Explore + Nearby) and /dashboard/communities.
 *
 * Phase 47 (2026-06-21): refactored on top of the shared GridCard /
 * GridFrame primitives so that this grid and ListingGrid share frame,
 * gap rules, aspect ratio, hover transform, and bottom gradient. Only
 * the per-card data slots differ. Future tweaks to the visual shell
 * happen in app/_components/GridCard.tsx (one place).
 */
import { GridCard, GridCardBadgeDark, GridCardCaption } from './GridCard';
import { GridFrame } from './GridFrame';

export function CommunityGrid({
  communities,
  hrefBuilder,
}: {
  communities: (CommunityListCard & { nearestVideoMi?: number | null })[];
  /** Optional override for the per-card link target. Defaults to `/c/<slug>`
   * (public community page). /dashboard/communities passes
   * `(c) => /dashboard/communities/<id>` so agents land on the editor. */
  hrefBuilder?: (c: CommunityListCard) => string;
}) {
  if (communities.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-surface px-4 py-6 text-ink2 text-sm">
        No communities yet.
      </p>
    );
  }

  return (
    <GridFrame>
      {communities.map((c) => {
        const coverUrl = c.cover?.url ?? null;
        const distanceMi = typeof c.nearestVideoMi === 'number' ? c.nearestVideoMi : null;
        return (
          <GridCard
            key={c.id}
            href={hrefBuilder ? hrefBuilder(c) : `/c/${c.slug}`}
            coverUrl={coverUrl}
            alt={c.name}
            topLeft={
              distanceMi !== null ? (
                <GridCardBadgeDark>{`${distanceMi.toFixed(1)} mi`}</GridCardBadgeDark>
              ) : null
            }
            fallback={
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-bronze/20 to-ink">
                <span className="font-semibold text-3xl text-cream/70">{c.name.charAt(0)}</span>
              </div>
            }
            caption={
              <GridCardCaption title={c.name} sub={c.city ? `${c.city}, ${c.state}` : c.state} />
            }
          />
        );
      })}
    </GridFrame>
  );
}
