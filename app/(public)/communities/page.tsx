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
      <header className="mb-6">
        <h1 className="font-semibold text-2xl text-cream tracking-tight">Communities</h1>
        <p className="mt-1 text-cream/60 text-sm">
          Walk the block, hear the morning rush, see what after-dark really looks like — twelve
          neighborhood stories per community.
        </p>
      </header>

      <CommunityGrid communities={communities} />
    </div>
  );
}
