import type { CommunityListCard } from '@/lib/communities/list';
import { demoCoverFor } from '@/lib/demo-media';
/**
 * CommunityGrid — shared grid card for the buyer-facing communities surface.
 *
 * Used by `/browse` (Communities tab) and `/communities`. Each card is a
 * 9:16 cover with name + city/state + real counters (videos, listings).
 *
 * Phase 34b note (2026-06-17, V1 redo): no fake stats. If a field doesn't
 * exist in the schema yet, it doesn't render — when the migration ships
 * that adds rating / school / median, those badges are added then.
 */
import Link from 'next/link';

export function CommunityGrid({ communities }: { communities: CommunityListCard[] }) {
  if (communities.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-surface px-4 py-6 text-ink2 text-sm">
        No communities yet.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-3">
      {communities.map((c) => {
        // Phase 38 (2026-06-18): /communities grid was missing demo-media
        // override — agents who hadn't picked a cover got their real
        // bucket cover (or storefront photo) instead of the curated demo
        // luxury still. Wrap here like every other community surface does.
        const coverUrl = demoCoverFor(c.id, c.cover?.url ?? null);
        return (
          <li key={c.id}>
            <Link
              href={`/c/${c.slug}`}
              className="group relative block aspect-[9/16] overflow-hidden rounded-xl bg-surface ring-1 ring-line transition hover:ring-line-strong"
            >
              {coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverUrl}
                  alt={c.name}
                  className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-bronze/20 to-ink">
                  <span className="font-semibold text-3xl text-cream/70">{c.name.charAt(0)}</span>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink via-ink/80 to-transparent p-3 pt-10">
                <div className="font-medium text-cream text-sm leading-tight">{c.name}</div>
                <div className="mt-0.5 text-cream/75 text-[11px]">
                  {c.city ? `${c.city}, ${c.state}` : c.state}
                </div>
                {/* Real counters only — videos + active listings. */}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-cream/20 px-2 py-0.5 text-[10px] text-cream backdrop-blur">
                    {c.videoCount} {c.videoCount === 1 ? 'video' : 'videos'}
                  </span>
                  {c.listingCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-cream/15 px-2 py-0.5 text-[10px] text-cream/85 backdrop-blur">
                      {c.listingCount} {c.listingCount === 1 ? 'home' : 'homes'}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
