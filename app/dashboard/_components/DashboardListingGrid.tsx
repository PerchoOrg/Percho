'use client';

/**
 * DashboardListingGrid — client wrapper around ListingGrid.
 *
 * Phase 47.13: removed All/Active/Inactive chips + sort dropdown
 * (felt abrupt sitting above the grid for an agent who only owns a
 * handful of listings). Replaced with a single search input that
 * filters by address — the only useful affordance once you have
 * 20+ listings. Empty input shows everything; no chrome otherwise.
 *
 * DashboardItem keeps `rawStatus / updatedAt / createdAt / viewCount`
 * for now so the upstream page.tsx mapping doesn't have to change,
 * even though only `address` is used here today.
 */

import { ListingGrid, type ListingGridItem } from '@/app/_components/ListingGrid';
import { useMemo, useState } from 'react';

export type DashboardItem = ListingGridItem & {
  rawStatus: string;
  updatedAt: string;
  createdAt: string;
  viewCount: number;
};

export function DashboardListingGrid({ items }: { items: DashboardItem[] }) {
  const [q, setQ] = useState('');

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((it) =>
      (it.address ?? '').toLowerCase().includes(needle),
    );
  }, [items, q]);

  return (
    <>
      <div className="mb-4">
        <label className="relative block">
          <span className="sr-only">Search your listings</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <circle cx="9" cy="9" r="5.5" />
            <path d="m13.5 13.5 3 3" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your listings by address"
            className="w-full rounded-full border border-line bg-surface py-2 pr-4 pl-9 text-[13px] text-ink placeholder:text-ink2 focus:border-ink2 focus:outline-none"
          />
        </label>
      </div>

      <ListingGrid
        items={view}
        emptyState={
          <div className="mx-auto max-w-md rounded-2xl border border-line border-dashed bg-surface px-8 py-16 text-center">
            <p className="text-ink2 text-sm">
              {q.trim()
                ? `No listings match “${q.trim()}”.`
                : 'No listings yet — tap + New listing to add one.'}
            </p>
          </div>
        }
      />
    </>
  );
}
