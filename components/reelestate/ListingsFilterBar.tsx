/**
 * ListingsFilterBar — sticky filter chips at the top of `/listings`.
 *
 * ref: docs/design/reelestate-teardown/.cron-plan.md → L3.2 (README §2.2)
 *
 * Scope (L3.2, UI only):
 *  - Sticky top strip on the mobile Properties list route.
 *  - Three pill chips: Price / Beds / Community, each with a caret glyph
 *    indicating a future dropdown affordance.
 *  - No functional filter wiring, no state, no popovers. Purely presentational
 *    scaffolding so the visual composition of §2.2 lands before behavior does.
 *  - Renders as a plain server component (no `'use client'`).
 *
 * The parent page controls the scroll container. This bar uses `sticky top-0`
 * so it pins to the top of the mobile viewport while the grid scrolls under it.
 * A `bg-bg/90` + `backdrop-blur-md` treatment keeps the near-black canvas
 * legible when tiles slide beneath.
 */
import { ChevronDown } from 'lucide-react';

const FILTERS = ['Price', 'Beds', 'Community'] as const;

export function ListingsFilterBar() {
  return (
    <div
      role="toolbar"
      aria-label="Listings filters"
      className="sticky top-0 z-30 -mx-3 border-b border-bg-border bg-bg/90 px-3 py-2 backdrop-blur-md"
    >
      <ul className="flex items-center gap-2">
        {FILTERS.map((label) => (
          <li key={label}>
            {/*
              L3.2 is UI-only: the chip is intentionally inert. No `onClick` is
              wired here so this file stays a server component (RSC forbids
              passing event handlers to host elements). Behavior lands later.
            */}
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-bg-border bg-bg-surface px-3 py-1.5 text-[13px] font-medium tracking-chip text-white/80 hover:border-cyan/40 hover:text-white"
            >
              <span>{label}</span>
              <ChevronDown className="h-3.5 w-3.5 text-white/50" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
