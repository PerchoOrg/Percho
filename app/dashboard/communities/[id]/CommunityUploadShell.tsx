'use client';

/**
 * CommunityUploadShell — Phase 25 (2026-06-14).
 *
 * Owns the shared category state used by BOTH the video panel and the photo
 * panel below. Replaces each panel's internal category picker with a single
 * dropdown at the top of the page. Same category drives both uploads, so an
 * agent can drop a video and a stack of photos in one session without
 * re-picking the category twice.
 */

import {
  CommunityPhotoPanel,
  type CommunityPhotoRow,
} from '@/app/dashboard/communities/[id]/CommunityPhotoPanel';
import { CommunityVideoPanel, type CommunityVideoRow } from './CommunityVideoPanel';
import {
  COMMUNITY_VIDEO_CATEGORIES,
  type CommunityVideoCategoryId,
  getCategoryMeta,
} from '@/lib/zod/community-video-categories';
import { useState } from 'react';

const BUCKET_A = COMMUNITY_VIDEO_CATEGORIES.filter((c) => c.bucket === 'a');
const BUCKET_B = COMMUNITY_VIDEO_CATEGORIES.filter((c) => c.bucket === 'b');

export function CommunityUploadShell({
  communityId,
  initialVideos,
  initialPhotos,
}: {
  communityId: string;
  initialVideos: CommunityVideoRow[];
  initialPhotos: CommunityPhotoRow[];
}) {
  const [category, setCategory] = useState<CommunityVideoCategoryId>('walk_the_block');
  const meta = getCategoryMeta(category);

  return (
    <div className="space-y-4">
      {/* Shared category picker — drives both video + photo upload below. */}
      <section className="rounded border border-bronze/30 bg-ink2 p-5">
        <label htmlFor="cu-category" className="mb-2 block text-sm font-medium text-cream">
          Category
        </label>
        <select
          id="cu-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as CommunityVideoCategoryId)}
          className="w-full rounded border border-bronze/30 bg-ink px-3 py-2 text-sm text-cream focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
        >
          <optgroup label="Only on Vicinity — scarce content nobody else has">
            {BUCKET_A.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} — {c.blurb}
              </option>
            ))}
          </optgroup>
          <optgroup label="Real look at the data — visceral layer over Zillow numbers">
            {BUCKET_B.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} — {c.blurb}
              </option>
            ))}
          </optgroup>
        </select>
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
      />

      <CommunityPhotoPanel
        communityId={communityId}
        initialPhotos={initialPhotos}
        category={category}
      />
    </div>
  );
}
