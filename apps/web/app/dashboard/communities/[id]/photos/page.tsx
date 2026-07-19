/**
 * /dashboard/communities/[id]/photos — legacy redirect.
 *
 * Phase 23 (2026-06-14): per-community /photos was folded into /upload.
 * Phase 50.15 (2026-06-23): /upload itself was deleted; redirect direct
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
