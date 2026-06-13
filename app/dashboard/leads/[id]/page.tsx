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
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
        className="mb-4 inline-block text-xs text-cream/60 hover:text-cream"
      >
        ← All leads
      </Link>

      <div className="rounded-2xl border border-bronze/30 bg-ink2 p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{lead.name}</h1>
            <p className="mt-1 text-sm text-cream/60">{formatDate(lead.created_at)}</p>
          </div>
          <span
            className={`rounded border px-2 py-0.5 text-[10px] font-medium uppercase ${
              lead.followed_up_at != null
                ? 'border-cream/20 bg-cream/5 text-cream/60'
                : lead.notified_at != null
                  ? 'border-gold/30 bg-gold/15 text-gold'
                  : 'border-bronze/40 bg-bronze/10 text-cream/70'
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
          <dt className="text-cream/50">Listing</dt>
          <dd>
            {lead.listings?.slug ? (
              <Link
                href={`/dashboard/listings/${lead.listing_id}/edit`}
                className="text-gold hover:underline"
              >
                {addr}
              </Link>
            ) : (
              <span>{addr}</span>
            )}
            {cityState ? <span className="text-cream/60"> · {cityState}</span> : null}
          </dd>

          {lead.email ? (
            <>
              <dt className="text-cream/50">Email</dt>
              <dd>
                <a href={`mailto:${lead.email}`} className="text-cream hover:underline">
                  {lead.email}
                </a>
              </dd>
            </>
          ) : null}

          {lead.phone ? (
            <>
              <dt className="text-cream/50">Phone</dt>
              <dd>
                <a href={`tel:${lead.phone}`} className="text-cream hover:underline">
                  {lead.phone}
                </a>
              </dd>
            </>
          ) : null}

          {lead.source ? (
            <>
              <dt className="text-cream/50">Source</dt>
              <dd className="text-cream/70">{lead.source}</dd>
            </>
          ) : null}
        </dl>

        {lead.message ? (
          <div className="mt-6 rounded border border-bronze/30 bg-ink p-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-cream/50">Message</p>
            <p className="whitespace-pre-wrap text-sm text-cream/90">{lead.message}</p>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          {mailto ? (
            <a
              href={mailto}
              className="rounded bg-gold px-4 py-2 text-sm font-semibold text-ink hover:bg-gold/90"
            >
              Reply by email
            </a>
          ) : null}
          {tel ? (
            <a
              href={tel}
              className="rounded border border-bronze/50 px-4 py-2 text-sm text-cream hover:bg-bronze/20"
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
