/**
 * CommunityGrid — shared 2/3/4-column grid of community cards.
 *
 * Phase 34b (2026-06-17): rendered on `/communities` (full page) and
 * inside `/browse?tab=communities` (segmented control). Both surfaces
 * use the same query (`fetchCommunityListCards`) and the same card
 * markup, so the cards look identical wherever they appear.
 */
import Link from 'next/link';
import type { CommunityListCard } from '@/lib/communities/list';

export function CommunityGrid({ communities }: { communities: CommunityListCard[] }) {
  if (communities.length === 0) {
    return (
      <div className="rounded border border-bronze/30 border-dashed bg-ink2 px-6 py-12 text-center">
        <p className="text-cream/60 text-sm">No communities yet.</p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {communities.map((c) => (
        <li key={c.id}>
          <Link
            href={`/c/${c.slug}`}
            className="group relative block aspect-[9/16] overflow-hidden rounded-xl bg-ink2 ring-1 ring-bronze/30 transition hover:ring-gold/60"
          >
            {c.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.cover.url}
                alt={c.name}
                className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-bronze/20 to-ink">
                <span className="font-semibold text-3xl text-cream/30">{c.name.charAt(0)}</span>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink via-ink/80 to-transparent p-3 pt-10">
              <div className="font-medium text-cream text-sm leading-tight">{c.name}</div>
              <div className="mt-0.5 text-cream/60 text-[11px]">
                {c.city ? `${c.city}, ${c.state}` : c.state}
              </div>
              <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-gold/20 px-2 py-0.5 text-[10px] text-gold backdrop-blur">
                {c.videoCount} {c.videoCount === 1 ? 'video' : 'videos'}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
