/**
 * ListingLeadsPanel — per-listing leads view embedded in the edit hub.
 *
 * Phase 67.2 (2026-06-27): aligned with the redesigned `/dashboard/leads`
 * inbox — column headers (≥ sm), clickable row navigates to lead detail,
 * Source column is the type enum ("Listing" — community leads never reach
 * this panel since the join is on `listing_id`), Email + SMS icon buttons
 * replace the old text pills. Listing column is omitted because every row
 * in this panel belongs to the same listing.
 *
 * Hybrid: server component fetches the rows; the row UI lives in a sibling
 * client component (`ListingLeadsPanel.client.tsx`) because rows have
 * onClick handlers (stopPropagation on action icons so the row-overlay
 * link doesn't intercept). Server components can't ship event handlers.
 *
 * RLS gates to agent-owned listings. No realtime — refreshes on hub
 * navigation, which is sufficient for this panel.
 */

import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ListingLeadsRows, type ListingLeadRow } from './ListingLeadsPanel.client';

export async function ListingLeadsPanel({ listingId }: { listingId: string }) {
  const supabase = await createClient();
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data } = (await (supabase as any)
    .from('leads')
    .select('id, name, email, phone, message, followed_up_at, created_at')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })
    .limit(50)) as { data: ListingLeadRow[] | null };

  const leads = data ?? [];

  if (leads.length === 0) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <div className="mx-auto max-w-md py-8 text-center">
          <p className="text-ink2 text-sm">No leads on this listing yet.</p>
          <p className="mt-1 text-muted text-xs">
            Leads from the public listing page will appear here in real time.
          </p>
          <Link
            href="/dashboard/leads"
            className="mt-4 inline-block text-[13px] text-ink underline-offset-2 hover:underline"
          >
            See all leads
          </Link>
        </div>
      </section>
    );
  }

  const openCount = leads.filter((l) => !l.followed_up_at).length;

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="text-base font-semibold">
          Leads
          <span className="ml-2 text-muted text-sm font-normal">
            {leads.length} total
            {openCount > 0 ? ` · ${openCount} awaiting follow-up` : ''}
          </span>
        </h2>
        <Link
          href="/dashboard/leads"
          className="text-muted text-xs underline-offset-2 hover:text-ink hover:underline"
        >
          See all leads →
        </Link>
      </div>
      <ListingLeadsRows leads={leads} />
    </section>
  );
}
