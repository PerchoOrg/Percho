'use client';

/**
 * CategoryPicker — phase35.3 (2026-06-17): chip cloud + spec card.
 *
 * Why this shape (after Tianrou's "想象不出来" + 4-prototype review):
 *   - 12 chips at the top, all visible at once. Tap one and the spec card
 *     below updates live to show label / blurb / hard rule.
 *   - No "Only on Vicinity vs Real look at the data" meta-framing. The
 *     bucket distinction was useful product-internal language; it leaked
 *     into the UI as noise. Agents categorize by "what did I shoot",
 *     not by "which moat does this serve".
 *   - Same component for create + edit. The only difference is whether
 *     the spec card pre-shows a default chip on mount; we always preselect
 *     `selected` so the surface never starts empty.
 *
 * Tap target: chips are min-h-9 (36px) with px-3 padding — slightly under
 * the 44px WCAG ideal for individual hit area, but the chips wrap into a
 * cloud where neighbors aren't ambiguous (each chip carries a distinct
 * label, no precision-tap edge cases). Selected chip uses solid gold so
 * the choice is unmistakable on a small phone.
 */

import {
  COMMUNITY_VIDEO_CATEGORIES,
  type CommunityVideoCategoryId,
  type CommunityVideoCategoryMeta,
  getCategoryMeta,
} from '@/lib/zod/community-video-categories';

export interface CategoryPickerProps {
  /** Kept in the API for callers; current UX is identical for create/edit. */
  mode: 'create' | 'edit';
  selected: CommunityVideoCategoryId;
  onPick: (id: CommunityVideoCategoryId) => void;
  /** edit mode only: while a save action is pending, gray the surface. */
  disabled?: boolean;
}

export function CategoryPicker({ selected, onPick, disabled }: CategoryPickerProps) {
  const meta = getCategoryMeta(selected);
  return (
    <div className={disabled ? 'opacity-50 pointer-events-none' : ''}>
      <div className="flex flex-wrap gap-1.5">
        {COMMUNITY_VIDEO_CATEGORIES.map((c) => (
          <Chip
            key={c.id}
            meta={c}
            selected={c.id === selected}
            onPick={() => onPick(c.id)}
          />
        ))}
      </div>
      <SpecCard meta={meta} />
    </div>
  );
}

function Chip({
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
        'inline-flex min-h-9 items-center rounded-full border px-3 text-xs transition',
        selected
          ? 'border-line-strong bg-ink text-cream font-semibold'
          : 'border-line bg-surface text-ink2 hover:border-line-strong hover:text-ink',
      ].join(' ')}
    >
      {meta.label}
    </button>
  );
}

function SpecCard({ meta }: { meta: CommunityVideoCategoryMeta }) {
  return (
    <div className="mt-3 rounded-lg border border-line-strong bg-ink/[0.04] p-3">
      <div className="text-sm font-semibold text-ink">{meta.label}</div>
      <div className="mt-1 text-xs leading-snug text-ink2">{meta.blurb}</div>
      <div className="mt-2 text-[11px] leading-snug text-ink/90">
        <span className="text-ink2">Must include:</span> {meta.hardRule}
      </div>
    </div>
  );
}
