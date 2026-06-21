/**
 * GridFrame — single source of truth for the 2/4-up TikTok-density grid
 * wrapper used by ListingGrid + CommunityGrid.
 *
 * Phase 47 (2026-06-21): extracted so changing column count / gap rules
 * happens in one place instead of 2.
 *
 * Density tokens (Phase 47.1, 2026-06-21): equal horizontal + vertical
 * gap — `grid-cols-2 gap-1 md:grid-cols-4 md:gap-1.5`. (Was `gap-x-1
 * gap-y-2 md:gap-x-1.5 md:gap-y-3` — owner asked for symmetric gaps so
 * the grid reads as a uniform mesh instead of horizontal stripes.)
 */

import type { ReactNode } from 'react';

export function GridFrame({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-1 md:grid-cols-4 md:gap-1.5">{children}</div>;
}
