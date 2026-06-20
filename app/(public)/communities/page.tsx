/**
 * /communities — buyer-facing community grid (Phase 27).
 *
 * Phase 34b (2026-06-17): refactored to use shared `fetchCommunityListCards`
 * + `CommunityGrid` so this page and `/browse?tab=communities` render
 * identical cards.
 */

import { CommunityGrid } from '@/app/_components/CommunityGrid';
import { fetchCommunityListCards } from '@/lib/communities/list';

export default async function CommunitiesGridPage() {
  const communities = await fetchCommunityListCards();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Phase 45.9 (2026-06-20): H1 + description removed per owner —
       * TopBar sub-tabs already label the active surface. */}
      <CommunityGrid communities={communities} />
    </div>
  );
}
