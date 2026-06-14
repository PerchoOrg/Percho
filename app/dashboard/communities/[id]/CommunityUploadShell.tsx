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
        <div className="mb-3 text-sm font-medium text-cream">Category</div>
        <div className="grid grid-cols-2 gap-3">
          <CategoryColumn
            heading="Only on Vicinity"
            subheading="Scarce content nobody else has"
            items={BUCKET_A}
            selected={category}
            onPick={setCategory}
          />
          <CategoryColumn
            heading="Real look at the data"
            subheading="Visceral layer over Zillow numbers"
            items={BUCKET_B}
            selected={category}
            onPick={setCategory}
          />
        </div>
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

function CategoryColumn({
  heading,
  subheading,
  items,
  selected,
  onPick,
}: {
  heading: string;
  subheading: string;
  items: readonly { id: CommunityVideoCategoryId; label: string; blurb: string }[];
  selected: CommunityVideoCategoryId;
  onPick: (id: CommunityVideoCategoryId) => void;
}) {
  return (
    <div>
      <div className="mb-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-gold">
          {heading}
        </div>
        <div className="text-[10px] text-cream/50">{subheading}</div>
      </div>
      <div className="space-y-1.5">
        {items.map((c) => {
          const isSel = selected === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c.id)}
              className={[
                'w-full rounded border px-2 py-1.5 text-left text-xs transition',
                isSel
                  ? 'border-gold bg-gold/10 text-cream'
                  : 'border-bronze/30 bg-ink text-cream/80 hover:border-gold/60 hover:text-cream',
              ].join(' ')}
            >
              <div className="font-medium leading-tight">{c.label}</div>
              <div className="mt-0.5 text-[10px] leading-tight text-cream/50">{c.blurb}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
