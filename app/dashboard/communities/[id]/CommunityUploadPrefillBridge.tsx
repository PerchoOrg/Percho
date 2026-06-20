'use client';

/**
 * CommunityUploadPrefillBridge — Phase 45.16 (2026-06-20).
 *
 * Twin of PhotoPanelPrefillBridge for the community /upload page. Reads
 * `?prefill=<id>` from the URL once, pulls the File[] out of the
 * upload-prefill-store, and hands the list to <CommunityUploadShell>,
 * which splits it into video vs photos and feeds the appropriate panels.
 *
 * Why a bridge: /upload is a server component (it does Supabase reads),
 * and the prefill store is a client-bundle Map. The bridge is the seam
 * so the page can stay server-rendered while still consuming the FAB
 * handoff.
 */
import { consumePrefill } from '@/app/_components/upload-prefill-store';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { CommunityPhotoRow } from './CommunityPhotoPanel';
import { CommunityUploadShell } from './CommunityUploadShell';
import type { CommunityOption, CommunityVideoRow } from './CommunityVideoPanel';

export function CommunityUploadPrefillBridge({
  communityId,
  initialVideos,
  initialPhotos,
  availableCommunities,
}: {
  communityId: string;
  initialVideos: CommunityVideoRow[];
  initialPhotos: CommunityPhotoRow[];
  availableCommunities: CommunityOption[];
}) {
  const searchParams = useSearchParams();
  // Lazy-init so consumePrefill (one-shot) runs exactly once even under
  // React StrictMode double-mount in dev.
  const [prefillFiles] = useState<File[] | null>(() => {
    const id = searchParams?.get('prefill');
    if (!id) return null;
    return consumePrefill(id);
  });
  return (
    <CommunityUploadShell
      communityId={communityId}
      initialVideos={initialVideos}
      initialPhotos={initialPhotos}
      availableCommunities={availableCommunities}
      prefillFiles={prefillFiles ?? undefined}
    />
  );
}
