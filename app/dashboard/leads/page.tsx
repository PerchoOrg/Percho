/**
 * Dashboard /leads — Phase 5.5 + Phase 18.
 *
 * Server-side: fetch agent's leads (RLS scopes to own agent), hydrate as
 * `initialLeads` to the LeadsLive client component which subscribes to
 * Realtime INSERT/UPDATE + polls as fallback.
 *
 * Phase 18: drop the "← Listings" backlink (TopBar nav already covers it),
 * add followed_up_at to the select set so the client gets it on first paint.
 */


import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { type LeadRow, LeadsLive } from './leads-live';

export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
  const supabase = await createClient();
  // Phase 53D: getSession() reads cookie locally (~5ms) instead of round-tripping
  // to Supabase to validate the JWT (~150ms). Middleware re-validates on each
  // request — page-level check is defense-in-depth, not the source of truth.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) redirect('/login?redirect=%2Fdashboard%2Fleads');

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data } = (await (supabase as any)
    .from('leads')
    .select(
      'id, name, email, phone, message, source, notified_at, followed_up_at, created_at, listing_id, listings(address, city, state, slug)',
    )
    .order('created_at', { ascending: false })
    .limit(200)) as { data: LeadRow[] | null };

  const initial = data ?? [];

  return (
    <div className="mx-auto max-w-5xl px-5 py-6 sm:px-8 sm:py-12">
      {/* Phase 45 (2026-06-20): Workspace H1 + sub-nav chips removed —
       * the global TopBar pins Listings | Communities | Leads | Analytics
       * as sub-tabs (see app/_components/nav-config.ts → getSubTabs). */}
      {/* Phase 45.9 (2026-06-20): H1 + description removed per owner. */}
      <LeadsLive initial={initial} />
    </div>
  );
}
