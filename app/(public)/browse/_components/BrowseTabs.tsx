/**
 * BrowseTabs — segmented control between Homes and Communities on /browse.
 *
 * Phase 34b (2026-06-17, Scenario B entry): adds an "active buyer" lane to
 * /browse so people who haven't anchored on a listing yet can pick an area
 * first. Default tab is `homes` (existing behavior). The Communities tab
 * shows the same grid as /communities — both routes share the data fetch
 * and the card component, so cards look identical.
 *
 * State is reflected in the `?tab=` URL param so back-button + share-link
 * preserve the lane. Implemented as a client component because clicking
 * it shouldn't reload the page.
 */
'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export type BrowseTab = 'homes' | 'communities';

export function BrowseTabs({ active }: { active: BrowseTab }) {
  const router = useRouter();
  const params = useSearchParams();

  const setTab = (tab: BrowseTab) => {
    const next = new URLSearchParams(params?.toString());
    if (tab === 'homes') next.delete('tab');
    else next.set('tab', tab);
    const qs = next.toString();
    router.replace(qs ? `/browse?${qs}` : '/browse', { scroll: false });
  };

  return (
    <div className="mx-auto mb-3 flex max-w-xs gap-1 rounded-full bg-ink2 p-1 ring-1 ring-cream/10 md:hidden">
      <button
        type="button"
        onClick={() => setTab('homes')}
        className={`flex h-9 flex-1 items-center justify-center rounded-full font-medium text-xs transition ${
          active === 'homes' ? 'bg-gold text-ink' : 'text-cream/70 hover:text-cream'
        }`}
        aria-pressed={active === 'homes'}
      >
        Homes
      </button>
      <button
        type="button"
        onClick={() => setTab('communities')}
        className={`flex h-9 flex-1 items-center justify-center rounded-full font-medium text-xs transition ${
          active === 'communities' ? 'bg-gold text-ink' : 'text-cream/70 hover:text-cream'
        }`}
        aria-pressed={active === 'communities'}
      >
        Communities
      </button>
    </div>
  );
}
