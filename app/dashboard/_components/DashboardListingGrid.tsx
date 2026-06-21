'use client';

/**
 * DashboardListingGrid — client wrapper around ListingGrid that adds
 * filter chips (All / Active / Inactive) and a sort dropdown
 * (Recently updated / Newest / Most viewed). Phase 47.10.
 *
 * Filter and sort are pure client-side over the SSR-hydrated rows. We
 * never fall off the bottom of "200 listings", so no need for a server
 * round-trip on every chip click.
 */

import { ListingGrid, type ListingGridItem } from '@/app/_components/ListingGrid';
import { useMemo, useState } from 'react';

export type DashboardItem = ListingGridItem & {
  /** raw status: 'active' | 'inactive' */
  rawStatus: string;
  /** ISO timestamp for sorting */
  updatedAt: string;
  createdAt: string;
  /** snapshot view count for "Most viewed" sort */
  viewCount: number;
};

type FilterKey = 'all' | 'active' | 'inactive';
type SortKey = 'updated' | 'created' | 'views';

const FILTERS: Array<{ id: FilterKey; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'inactive', label: 'Inactive' },
];

const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: 'updated', label: 'Recently updated' },
  { id: 'created', label: 'Newest' },
  { id: 'views', label: 'Most viewed' },
];

export function DashboardListingGrid({ items }: { items: DashboardItem[] }) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('updated');

  const counts = useMemo(() => {
    const c = { all: items.length, active: 0, inactive: 0 };
    for (const it of items) {
      if (it.rawStatus === 'active') c.active += 1;
      else if (it.rawStatus === 'inactive') c.inactive += 1;
    }
    return c;
  }, [items]);

  const view = useMemo(() => {
    let rows = items;
    if (filter !== 'all') rows = rows.filter((it) => it.rawStatus === filter);
    rows = [...rows].sort((a, b) => {
      if (sort === 'views') return b.viewCount - a.viewCount;
      if (sort === 'created') return a.createdAt < b.createdAt ? 1 : -1;
      return a.updatedAt < b.updatedAt ? 1 : -1;
    });
    return rows;
  }, [items, filter, sort]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {FILTERS.map((f) => {
            const isActive = f.id === filter;
            const n = counts[f.id];
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${
                  isActive
                    ? 'bg-ink text-surface'
                    : 'text-ink2 hover:bg-line/40'
                }`}
              >
                {f.label}
                <span className={`ml-1.5 text-[11px] ${isActive ? 'opacity-80' : 'text-muted'}`}>
                  {n}
                </span>
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-muted text-xs">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-full border border-line bg-surface px-3 py-1 text-ink text-[13px]"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ListingGrid
        items={view}
        emptyState={
          <div className="mx-auto max-w-md rounded-2xl border border-line border-dashed bg-surface px-8 py-16 text-center">
            <p className="text-ink2 text-sm">
              {filter === 'all'
                ? 'No listings yet — tap + New listing to add one.'
                : `No ${filter} listings.`}
            </p>
          </div>
        }
      />
    </>
  );
}
