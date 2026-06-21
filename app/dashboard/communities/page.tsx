/**
 * /dashboard/communities — agent-facing community list.
 *
 * Phase 17: per-row + Add video / Edit semantics; communities globally readable.
 * Phase 35.2 / 43.10: list → grid.
 * Phase 45.11 (2026-06-20): owner round 3 — reuse the canonical buyer-facing
 * CommunityGrid (3:4 frame, caption below image, `max-w-6xl px-3 sm:px-6`,
 * grid-cols-2 md:grid-cols-4) so /dashboard/communities matches /communities
 * pixel-for-pixel. Tap routes through to the editor instead of the public
 * community page (only for the agent dashboard surface — public uses /c/[slug]).
 *
 * V1 design choice (kept): communities are globally readable; agents see all,
 * RLS gates metadata edits to the creator.
 */


import { CommunityGrid } from '@/app/_components/CommunityGrid';
import { fetchCommunityListCards } from '@/lib/communities/list';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default async function CommunitiesListPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=%2Fdashboard%2Fcommunities');

  // We still want agent-side rows to deep-link to the editor, so we render
  // CommunityGrid through a wrapper that overrides the link target. Simpler:
  // CommunityGrid takes communities and links to /c/<slug>. For the dashboard
  // surface we map id-keyed editor links via a sibling overlay grid below.
  const cards = await fetchCommunityListCards();

  if (cards.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-3 sm:px-6 py-6 sm:py-8">
        <div className="rounded border border-dashed border-line bg-surface px-6 py-12 text-center">
          <p className="text-sm text-ink2">
            No communities yet.{' '}
            <Link href="/dashboard/communities/new" className="underline hover:text-ink">
              Create one
            </Link>{' '}
            to start adding schools and POIs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-3 pb-6 sm:px-6">
      {/* Agent-side reuses the canonical CommunityGrid card style. Phase 46:
        * tap routes to the new HubDetailShell editor at /dashboard/communities/[id]. */}
      <CommunityGrid
        communities={cards}
        hrefBuilder={(c) => `/dashboard/communities/${c.id}`}
      />
    </div>
  );
}
