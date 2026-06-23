/**
 * /dashboard/communities/[id]/upload — legacy redirect.
 *
 * Phase 50.12 (2026-06-23): the standalone upload page was folded into the
 * hub Media tab. This route now just forwards to `?tab=media`, preserving
 * any `?prefill=…` so the FAB handoff still works (CommunityMediaPanel
 * consumes the prefill there).
 */

import { redirect } from 'next/navigation';

export default async function CommunityUploadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const prefill = typeof sp.prefill === 'string' ? sp.prefill : null;
  const qs = new URLSearchParams({ tab: 'media' });
  if (prefill) qs.set('prefill', prefill);
  redirect(`/dashboard/communities/${id}?${qs.toString()}`);
}
