'use client';

/**
 * DashboardListingGrid — client wrapper around ListingGrid.
 *
 * Phase 47.14 (2026-06-21): removed the local search input added in 47.13.
 * Search lives in the global TopBar 🔍 (top-left); duplicating it here is
 * noise. Listings are shown straight in their server-supplied order; an
 * agent who needs filtering uses the global search which now includes
 * her own inactive items (see /search).
 *
 * DashboardItem keeps `rawStatus / updatedAt / createdAt / viewCount`
 * for now so the upstream page.tsx mapping doesn't have to change —
 * future surfaces (analytics tab, etc.) can still consume it.
 */

import { ListingGrid, type ListingGridItem } from '@/app/_components/ListingGrid';

export type DashboardItem = ListingGridItem & {
  rawStatus: string;
  updatedAt: string;
  createdAt: string;
  viewCount: number;
};

export function DashboardListingGrid({ items }: { items: DashboardItem[] }) {
  return (
    <ListingGrid
      items={items}
      emptyState={
        <div className="mx-auto max-w-md rounded-2xl border border-line border-dashed bg-surface px-8 py-16 text-center">
          <p className="text-ink2 text-sm">
            No listings yet — tap + New listing to add one.
          </p>
        </div>
      }
    />
  );
}
