'use client';

/**
 * CommunityPhotosTab — inline Photos manage panel for the Phase 46 hub
 * detail shell. Mirrors the photo half of /upload (CategoryPicker drives
 * uploads; CommunityPhotoPanel renders the existing gallery + dropzone).
 *
 * Lives client-side because both pieces are client components — the
 * server page hands us already-resolved `initialPhotos` (with signed URLs)
 * and we own the category state locally.
 */

import {
  CommunityPhotoPanel,
  type CommunityPhotoRow,
} from '@/app/dashboard/communities/[id]/CommunityPhotoPanel';
import type { CommunityVideoCategoryId } from '@/lib/zod/community-video-categories';
import { useState } from 'react';
import { CategoryPicker } from './CategoryPicker';

export function CommunityPhotosTab({
  communityId,
  initialPhotos,
}: {
  communityId: string;
  initialPhotos: CommunityPhotoRow[];
}) {
  const [category, setCategory] = useState<CommunityVideoCategoryId>('walk_the_block');

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="mb-3 text-sm font-medium text-ink">Category</div>
        <CategoryPicker mode="create" selected={category} onPick={setCategory} />
        <p className="mt-3 text-[11px] text-muted">
          New photos uploaded below get tagged with this category.
        </p>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <CommunityPhotoPanel
          communityId={communityId}
          initialPhotos={initialPhotos}
          category={category}
        />
      </section>
    </div>
  );
}
