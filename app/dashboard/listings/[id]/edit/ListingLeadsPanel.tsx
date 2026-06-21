/**
 * ListingLeadsPanel — per-listing leads view embedded in the edit hub
 * (Phase 47.7).
 *
 * Server component. Fetches leads scoped to one listing_id (RLS already
 * gates to agent-owned listings). Renders a compact list with the same
 * mailto/sms/follow-up affordances as the global /dashboard/leads inbox,
 * but without realtime/polling — this panel is mounted per page-view, so
 * a refresh on hub navigation is sufficient.
 *
 * If you need realtime here later, swap to the LeadsLive client component
 * with a listing_id filter.
 */

import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

type LeadRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  source: string | null;
  followed_up_at: string | null;
  created_at: string;
};

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export async function ListingLeadsPanel({ listingId }: { listingId: string }) {
  const supabase = await createClient();
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data } = (await (supabase as any)
    .from('leads')
    .select('id, name, email, phone, message, source, followed_up_at, created_at')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })
    .limit(50)) as { data: LeadRow[] | null };

  const leads = data ?? [];

  if (leads.length === 0) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <div className="mx-auto max-w-md py-8 text-center">
          <p className="text-ink2 text-sm">
            No leads on this listing yet.
          </p>
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

      <ul className="divide-y divide-line">
        {leads.map((l) => {
          const open = !l.followed_up_at;
          return (
            <li key={l.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{l.name}</span>
                  {open && (
                    <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink2">
                      New
                    </span>
                  )}
                  <span className="text-muted text-xs">{timeAgo(l.created_at)}</span>
                </div>
                {l.message && (
                  <p className="mt-1 line-clamp-2 text-ink2 text-sm">{l.message}</p>
                )}
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted text-xs">
                  {l.email && <span>{l.email}</span>}
                  {l.phone && <span>{l.phone}</span>}
                  {l.source && <span>via {l.source}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {l.email && (
                  <a
                    href={`mailto:${l.email}`}
                    className="rounded-full border border-line px-3 py-1 text-xs text-ink hover:bg-line/30"
                  >
                    Email
                  </a>
                )}
                {l.phone && (
                  <a
                    href={`sms:${l.phone.replace(/[^+\d]/g, '')}`}
                    className="rounded-full border border-line px-3 py-1 text-xs text-ink hover:bg-line/30"
                  >
                    Text
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
