/**
 * GridPageShell — single source of truth for grid-page horizontal padding
 * + max width. Used by `/browse`, `/communities`, `/dashboard` (My
 * Listings), and `/dashboard/communities` (My Communities) so all four
 * surfaces share identical container chrome.
 *
 * Phase 47 (2026-06-21): introduced after owner reported `/dashboard` and
 * `/dashboard/communities` grids visually different from the buyer-facing
 * `/browse` and `/communities` grids — root cause was duplicated container
 * padding written in 4 different places (one of them via dashboard/layout
 * adding an extra wrapping <main> with max-w-6xl px-6 py-8).
 *
 * Phase 47.2 (2026-06-21): horizontal padding aligned with grid gap so the
 * card row reads as a uniform mesh — `px-1 md:px-1.5` matches GridFrame's
 * `gap-1 md:gap-1.5` (was `px-3 sm:px-6` which made the outer margin look
 * thicker than inter-card gutters).
 */

import type { ReactNode } from 'react';

export function GridPageShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-6xl px-1 pb-6 md:px-1.5">{children}</div>;
}
