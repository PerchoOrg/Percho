'use client';

/**
 * ListingLeadsRows — client-side row UI for the listing-edit leads panel.
 *
 * Lifted out of the server component (`ListingLeadsPanel.tsx`) because
 * rows use onClick handlers (stopPropagation on Email/SMS icons so the
 * row-overlay link doesn't intercept), and server components can't ship
 * event handlers. No state — purely presentational.
 */

import Link from 'next/link';

export type ListingLeadRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  followed_up_at: string | null;
  created_at: string;
};

const OPEN_DOT_COLOR = '#6b7a5a';

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

export function ListingLeadsRows({ leads }: { leads: ListingLeadRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line/60">
      {/* Desktop column header */}
      <div
        className="hidden sm:grid grid-cols-[10px_minmax(0,200px)_minmax(0,1fr)_auto_auto_auto] items-center gap-4 border-b border-line/60 bg-bg/40 px-3 py-2 text-[11px] uppercase tracking-wide text-muted"
        role="row"
      >
        <span aria-hidden />
        <span>Name</span>
        <span>Message</span>
        <span className="text-center">Contact</span>
        <span>Source</span>
        <span>Received</span>
      </div>
      <ul>
        {leads.map((l) => {
          const open = !l.followed_up_at;
          const sms = l.phone ? `sms:${l.phone.replace(/[^+\d]/g, '')}` : null;
          const mailto = l.email ? `mailto:${l.email}` : null;
          return (
            <li
              key={l.id}
              className={`relative block sm:grid sm:grid-cols-[10px_minmax(0,200px)_minmax(0,1fr)_auto_auto_auto] sm:items-center sm:gap-4 border-t border-line/60 px-3 py-3 first:border-t-0 hover:bg-line/15 ${
                open ? '' : 'opacity-55'
              }`}
            >
              <Link
                href={`/dashboard/leads/${l.id}`}
                prefetch={false}
                aria-hidden
                tabIndex={-1}
                className="absolute inset-0 z-0"
              >
                <span className="sr-only">Open lead {l.name}</span>
              </Link>

              {/* MOBILE */}
              <div className="sm:hidden relative z-10 pointer-events-none">
                <div className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={
                      open
                        ? { backgroundColor: OPEN_DOT_COLOR }
                        : { border: '1px solid rgba(49,49,49,0.2)' }
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm ${
                        open ? 'font-medium text-ink' : 'text-ink2'
                      }`}
                      title={l.name}
                    >
                      {l.name}
                    </span>
                    {l.message ? (
                      <p
                        className="line-clamp-1 text-[11px] text-ink2"
                        title={l.message}
                      >
                        {l.message}
                      </p>
                    ) : null}
                    <p className="text-[11px] text-muted">
                      Listing · {timeAgo(l.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 pointer-events-auto">
                    {mailto ? (
                      <a
                        href={mailto}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Email ${l.name}`}
                        title={`Email ${l.email}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink2 hover:border-ink/30 hover:bg-line/30 hover:text-ink"
                      >
                        <EmailIcon />
                      </a>
                    ) : null}
                    {sms ? (
                      <a
                        href={sms}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Text ${l.name}`}
                        title={`Text ${l.phone}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink2 hover:border-ink/30 hover:bg-line/30 hover:text-ink"
                      >
                        <SmsIcon />
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* DESKTOP */}
              <div className="contents max-sm:hidden">
                <span
                  aria-hidden
                  className="hidden sm:block relative z-10 pointer-events-none h-2 w-2 rounded-full"
                  style={
                    open
                      ? { backgroundColor: OPEN_DOT_COLOR }
                      : { border: '1px solid rgba(49,49,49,0.2)' }
                  }
                />
                <span
                  className={`hidden sm:block relative z-10 pointer-events-none truncate text-sm ${
                    open ? 'font-medium text-ink' : 'text-ink2'
                  }`}
                  title={l.name}
                >
                  {l.name}
                </span>
                <span
                  className="hidden sm:block relative z-10 pointer-events-none min-w-0 truncate text-sm text-ink2"
                  title={l.message ?? ''}
                >
                  {l.message ?? ''}
                </span>
                <div className="hidden sm:flex relative z-10 shrink-0 items-center gap-1.5">
                  {mailto ? (
                    <a
                      href={mailto}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Email ${l.name}`}
                      title={`Email ${l.email}`}
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
                  {sms ? (
                    <a
                      href={sms}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Text ${l.name}`}
                      title={`Text ${l.phone}`}
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
                <span className="hidden sm:block relative z-10 pointer-events-none text-xs text-ink2">
                  Listing
                </span>
                <span className="hidden sm:block relative z-10 pointer-events-none shrink-0 text-muted text-[11px] tabular-nums">
                  {timeAgo(l.created_at)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
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
