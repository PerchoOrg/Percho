'use client';

/**
 * CategoryPicker — Phase 35.2 (2026-06-17).
 *
 * One component, two modes — same cards reused.
 *
 *   mode="create" — first-pick flow on /upload.
 *     mobile: 2-step (bucket → category) so a 12-card list isn't overwhelming
 *             on a small screen. Bucket cards double as product education
 *             ("Only on Vicinity" vs "Real look at the data").
 *     ≥sm:    flat 2-column layout (existing UX), no step.
 *
 *   mode="edit" — re-categorize an already-uploaded video from the manage list.
 *     Always flat 2-section × 6-card layout, current selection highlighted.
 *     The agent already knows the taxonomy; making them re-walk the bucket
 *     step on every edit is a tax for no information gain.
 *
 * The card itself (label / blurb / hardRule) is shared between both modes.
 * Cards expose hardRule on tap-target so agents see the spec they must follow
 * before committing — the dropdown variant we considered would have hidden
 * this and silently degraded video quality.
 */

import {
  COMMUNITY_VIDEO_CATEGORIES,
  type CommunityVideoBucket,
  type CommunityVideoCategoryId,
  type CommunityVideoCategoryMeta,
  categoryBucket,
} from '@/lib/zod/community-video-categories';
import { useState } from 'react';

const BUCKET_A: readonly CommunityVideoCategoryMeta[] = COMMUNITY_VIDEO_CATEGORIES.filter(
  (c) => c.bucket === 'a',
);
const BUCKET_B: readonly CommunityVideoCategoryMeta[] = COMMUNITY_VIDEO_CATEGORIES.filter(
  (c) => c.bucket === 'b',
);

const BUCKET_HEADINGS: Record<CommunityVideoBucket, { title: string; subtitle: string }> = {
  a: {
    title: 'Only on Vicinity',
    subtitle: 'Scarce content nobody else has — the moat.',
  },
  b: {
    title: 'Real look at the data',
    subtitle: 'Visceral layer over Zillow / GreatSchools / Yelp.',
  },
};

export interface CategoryPickerProps {
  mode: 'create' | 'edit';
  selected: CommunityVideoCategoryId;
  onPick: (id: CommunityVideoCategoryId) => void;
  /** edit mode only: while a save action is pending, gray the card grid. */
  disabled?: boolean;
}

export function CategoryPicker(props: CategoryPickerProps) {
  if (props.mode === 'edit') {
    return <FlatGrid {...props} />;
  }
  return <CreateFlow {...props} />;
}

/* ─── create flow: mobile 2-step, desktop flat ───────────────────── */

function CreateFlow({ selected, onPick }: CategoryPickerProps) {
  const [step, setStep] = useState<'bucket' | 'category'>('bucket');
  const [activeBucket, setActiveBucket] = useState<CommunityVideoBucket>(categoryBucket(selected));

  function handleBucketPick(b: CommunityVideoBucket) {
    setActiveBucket(b);
    setStep('category');
  }

  return (
    <div>
      {/* Mobile: 2-step */}
      <div className="sm:hidden">
        {step === 'bucket' ? (
          <div className="space-y-2">
            <BucketCard
              bucket="a"
              onPick={() => handleBucketPick('a')}
              currentBucket={categoryBucket(selected)}
            />
            <BucketCard
              bucket="b"
              onPick={() => handleBucketPick('b')}
              currentBucket={categoryBucket(selected)}
            />
            <p className="pt-1 text-[11px] text-cream/50">
              Pick the kind of video first — we'll narrow to 6 categories on the next step.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setStep('bucket')}
              className="-ml-1 flex h-11 items-center gap-1 px-1 text-xs text-cream/70 hover:text-cream"
            >
              ← Back
              <span className="text-cream/40">·</span>
              <span className="text-cream/60">{BUCKET_HEADINGS[activeBucket].title}</span>
            </button>
            <div className="space-y-1.5">
              {(activeBucket === 'a' ? BUCKET_A : BUCKET_B).map((c) => (
                <CategoryCard
                  key={c.id}
                  meta={c}
                  selected={selected === c.id}
                  onPick={() => onPick(c.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      {/* Desktop: flat */}
      <div className="hidden sm:block">
        <FlatGrid mode="edit" selected={selected} onPick={onPick} />
      </div>
    </div>
  );
}

/* ─── flat grid (used by edit, and by desktop create) ────────────── */

function FlatGrid({ selected, onPick, disabled }: CategoryPickerProps) {
  return (
    <div className={['grid gap-3 sm:grid-cols-2', disabled ? 'opacity-50' : ''].join(' ')}>
      <CategoryColumn bucket="a" items={BUCKET_A} selected={selected} onPick={onPick} />
      <CategoryColumn bucket="b" items={BUCKET_B} selected={selected} onPick={onPick} />
    </div>
  );
}

function CategoryColumn({
  bucket,
  items,
  selected,
  onPick,
}: {
  bucket: CommunityVideoBucket;
  items: readonly CommunityVideoCategoryMeta[];
  selected: CommunityVideoCategoryId;
  onPick: (id: CommunityVideoCategoryId) => void;
}) {
  const head = BUCKET_HEADINGS[bucket];
  return (
    <div>
      <div className="mb-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-gold">
          {head.title}
        </div>
        <div className="text-[10px] text-cream/50">{head.subtitle}</div>
      </div>
      <div className="space-y-1.5">
        {items.map((c) => (
          <CategoryCard
            key={c.id}
            meta={c}
            selected={selected === c.id}
            onPick={() => onPick(c.id)}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── shared cards ───────────────────────────────────────────────── */

function BucketCard({
  bucket,
  onPick,
  currentBucket,
}: {
  bucket: CommunityVideoBucket;
  onPick: () => void;
  currentBucket: CommunityVideoBucket;
}) {
  const head = BUCKET_HEADINGS[bucket];
  const isCurrent = currentBucket === bucket;
  return (
    <button
      type="button"
      onClick={onPick}
      className={[
        'flex min-h-11 w-full items-start justify-between gap-3 rounded border px-3 py-3 text-left transition',
        isCurrent
          ? 'border-gold/60 bg-gold/5 text-cream'
          : 'border-bronze/30 bg-ink text-cream/90 hover:border-gold/60',
      ].join(' ')}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold leading-tight text-gold">{head.title}</div>
        <div className="mt-0.5 text-[11px] leading-snug text-cream/60">{head.subtitle}</div>
      </div>
      <span aria-hidden className="shrink-0 text-cream/40">
        →
      </span>
    </button>
  );
}

function CategoryCard({
  meta,
  selected,
  onPick,
}: {
  meta: CommunityVideoCategoryMeta;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={[
        'flex min-h-11 w-full items-start gap-2 rounded border px-2.5 py-2 text-left text-xs transition',
        selected
          ? 'border-gold bg-gold/10 text-cream'
          : 'border-bronze/30 bg-ink text-cream/85 hover:border-gold/60 hover:text-cream',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'mt-0.5 inline-block h-3 w-3 shrink-0 rounded-full border',
          selected ? 'border-gold bg-gold' : 'border-bronze/50',
        ].join(' ')}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-tight">{meta.label}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-cream/55">{meta.blurb}</span>
        <span className="mt-1 block text-[10px] leading-snug text-cream/45">
          <span className="text-cream/55">Must include:</span> {meta.hardRule}
        </span>
      </span>
    </button>
  );
}
