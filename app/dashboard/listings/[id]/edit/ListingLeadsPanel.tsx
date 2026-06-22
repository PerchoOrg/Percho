/**
 * ListingLeadsPanel — per-listing leads view embedded in the edit hub.
 *
 * Phase 49.1 redesign (Leads V1 — Inbox):
 *   - Single-line per lead: status dot · name · message preview · time · icons.
 *     Mental model is Gmail / Apple Mail.
 *   - Sage dot = awaiting follow-up. Hollow dot + dimmed row = followed up.
 *   - Email/Text are circular icon buttons (no text labels) — quieter visual,
 *     same affordance.
 *   - "See all leads →" pinned to the right of the section header.
 *   - Section header: `N total · M awaiting follow-up` retained.
 *
 * Server component. Fetches leads scoped to one listing_id (RLS gates to
 * agent-owned listings). No realtime — refreshes on hub navigation, which
 * is sufficient for this panel.
 */

import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

type LeadRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  followed_up_at: string | null;
  created_at: string;
};

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

// Sage accent for the open-status dot. Hardcoded — Vicinity has no
// "accent" token (the legacy `accent` is aliased to ink; see tailwind config).
const OPEN_DOT_COLOR = '#6b7a5a';

export async function ListingLeadsPanel({ listingId }: { listingId: string }) {
  const supabase = await createClient();
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data } = (await (supabase as any)
    .from('leads')
    .select('id, name, email, phone, message, followed_up_at, created_at')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })
    .limit(50)) as { data: LeadRow[] | null };

  const leads = data ?? [];

  if (leads.length === 0) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Leads</h2>
          <Link
            href="/dashboard/leads"
            className="text-muted text-xs underline-offset-2 hover:text-ink hover:underline"
          >
            See all leads →
          </Link>
        </div>
        <div className="mx-auto max-w-md py-8 text-center">
          <p className="text-ink2 text-sm">No leads on this listing yet.</p>
          <p className="mt-1 text-muted text-xs">
            Leads from the public listing page will appear here in real time.
          </p>
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

      <ul className="divide-y divide-line/60">
        {leads.map((l) => {
          const open = !l.followed_up_at;
          const preview = l.message ?? l.email ?? l.phone ?? '';
          return (
            <li
              key={l.id}
              className={`grid grid-cols-[10px_minmax(0,140px)_1fr_auto_auto] items-center gap-3 py-2.5 sm:gap-4 ${
                open ? '' : 'opacity-55'
              }`}
            >
              {/* Status dot */}
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={
                  open
                    ? { backgroundColor: OPEN_DOT_COLOR }
                    : { border: '1px solid rgba(49,49,49,0.2)' }
                }
              />
              {/* Name */}
              <span
                className={`truncate text-sm ${open ? 'font-medium text-ink' : 'text-ink2'}`}
                title={l.name}
              >
                {l.name}
              </span>
              {/* Message preview */}
              <span className="truncate text-ink2 text-sm" title={preview}>
                {preview}
              </span>
              {/* Time */}
              <span className="shrink-0 text-muted text-[11px] tabular-nums">
                {timeAgo(l.created_at)}
              </span>
              {/* Icon actions */}
              <div className="flex shrink-0 items-center gap-1.5">
                {l.email ? (
                  <a
                    href={`mailto:${l.email}`}
                    aria-label={`Email ${l.name}`}
                    title="Email"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-line text-ink2 hover:border-ink/30 hover:bg-line/30 hover:text-ink"
                  >
                    <EmailIcon />
                  </a>
                ) : (
                  <span
                    aria-hidden
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-line/50 text-muted/50"
                    title="No email"
                  >
                    <EmailIcon />
                  </span>
                )}
                {l.phone ? (
                  <a
                    href={`sms:${l.phone.replace(/[^+\d]/g, '')}`}
                    aria-label={`Text ${l.name}`}
                    title="Text"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-line text-ink2 hover:border-ink/30 hover:bg-line/30 hover:text-ink"
                  >
                    <SmsIcon />
                  </a>
                ) : (
                  <span
                    aria-hidden
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-line/50 text-muted/50"
                    title="No phone"
                  >
                    <SmsIcon />
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EmailIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function SmsIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
