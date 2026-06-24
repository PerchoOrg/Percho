/**
 * Dashboard /leads/[id] — Phase 5.6.
 *
 * Detail view for a single lead. RLS scopes the result to the agent's own
 * leads — if the row doesn't exist (or doesn't belong to this agent), we 404.
 *
 * Includes a "Reply by email" mailto: shortcut that pre-fills subject + body
 * referencing the listing address. Phone leads get a tel: link instead.
 */

import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { FollowUpToggle } from './follow-up-toggle';

interface PageProps {
  params: Promise<{ id: string }>;
}

type LeadDetail = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  source: string | null;
  notified_at: string | null;
  followed_up_at: string | null;
  created_at: string;
  listing_id: string;
  listings: {
    address: string | null;
    city: string | null;
    state: string | null;
    slug: string | null;
  } | null;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  // Phase 53D: getSession() reads cookie locally (~5ms) instead of round-tripping
  // to Supabase to validate the JWT (~150ms). Middleware re-validates on each
  // request — page-level check is defense-in-depth, not the source of truth.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) redirect('/login');

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: lead } = (await (supabase as any)
    .from('leads')
    .select(
      'id, name, email, phone, message, source, notified_at, followed_up_at, created_at, listing_id, listings(address, city, state, slug)',
    )
    .eq('id', id)
    .maybeSingle()) as { data: LeadDetail | null };

  if (!lead) notFound();

  const addr = lead.listings?.address ?? '(unknown listing)';
  const cityState =
    lead.listings?.city && lead.listings?.state
      ? `${lead.listings.city}, ${lead.listings.state}`
      : '';

  // Pre-filled mailto. Subject + body reference the listing.
  const subject = `Re: your inquiry about ${addr}`;
  const body = `Hi ${lead.name.split(' ')[0] ?? lead.name},\n\nThanks for reaching out about ${addr}${cityState ? `, ${cityState}` : ''}. I'd be glad to share more details and answer any questions.\n\nWhen would be a good time for a quick call or showing?\n\nBest,\n`;
  const mailto =
    lead.email != null
      ? `mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent(
          subject,
        )}&body=${encodeURIComponent(body)}`
      : null;
  const tel = lead.phone != null ? `tel:${lead.phone.replace(/[^+\d]/g, '')}` : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/dashboard/leads"
        className="mb-4 inline-block text-xs text-ink2 hover:text-ink"
      >
        ← All leads
      </Link>

      <div className="rounded-2xl border border-line bg-surface p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{lead.name}</h1>
            <p className="mt-1 text-sm text-ink2">{formatDate(lead.created_at)}</p>
          </div>
          <span
            className={`rounded border px-2 py-0.5 text-[10px] font-medium uppercase ${
              lead.followed_up_at != null
                ? 'border-line bg-surface/5 text-ink2'
                : lead.notified_at != null
                  ? 'border-line-strong bg-ink/15 text-ink'
                  : 'border-line bg-ink2/10 text-ink2'
            }`}
          >
            {lead.followed_up_at != null
              ? 'Followed up'
              : lead.notified_at != null
                ? 'New'
                : 'Email pending'}
          </span>
        </div>

        <dl className="grid grid-cols-[120px_1fr] gap-y-3 text-sm">
          <dt className="text-muted">Listing</dt>
          <dd>
            {lead.listings?.slug ? (
              <Link
                href={`/dashboard/listings/${lead.listing_id}/edit`}
                className="text-ink hover:underline"
              >
                {addr}
              </Link>
            ) : (
              <span>{addr}</span>
            )}
            {cityState ? <span className="text-ink2"> · {cityState}</span> : null}
          </dd>

          {lead.email ? (
            <>
              <dt className="text-muted">Email</dt>
              <dd>
                <a href={`mailto:${lead.email}`} className="text-ink hover:underline">
                  {lead.email}
                </a>
              </dd>
            </>
          ) : null}

          {lead.phone ? (
            <>
              <dt className="text-muted">Phone</dt>
              <dd>
                <a href={`tel:${lead.phone}`} className="text-ink hover:underline">
                  {lead.phone}
                </a>
              </dd>
            </>
          ) : null}

          {lead.source ? (
            <>
              <dt className="text-muted">Source</dt>
              <dd className="text-ink2">{lead.source}</dd>
            </>
          ) : null}
        </dl>

        {lead.message ? (
          <div className="mt-6 rounded border border-line bg-bg p-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted">Message</p>
            <p className="whitespace-pre-wrap text-sm text-ink2">{lead.message}</p>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          {mailto ? (
            <a
              href={mailto}
              className="rounded bg-ink px-4 py-2 text-sm font-semibold text-cream hover:bg-ink/90"
            >
              Reply by email
            </a>
          ) : null}
          {tel ? (
            <a
              href={tel}
              className="rounded border border-line px-4 py-2 text-sm text-ink hover:bg-ink2/20"
            >
              Call
            </a>
          ) : null}
          <FollowUpToggle leadId={lead.id} initialFollowedUpAt={lead.followed_up_at} />
        </div>
      </div>
    </div>
  );
}
