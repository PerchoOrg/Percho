'use client';

/**
 * CategoryPicker — phase50.8 (2026-06-23): dropdown + explanation card.
 *
 * Was a chip cloud (phase35.3). qiaoxux feedback: a 12-chip cloud takes a lot
 * of vertical space on mobile and is harder to scan than a labeled dropdown.
 * Switched to a native <select> with the spec card (label + blurb + hard
 * rule) underneath the field so the agent still sees what they're picking.
 *
 * Why native <select> (not a custom popover):
 *   - Mobile OS picker is the right control here — it's full-height, uses
 *     the OS's scroll/wheel idiom, and supports keyboard a11y for free.
 *   - Backed by the same COMMUNITY_VIDEO_CATEGORIES list, so adding a
 *     category still only touches one file.
 *
 * Same component for create + edit; the `mode` prop is preserved in the
 * API for callers but doesn't change the UI today.
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
  /**
   * Phase 50.11: when caller wants to side-by-side the dropdown with another
   * control (e.g. the Upload button on CommunityMediaPanel), the SpecCard
   * makes the Category column much taller than its sibling. `hideSpec` lets
   * the caller render the dropdown alone here and surface the SpecCard
   * separately via <CategorySpecCard meta={…} /> below the row.
   */
  hideSpec?: boolean;
}

export function CategoryPicker({ selected, onPick, disabled, hideSpec }: CategoryPickerProps) {
  const meta = getCategoryMeta(selected);
  return (
    <div className={disabled ? 'opacity-50 pointer-events-none' : ''}>
      <select
        value={selected}
        onChange={(e) => onPick(e.target.value as CommunityVideoCategoryId)}
        disabled={disabled}
        className="w-full rounded border border-line bg-bg px-3 py-2 text-sm text-ink focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
      >
        {COMMUNITY_VIDEO_CATEGORIES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      {hideSpec ? null : <CategorySpecCard meta={meta} />}
    </div>
  );
}

export function CategorySpecCard({ meta }: { meta: CommunityVideoCategoryMeta }) {
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
