'use client';

/**
 * CommunityUploadShell — Phase 25 (2026-06-14); Phase 35.2 (2026-06-17)
 * swapped the inline 12-card grid for the shared <CategoryPicker> so the
 * create flow gets the mobile 2-step (bucket → category) treatment.
 *
 * Phase 45.16 (2026-06-20): accept `prefillFiles` from the URL `?prefill=`
 * bridge (UploadFAB → /communities/new → /upload). Photos auto-upload via
 * <CommunityPhotoPanel>; the first video gets handed to <VideoUploader>
 * via `initialFile` so the agent can confirm + start. We also auto-show
 * the prefill banner so it's obvious the FAB handoff worked.
 *
 * Owns the shared category state used by BOTH the video panel and the photo
 * panel below. Same category drives both uploads, so an agent can drop a
 * video and a stack of photos in one session without re-picking the
 * category twice.
 */

import {
  CommunityPhotoPanel,
  type CommunityPhotoRow,
} from '@/app/dashboard/communities/[id]/CommunityPhotoPanel';
import { type CommunityVideoCategoryId } from '@/lib/zod/community-video-categories';
import { useMemo, useState } from 'react';
import { CategoryPicker } from './CategoryPicker';
import {
  type CommunityOption,
  type CommunityVideoRow,
  CommunityVideoPanel,
} from './CommunityVideoPanel';

export function CommunityUploadShell({
  communityId,
  initialVideos,
  initialPhotos,
  availableCommunities,
  prefillFiles,
}: {
  communityId: string;
  initialVideos: CommunityVideoRow[];
  initialPhotos: CommunityPhotoRow[];
  availableCommunities: CommunityOption[];
  /** Phase 45.16: files lifted from upload-prefill-store by the bridge. */
  prefillFiles?: File[];
}) {
  const [category, setCategory] = useState<CommunityVideoCategoryId>('walk_the_block');

  // Split once on mount — videos go to <CommunityVideoPanel> as a single
  // initialFile (the uploader handles one at a time), photos go to the
  // photo panel for batch upload. Anything that's neither is dropped.
  const { firstVideo, photos } = useMemo(() => {
    const list = prefillFiles ?? [];
    const v = list.find((f) => f.type.startsWith('video/'));
    const p = list.filter((f) => f.type.startsWith('image/'));
    return { firstVideo: v, photos: p };
  }, [prefillFiles]);

  const queuedCount = (firstVideo ? 1 : 0) + photos.length;

  return (
    <div className="space-y-4">
      {queuedCount > 0 ? (
        <div className="rounded border border-line bg-surface px-4 py-3 text-sm text-ink2">
          <span className="font-medium text-ink">{queuedCount} file{queuedCount === 1 ? '' : 's'}</span>{' '}
          queued from your upload picker.{' '}
          {firstVideo ? 'Video is ready below — tap Start upload to confirm. ' : ''}
          {photos.length > 0 ? 'Photos are uploading automatically.' : ''}
        </div>
      ) : null}

      {/* Shared category picker — drives both video + photo upload below.
       * The picker now shows label / blurb / hard rule inline (chip cloud
       * + spec card), so we don't double up with our own callout box. */}
      <section className="rounded border border-line bg-surface p-4 sm:p-5">
        <div className="mb-3 text-sm font-medium text-ink">Category</div>
        <CategoryPicker mode="create" selected={category} onPick={setCategory} />
        <p className="mt-3 text-[11px] text-muted">
          Applies to both video and photos uploaded below.
        </p>
      </section>

      <CommunityVideoPanel
        communityId={communityId}
        initialVideos={initialVideos}
        category={category}
        availableCommunities={availableCommunities}
        prefillVideo={firstVideo}
      />

      <CommunityPhotoPanel
        communityId={communityId}
        initialPhotos={initialPhotos}
        category={category}
        prefillFiles={photos}
      />
    </div>
  );
}
