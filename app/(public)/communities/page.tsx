/**
 * /communities — buyer-facing community grid.
 *
 * refactored to use shared `fetchCommunityListCards`
 * + `CommunityGrid` so this page and `/browse?tab=communities` render
 * identical cards.
 *
 * wraps in shared GridPageShell so all four grid
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
