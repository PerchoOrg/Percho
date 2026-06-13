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
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="font-serif text-3xl tracking-tight text-cream sm:text-4xl">Leads</h1>
        <p className="mt-1 text-xs text-cream/50">
          Buyer inquiries from your published listings, in real time.
        </p>
      </div>

      <LeadsLive initial={initial} />
    </div>
  );
}
