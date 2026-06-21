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
    <div className="grid grid-cols-2 gap-x-1 gap-y-2 md:grid-cols-4 md:gap-x-1.5 md:gap-y-3">
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
              {/* Phase 45.26 (2026-06-21): TikTok-density overlay D. */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
              <div className="absolute inset-x-2 bottom-2 text-surface">
                <div className="truncate font-serif text-[15px] font-semibold leading-tight tracking-[-0.01em]">
                  {c.name}
                </div>
                <div className="mt-0.5 truncate text-[11px] opacity-90">
                  {c.city ? `${c.city}, ${c.state}` : c.state}
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
