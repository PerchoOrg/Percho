/**
 * /dashboard/listings/[id]/analytics — legacy redirect.
 *
 * Analytics moved inline into the edit hub as a tab. This route now
 * permanently redirects to /dashboard/listings/[id]/edit?tab=analytics
 * so any old bookmarks / shared links still land on the right view.
 */

import { permanentRedirect, redirect } from 'next/navigation';

export default async function ListingAnalyticsRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  permanentRedirect(`/dashboard/listings/${id}/edit?tab=analytics`);
  // Unreachable — keep TS happy.
  redirect(`/dashboard/listings/${id}/edit?tab=analytics`);
}
