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
 */

import type { ReactNode } from 'react';

export function GridPageShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-6xl px-3 pb-6 sm:px-6">{children}</div>;
}
