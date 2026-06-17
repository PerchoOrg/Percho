'use client';

/**
 * CommunityUploadShell — Phase 25 (2026-06-14); Phase 35.2 (2026-06-17)
 * swapped the inline 12-card grid for the shared <CategoryPicker> so the
 * create flow gets the mobile 2-step (bucket → category) treatment.
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
import { CategoryPicker } from './CategoryPicker';
import {
  CommunityVideoPanel,
  type CommunityOption,
  type CommunityVideoRow,
} from './CommunityVideoPanel';
import {
  type CommunityVideoCategoryId,
  getCategoryMeta,
} from '@/lib/zod/community-video-categories';
import { useState } from 'react';

export function CommunityUploadShell({
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
  const [category, setCategory] = useState<CommunityVideoCategoryId>('walk_the_block');
  const meta = getCategoryMeta(category);

  return (
    <div className="space-y-4">
      {/* Shared category picker — drives both video + photo upload below. */}
      <section className="rounded border border-bronze/30 bg-ink2 p-4 sm:p-5">
        <div className="mb-3 text-sm font-medium text-cream">Category</div>
        <CategoryPicker mode="create" selected={category} onPick={setCategory} />
        <div className="mt-3 rounded border border-gold/30 bg-gold/5 px-3 py-2 text-xs text-cream/80">
          <span className="font-medium text-gold">{meta.label}</span>
          <span className="text-cream/60"> — {meta.blurb}.</span>
          <div className="mt-1 text-[11px] text-cream/60">
            <span className="font-medium">Must include:</span> {meta.hardRule}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-cream/50">
          Applies to both video and photos uploaded below.
        </p>
      </section>

      <CommunityVideoPanel
        communityId={communityId}
        initialVideos={initialVideos}
        category={category}
        availableCommunities={availableCommunities}
      />

      <CommunityPhotoPanel
        communityId={communityId}
        initialPhotos={initialPhotos}
        category={category}
      />
    </div>
  );
}
