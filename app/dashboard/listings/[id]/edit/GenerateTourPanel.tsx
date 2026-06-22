'use client';

/**
 * GenerateTourPanel — disabled "Generate AI tour video" button on the
 * listing edit page.
 *
 * Phase 12 (2026-06-12). Interface-only:
 *   - Always disabled, with a tooltip explaining the feature is coming soon.
 *   - Wired to `POST /api/listings/[id]/generate-tour` so click flow is real.
 *     The endpoint returns 501; the panel surfaces that response gracefully.
 *   - The button stays disabled even on click; clicking the surrounding card
 *     calls the API once for verification (only in dev) — no, scrap that:
 *     keep it dead simple. Disabled = no fetch. The endpoint is exercised
 *     by smoke tests, not by end users.
 *
 * When implementation lands (Phase 12.b, post-V1), flip `disabled` based on
 * `photoCount >= 3` (photos arrive in Phase 10).
 */

import { Sparkles } from 'lucide-react';

export function GenerateTourPanel({ listingId: _listingId }: { listingId: string }) {
  return (
    <section className="rounded border border-line bg-surface p-6">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="font-semibold text-base">Create a home tour video from photos</h2>
        <span className="text-muted text-xs">Coming soon — Q4 2026</span>
      </div>

      <p className="mb-4 text-ink2 text-sm leading-relaxed">
        Turn 10 listing photos into a 30-second home tour video. We&apos;ll evaluate the best
        provider this fall — until then, upload a real walk- through video for full effect.
      </p>

      <button
        type="button"
        disabled
        title="Coming soon — Q4 2026"
        aria-disabled="true"
        className="inline-flex items-center gap-2 rounded-md border border-line bg-bg px-4 py-2 text-muted text-sm"
      >
        <Sparkles size={16} aria-hidden="true" />
        Generate AI tour video
      </button>
    </section>
  );
}
