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
import Link from 'next/link';
import { fetchCommunityListCards } from '@/lib/communities/list';
import { getViewerAgentId } from '@/lib/auth/viewer';
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
  const [sessionRes, agentId] = await Promise.all([
    supabase.auth.getSession(),
    getViewerAgentId(),
  ]);
  t.mark('auth');

  if (!sessionRes.data.session) redirect('/login?redirect=%2Fdashboard%2Fcommunities');

  // Phase 72.2 (2026-07-05): only the viewer's own inactive communities
  // show up alongside the active ones. Other agents' drafts stay hidden.
  const cards = await fetchCommunityListCards({ viewerAgentId: agentId });
  t.mark('cards');

  t.end({ cardCount: cards.length });

  if (cards.length === 0) {
    return (
      <GridPageShell>
        <EmptyHubState
          icon={<Building2 size={24} strokeWidth={1.6} aria-hidden />}
          headline="No neighborhoods yet"
          sub="Create your first neighborhood, or claim one from the seeded pool."
          cta={
            <div className="flex flex-col items-center gap-2">
              <CreateCommunityButton />
              <Link
                href="/dashboard/communities/claim"
                className="text-sm text-cream/70 underline underline-offset-4 hover:text-cream"
              >
                Browse unclaimed neighborhoods →
              </Link>
            </div>
          }
        />
      </GridPageShell>
    );
  }

  return (
    <GridPageShell>
      <div className="mb-4 flex justify-end">
        <Link
          href="/dashboard/communities/claim"
          className="rounded-md border border-cream/15 bg-ink/40 px-3 py-1.5 text-sm text-cream/80 transition hover:border-bronze hover:text-cream"
        >
          Browse unclaimed →
        </Link>
      </div>
      <CommunityGrid communities={cards} hrefBuilder={(c) => `/dashboard/communities/${c.id}`} />
    </GridPageShell>
  );
}
