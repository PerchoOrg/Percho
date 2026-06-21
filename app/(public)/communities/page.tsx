/**
 * /communities — buyer-facing community grid (Phase 27).
 *
 * Phase 34b (2026-06-17): refactored to use shared `fetchCommunityListCards`
 * + `CommunityGrid` so this page and `/browse?tab=communities` render
 * identical cards.
 *
 * Phase 47 (2026-06-21): wraps in shared GridPageShell so all four grid
 * surfaces share container chrome.
 */

import { CommunityGrid } from '@/app/_components/CommunityGrid';
import { GridPageShell } from '@/app/_components/GridPageShell';
import { fetchCommunityListCards } from '@/lib/communities/list';

export default async function CommunitiesGridPage() {
  const communities = await fetchCommunityListCards();

  return (
    <GridPageShell>
      <CommunityGrid communities={communities} />
    </GridPageShell>
  );
}
