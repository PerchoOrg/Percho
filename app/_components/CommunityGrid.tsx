import type { CommunityListCard } from '@/lib/communities/list';
import { demoCoverFor } from '@/lib/demo-media';
/**
 * CommunityGrid — buyer-facing grid card for the communities surface.
 *
 * Used by /communities (Explore + Nearby). Phase 45.10 (2026-06-20):
 * unified with the /browse listing-grid style — 3:4 frame, caption below
 * the image (not overlaid), no ring, gallery gap. Owner: "all other tabs
 * should share the same page and card format".
 */
import Link from 'next/link';

export function CommunityGrid({
  communities,
  hrefBuilder,
}: {
  communities: (CommunityListCard & { nearestVideoMi?: number | null })[];
  /** Optional override for the per-card link target. Defaults to `/c/<slug>`
   * (public community page). Phase 45.13 (2026-06-20): /dashboard/communities
   * passes `(c) => /dashboard/communities/<id>` so agents land on the editor
   * instead of the buyer-facing browse page when tapping their own card. */
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
    <div className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-4 md:gap-x-5 md:gap-y-12">
      {communities.map((c) => {
        const coverUrl = demoCoverFor(c.id, c.cover?.url ?? null);
        const distanceMi =
          typeof c.nearestVideoMi === 'number' ? c.nearestVideoMi : null;
        return (
          <Link key={c.id} href={hrefBuilder ? hrefBuilder(c) : `/c/${c.slug}`} prefetch={false} className="group block">
            <div className="relative aspect-[3/4] w-full overflow-hidden bg-surface">
              {coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverUrl}
                  alt={c.name}
                  className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-bronze/20 to-ink">
                  <span className="font-semibold text-3xl text-cream/70">
                    {c.name.charAt(0)}
                  </span>
                </div>
              )}
              {distanceMi !== null && (
                <div className="absolute top-2 left-2 rounded-full bg-ink/85 px-2 py-0.5 text-[10px] text-surface backdrop-blur">
                  {distanceMi.toFixed(1)} mi
                </div>
              )}
            </div>
            <div className="pt-3">
              <div className="font-serif text-base text-ink leading-tight tracking-[-0.012em]">
                {c.name}
              </div>
              <div className="mt-1 truncate text-ink2 text-[12px]">
                {c.city ? `${c.city}, ${c.state}` : c.state}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted tracking-wide">
                <span>
                  {c.videoCount} {c.videoCount === 1 ? 'video' : 'videos'}
                </span>
                {c.listingCount > 0 && (
                  <span>
                    · {c.listingCount} {c.listingCount === 1 ? 'home' : 'homes'}
                  </span>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
