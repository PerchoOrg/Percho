'use client';

/**
 * DashboardListingGrid — client wrapper around ListingGrid.
 *
 * removed the local search input added in 47.13.
 * Search lives in the global TopBar 🔍 (top-left); duplicating it here is
 * noise. Listings are shown straight in their server-supplied order; an
 * agent who needs filtering uses the global search which now includes
 * her own inactive items (see /search).
 */

import { Home } from 'lucide-react';

import { EmptyHubState } from '@/app/_components/EmptyHubState';
import { ListingGrid, type ListingGridItem } from '@/app/_components/ListingGrid';
import { CreateListingButton } from './CreateListingButton';

export function DashboardListingGrid({ items }: { items: ListingGridItem[] }) {
  return (
    <ListingGrid
      items={items}
      emptyState={
        <EmptyHubState
          icon={<Home size={24} strokeWidth={1.6} aria-hidden />}
          headline="No listings yet"
          sub="Create your first listing to start uploading tours and collecting leads."
          cta={<CreateListingButton />}
        />
      }
    />
  );
}
