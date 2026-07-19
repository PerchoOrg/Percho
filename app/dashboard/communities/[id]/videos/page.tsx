/**
 * /dashboard/communities/[id]/videos — legacy redirect.
 *
 * per-community /videos was folded into /upload.
 * /upload itself was deleted; redirect direct
 * to the hub Media tab so old bookmarks/cached search results don't 404.
 */

import { redirect } from 'next/navigation';

export default async function CommunityVideosRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/communities/${id}?tab=media`);
}
