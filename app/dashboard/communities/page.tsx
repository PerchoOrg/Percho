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
 * Phase 53 Phase C (2026-06-24): perf rewrite.
 *   - Auth check now uses `getSession()` (reads cookie, ~5ms) instead of
 *     `getUser()` (Supabase round-trip, ~150ms). The `/dashboard/*` matcher
 *     in middleware already redirects unauthenticated users; the page-level
 *     check is just a defensive belt-and-suspenders.
 *   - `fetchCommunityListCards` is now `unstable_cache`-backed (60s, tag
 *     'community-cards'); cache hit ≈ 5ms vs ~480ms uncached.
 *   - `auth` and `fetchCards` run in parallel because the cards query
 *     doesn't depend on the user (community data is globally readable).
 *
 * Timing instrumentation (Phase 53 Phase B) is kept for one more deploy so
 * we can confirm the cache hit/auth split numbers in prod, then remove.
 */

import { CommunityGrid } from '@/app/_components/CommunityGrid';
import { GridPageShell } from '@/app/_components/GridPageShell';
import { Building2 } from 'lucide-react';
import { fetchCommunityListCards } from '@/lib/communities/list';
import { startTimer } from '@/lib/perf/timing';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CreateCommunityButton } from './CreateCommunityButton';
import { EmptyHubState } from '@/app/_components/EmptyHubState';

export default async function CommunitiesListPage() {
  const t = startTimer('dashboard-communities');
  const supabase = await createClient();
  t.mark('createClient');

  // Auth and card fetch in parallel — cards don't depend on user (community
  // data is globally readable). getSession() reads the cookie locally; no
  // Supabase round-trip.
  const [sessionRes, cards] = await Promise.all([
    supabase.auth.getSession(),
    fetchCommunityListCards({ includeInactive: true }),
  ]);
  t.mark('parallel');

  if (!sessionRes.data.session) redirect('/login?redirect=%2Fdashboard%2Fcommunities');

  t.end({ cardCount: cards.length });

  if (cards.length === 0) {
    return (
      <GridPageShell>
        <EmptyHubState
          icon={<Building2 size={24} strokeWidth={1.6} aria-hidden />}
          headline="No communities yet"
          sub="Create your first community to start adding schools, POIs and tours."
          cta={<CreateCommunityButton />}
        />
      </GridPageShell>
    );
  }

  return (
    <GridPageShell>
      <CommunityGrid communities={cards} hrefBuilder={(c) => `/dashboard/communities/${c.id}`} />
    </GridPageShell>
  );
}
