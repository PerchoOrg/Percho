/**
 * /dashboard/communities — agent-facing community list.
 *
 * Phase 17: per-row + Add video / Edit semantics; communities globally readable.
 * Phase 35.2 / 43.10: list → grid.
 * Phase 45.11 (2026-06-20): reuse the canonical CommunityGrid for parity.
 * Phase 47 (2026-06-21): wraps in shared GridPageShell so /dashboard/communities
 * and /communities share identical container chrome (the dashboard layout
 * no longer adds its own max-w wrapper).
 *
 * V1 design choice (kept): communities are globally readable; agents see all,
 * RLS gates metadata edits to the creator.
 *
 * Phase 53 Phase B (2026-06-24): temporary timing instrumentation. Remove
 * after we've identified the perf bottleneck and shipped the fix.
 */

import { CommunityGrid } from '@/app/_components/CommunityGrid';
import { GridPageShell } from '@/app/_components/GridPageShell';
import { fetchCommunityListCards } from '@/lib/communities/list';
import { startTimer } from '@/lib/perf/timing';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CreateCommunityButton } from './CreateCommunityButton';

export default async function CommunitiesListPage() {
  const t = startTimer('dashboard-communities');
  const supabase = await createClient();
  t.mark('createClient');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  t.mark('auth');
  if (!user) redirect('/login?redirect=%2Fdashboard%2Fcommunities');

  const cards = await fetchCommunityListCards({ includeInactive: true });
  t.mark('fetchCards');
  t.end({ cardCount: cards.length });

  if (cards.length === 0) {
    return (
      <GridPageShell>
        <div className="rounded border border-dashed border-line bg-surface px-6 py-12 text-center">
          <p className="text-sm text-ink2">
            No communities yet. <CreateCommunityButton /> to start adding schools and POIs.
          </p>
        </div>
      </GridPageShell>
    );
  }

  return (
    <GridPageShell>
      <CommunityGrid communities={cards} hrefBuilder={(c) => `/dashboard/communities/${c.id}`} />
    </GridPageShell>
  );
}
