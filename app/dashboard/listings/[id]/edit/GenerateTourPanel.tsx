'use client';

/**
 * GenerateTourPanel — disabled "Create a home tour video" button on the
 * listing edit page (Media tab bottom).
 *
 * Phase 12 (2026-06-12). Interface-only:
 *   - Always disabled with "Coming soon" tooltip.
 *   - Wired to `POST /api/listings/[id]/generate-tour` so click flow is
 *     real (endpoint returns 501). Disabled = no fetch in production.
 *
 * Phase 48.1 (2026-06-22): renamed/relocated to Media tab bottom.
 * Phase 48.3 (2026-06-22): dropped speculative timeline ("Q4 2026") and
 * the eval-provider blurb — they aged poorly. Title and tooltip alone
 * carry the message.
 *
 * When implementation lands, flip `disabled` based on `photoCount >= 10`.
 */

import { Sparkles } from 'lucide-react';

export function GenerateTourPanel({ listingId: _listingId }: { listingId: string }) {
  return (
    <section className="rounded border border-line bg-surface p-6">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="font-semibold text-base">Create a home tour video from photos</h2>
        <span className="text-muted text-xs">Coming soon</span>
      </div>

      <p className="mb-4 text-ink2 text-sm leading-relaxed">
        Turn 10 listing photos into a 30-second home tour video.
      </p>

      <button
        type="button"
        disabled
        title="Coming soon"
        aria-disabled="true"
        className="inline-flex items-center gap-2 rounded-md border border-line bg-bg px-4 py-2 text-muted text-sm"
      >
        <Sparkles size={16} aria-hidden="true" />
        Create a home tour video
      </button>
    </section>
  );
}
