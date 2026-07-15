/**
 * /dashboard/communities/claim — pool of unclaimed neighborhood seeds.
 *
 * Phase 83 (2026-07-15): renders every `communities` row where
 * `created_by IS NULL` (currently the 731 Nextdoor Atlanta seeds, plus any
 * future seed imports). One-click Claim = agent takes ownership → row
 * appears in their /dashboard/communities grid, editable like any organic
 * community.
 *
 * Uses the `communities_unclaimed_idx` partial index (migration 20260715115000)
 * for the WHERE created_by IS NULL scan.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getViewerAgentId } from '@/lib/auth/viewer';
import { ClaimGrid } from './ClaimGrid';

export const dynamic = 'force-dynamic';

export default async function ClaimCommunitiesPage() {
  const supabase = await createClient();
  const [sessionRes, agentId] = await Promise.all([
    supabase.auth.getSession(),
    getViewerAgentId(),
  ]);
  if (!sessionRes.data.session) redirect('/login?redirect=%2Fdashboard%2Fcommunities%2Fclaim');
  if (!agentId) redirect('/dashboard');

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: rows, error } = await (supabase as any)
    .from('communities')
    .select(
      'id, slug, name, city, state, description, hero_image_url, residents_count, avg_income, friendliness_score, attributes, source',
    )
    .is('created_by', null)
    .eq('source', 'nextdoor')
    .order('name', { ascending: true })
    .limit(1000);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-semibold text-cream">Claim a neighborhood</h1>
        <p className="mt-4 text-rose-400">Failed to load: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-cream">Claim a neighborhood</h1>
        <p className="mt-2 text-sm text-cream/70">
          {rows?.length ?? 0} unclaimed neighborhoods seeded from Nextdoor. Claim
          one to add photos, videos and POIs — you become the owner.
        </p>
      </header>
      <ClaimGrid rows={rows ?? []} />
    </div>
  );
}
