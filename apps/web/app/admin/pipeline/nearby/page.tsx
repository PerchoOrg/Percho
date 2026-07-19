/**
 * /admin/pipeline/nearby — legacy fork point.
 *
 * Phase 104 (2026-07-17): Nearby was split into two peer tabs:
 * /admin/pipeline/listing-nearby (Home) and
 * /admin/pipeline/community-nearby (Neighborhood). The unified
 * `?scope=` index is gone; this stub catches any lingering bookmarks
 * and routes to the Home variant by default. Neighborhood links
 * (`?scope=neighborhood`) redirect to their new home too.
 */

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function NearbyRedirect({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const { scope } = await searchParams;
  if (scope === 'neighborhood') redirect('/admin/pipeline/community-nearby');
  redirect('/admin/pipeline/listing-nearby');
}
