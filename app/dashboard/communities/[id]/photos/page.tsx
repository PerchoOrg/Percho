/**
 * /dashboard/communities/[id]/photos — legacy redirect.
 *
 * per-community /photos was folded into /upload.
 * /upload itself was deleted; redirect direct
 * to the hub Media tab so old bookmarks/cached search results don't 404.
 */

import { redirect } from 'next/navigation';

export default async function CommunityPhotosRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/communities/${id}?tab=media`);
}
