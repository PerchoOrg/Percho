'use client';

/**
 * LeadsLive — agent's lead inbox (Phase 67: table redesign).
 *
 * Layer 1 (initial): SSR-hydrated rows passed in via `initial`.
 * Layer 2 (Realtime): postgres_changes INSERT + UPDATE subscription on
 *   public.leads. RLS limits payloads to leads the calling agent can SELECT.
 * Layer 3 (polling fallback): every 8s, refetch the most-recent leads and
 *   merge by id (last-write-wins).
 *
 * Phase 67 redesign (table form):
 *   - Sticky column header: Name / Listing / Contact / Source / Received / ·
 *   - Listing column shows the listing address; community leads show "—"
 *     (community has no listing — its name lives in Source instead).
 *   - Contact column has both Email AND Phone icons side by side; each
 *     enabled only if the lead actually filled that field. Both auto-mark
 *     followed-up when clicked. The Mark ✓ toggle stays as the trailing
 *     action.
 *   - Source column shows the community name for community-routed leads
 *     (overrides the raw `source` string), and the lead's `source` tag
 *     for listing-routed leads (e.g. "listing-page").
 *   - Followed-up rows fade to opacity-55 (kept from Phase 49.2).
 */

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type LeadRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  source: string | null;
  notified_at: string | null;
  followed_up_at: string | null;
  created_at: string;
  listing_id: string | null;
  community_id: string | null;
  listings: {
    address: string | null;
    city: string | null;
    state: string | null;
    slug: string | null;
  } | null;
  communities: {
    name: string | null;
    slug: string | null;
  } | null;
};

type FilterKey = 'all' | 'open' | 'week' | 'pending';

const OPEN_DOT_COLOR = '#6b7a5a';

// Columns selected from `leads` joined with listings + communities. Kept as a
// constant so the SSR page, realtime refetch, and polling fallback agree.
const LEAD_SELECT =
  'id, name, email, phone, message, source, notified_at, followed_up_at, created_at, listing_id, community_id, listings(address, city, state, slug), communities(name, slug)';

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

function isThisWeek(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < 7 * 24 * 60 * 60 * 1000;
}

function buildMailto(l: LeadRow): string | null {
  if (!l.email) return null;
  const target = l.listings?.address ?? l.communities?.name ?? 'your inquiry';
  const firstName = l.name.split(' ')[0] ?? l.name;
  const subject = `Re: your inquiry about ${target}`;
  const body = `Hi ${firstName},\n\nThanks for reaching out about ${target}. I'd be glad to share more details and answer any questions.\n\nWhen would be a good time for a quick call or showing?\n\nBest,\n`;
  return `mailto:${encodeURIComponent(l.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function buildSms(l: LeadRow): string | null {
  if (!l.phone) return null;
  return `sms:${l.phone.replace(/[^+\d]/g, '')}`;
}

function sourceLabel(l: LeadRow): string {
  // Community leads: show the community name; the raw `source` field is
  // typically the literal string "community-feed" which doesn't help an
  // agent triage. Listing leads keep the raw source tag (e.g. "listing-page",
  // utm strings). Falls back to "—" when neither is present.
  if (l.community_id) return l.communities?.name ?? 'Community';
  return l.source ?? '—';
}

export function LeadsLive({ initial }: { initial: LeadRow[] }) {
  const [rows, setRows] = useState<LeadRow[]>(initial);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const merge = useCallback((incoming: LeadRow[]) => {
    setRows((prev) => {
      const byId = new Map(prev.map((r) => [r.id, r]));
      for (const r of incoming) byId.set(r.id, { ...byId.get(r.id), ...r });
      return [...byId.values()].sort((a, b) =>
        a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
      );
    });
  }, []);

  // Layer 2: Realtime
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('leads-inbox')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leads' },
        async (payload) => {
          const id = (payload.new as { id?: string }).id;
          if (!id) return;
          // biome-ignore lint/suspicious/noExplicitAny: stub generated types
          const { data } = (await (supabase as any)
            .from('leads')
            .select(LEAD_SELECT)
            .eq('id', id)
            .maybeSingle()) as { data: LeadRow | null };
          if (data) merge([data]);
        },
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, (payload) => {
        const next = payload.new as Partial<LeadRow> & { id?: string };
        if (!next.id) return;
        const existing = rowsRef.current.find((r) => r.id === next.id);
        if (!existing) return;
        merge([{ ...existing, ...next } as LeadRow]);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [merge]);

  // Layer 3: polling fallback
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    const tick = async () => {
      // biome-ignore lint/suspicious/noExplicitAny: stub generated types
      const { data } = (await (supabase as any)
        .from('leads')
        .select(LEAD_SELECT)
        .order('created_at', { ascending: false })
        .limit(50)) as { data: LeadRow[] | null };
      if (!cancelled && data) merge(data);
    };
    const id = setInterval(tick, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [merge]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'open' && r.followed_up_at) return false;
      if (filter === 'week' && !isThisWeek(r.created_at)) return false;
      if (filter === 'pending' && r.notified_at) return false;
      if (!q) return true;
      const addr = r.listings?.address ?? '';
      const city = r.listings?.city ?? '';
      const community = r.communities?.name ?? '';
      const hay =
        `${r.name} ${r.email ?? ''} ${r.phone ?? ''} ${r.message ?? ''} ${addr} ${city} ${community}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, filter]);

  const setFollowUp = useCallback(async (id: string, value: 'now' | null) => {
    // optimistic
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, followed_up_at: value === 'now' ? new Date().toISOString() : null }
          : r,
      ),
    );
    try {
      const res = await fetch(`/api/leads/${id}/follow-up`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) {
        // revert on failure
        // biome-ignore lint/suspicious/noExplicitAny: stub
        const supabase = createClient() as any;
        const { data } = await supabase
          .from('leads')
          .select('id, followed_up_at')
          .eq('id', id)
          .maybeSingle();
        if (data) {
          setRows((prev) =>
            prev.map((r) => (r.id === id ? { ...r, followed_up_at: data.followed_up_at } : r)),
          );
        }
      }
    } catch {
      // network error — leave optimistic state; polling fallback will reconcile
    }
  }, []);

  return (
    <div>
      {/* Controls */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
            All
          </Chip>
          <Chip active={filter === 'open'} onClick={() => setFilter('open')}>
            Awaiting follow-up
          </Chip>
          <Chip active={filter === 'week'} onClick={() => setFilter('week')}>
            This week
          </Chip>
          <Chip active={filter === 'pending'} onClick={() => setFilter('pending')}>
            Pending email
          </Chip>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            placeholder="Search name, email, listing, community…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink placeholder-cream/40 focus:border-line-strong focus:outline-none sm:w-72"
          />
          <a
            href="/api/leads/export"
            className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs text-ink2 hover:border-line-strong hover:text-ink"
            title="Download all leads as CSV"
          >
            Export CSV
          </a>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface px-8 py-16 text-center">
          <p className="text-sm text-ink2">
            {rows.length === 0
              ? 'No leads yet. When a buyer submits the form on a published listing, it will appear here in real time.'
              : 'No leads match this filter.'}
          </p>
        </div>
      ) : (
        // Phase 67: responsive layout.
        //   < sm  → stacked cards (header hidden — too cramped on phone)
        //   ≥ sm  → grid table with sticky column header
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div
            className="hidden sm:grid grid-cols-[10px_minmax(0,180px)_minmax(0,1fr)_auto_minmax(0,140px)_auto_auto] items-center gap-4 border-b border-line/60 bg-surface px-3 py-2 text-[11px] uppercase tracking-wide text-muted"
            role="row"
          >
            <span aria-hidden />
            <span>Name</span>
            <span>Listing</span>
            <span className="text-center">Contact</span>
            <span>Source</span>
            <span>Received</span>
            <span aria-hidden />
          </div>
          <ul>
            {filtered.map((l) => (
              <LeadItem
                key={l.id}
                lead={l}
                onMark={(value) => void setFollowUp(l.id, value)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 transition ${
        active
          ? 'bg-ink2/40 text-ink'
          : 'border border-line text-ink2 hover:border-line-strong hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

function LeadItem({
  lead,
  onMark,
}: {
  lead: LeadRow;
  onMark: (value: 'now' | null) => void;
}) {
  const open = !lead.followed_up_at;
  const listingAddr = lead.listings?.address ?? null;
  // Community leads have no listing column — show em-dash. Listing leads
  // without a resolvable address (legacy / deleted listing) show "(unknown)".
  const listingCell = lead.community_id
    ? '—'
    : (listingAddr ?? '(unknown listing)');
  const preview = lead.message ?? listingAddr ?? lead.communities?.name ?? '';
  const mailto = buildMailto(lead);
  const sms = buildSms(lead);

  return (
    <li
      className={`block sm:grid sm:grid-cols-[10px_minmax(0,180px)_minmax(0,1fr)_auto_minmax(0,140px)_auto_auto] sm:items-center sm:gap-4 border-t border-line/60 px-3 py-3 first:border-t-0 ${
        open ? '' : 'opacity-55'
      }`}
    >
      {/* MOBILE LAYOUT: stacked card. Hidden ≥ sm. */}
      <div className="sm:hidden">
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
            <Link
              href={`/dashboard/leads/${lead.id}`}
              prefetch={false}
              className={`block truncate text-sm hover:underline ${
                open ? 'font-medium text-ink' : 'text-ink2'
              }`}
              title={lead.name}
            >
              {lead.name}
            </Link>
            {/* Listing line (or community) */}
            <p className="truncate text-[11px] text-ink2" title={listingCell}>
              {lead.community_id
                ? (lead.communities?.name ?? 'Community')
                : listingCell}
            </p>
            {/* Source + received as small muted line */}
            <p className="text-[11px] text-muted">
              {sourceLabel(lead)} · {timeAgo(lead.created_at)}
            </p>
            {preview && preview !== listingCell ? (
              <p className="mt-1 truncate text-[11px] text-muted" title={preview}>
                {preview}
              </p>
            ) : null}
          </div>
          {/* Right-aligned action cluster */}
          <div className="flex shrink-0 items-center gap-1.5">
            {mailto ? (
              <a
                href={mailto}
                onClick={() => onMark('now')}
                aria-label={`Email ${lead.name}`}
                title={`Email ${lead.email}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink2 hover:border-ink/30 hover:bg-line/30 hover:text-ink"
              >
                <EmailIcon />
              </a>
            ) : null}
            {sms ? (
              <a
                href={sms}
                onClick={() => onMark('now')}
                aria-label={`Text ${lead.name}`}
                title={`Text ${lead.phone}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink2 hover:border-ink/30 hover:bg-line/30 hover:text-ink"
              >
                <SmsIcon />
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => onMark(open ? 'now' : null)}
              aria-label={open ? 'Mark as followed up' : 'Mark as new'}
              title={open ? 'Mark as followed up' : 'Mark as new'}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-ink2 hover:bg-line/30 hover:text-ink ${
                open ? 'border-line' : 'border-line bg-line/20'
              }`}
            >
              {open ? <CheckIcon /> : <UndoIcon />}
            </button>
          </div>
        </div>
      </div>

      {/* DESKTOP LAYOUT: grid row. Hidden < sm — uses contents so cells go straight into the parent grid. */}
      <div className="contents max-sm:hidden">
        {/* Status dot */}
        <span
          aria-hidden
          className="hidden sm:block h-2 w-2 rounded-full"
          style={
            open
              ? { backgroundColor: OPEN_DOT_COLOR }
              : { border: '1px solid rgba(49,49,49,0.2)' }
          }
        />
        {/* Name + preview */}
        <div className="hidden sm:block min-w-0">
          <Link
            href={`/dashboard/leads/${lead.id}`}
            prefetch={false}
            className={`block truncate text-sm hover:underline ${
              open ? 'font-medium text-ink' : 'text-ink2'
            }`}
            title={lead.name}
          >
            {lead.name}
          </Link>
          {preview ? (
            <p className="truncate text-[11px] text-muted" title={preview}>
              {preview}
            </p>
          ) : null}
        </div>
        {/* Listing */}
        <span
          className="hidden sm:block min-w-0 truncate text-sm text-ink2"
          title={listingCell}
        >
          {listingCell}
        </span>
        {/* Contact icons */}
        <div className="hidden sm:flex shrink-0 items-center gap-1.5">
          {mailto ? (
            <a
              href={mailto}
              onClick={() => onMark('now')}
              aria-label={`Email ${lead.name}`}
              title={`Email ${lead.email} (auto-marks as followed up)`}
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
              onClick={() => onMark('now')}
              aria-label={`Text ${lead.name}`}
              title={`Text ${lead.phone} (auto-marks as followed up)`}
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
        {/* Source */}
        <span
          className="hidden sm:block min-w-0 truncate text-xs text-ink2"
          title={sourceLabel(lead)}
        >
          {sourceLabel(lead)}
        </span>
        {/* Received */}
        <span className="hidden sm:block shrink-0 text-muted text-[11px] tabular-nums">
          {timeAgo(lead.created_at)}
        </span>
        {/* Mark toggle */}
        <button
          type="button"
          onClick={() => onMark(open ? 'now' : null)}
          aria-label={open ? 'Mark as followed up' : 'Mark as new'}
          title={open ? 'Mark as followed up' : 'Mark as new'}
          className={`hidden sm:inline-flex h-7 w-7 items-center justify-center rounded-full border text-ink2 hover:bg-line/30 hover:text-ink ${
            open ? 'border-line' : 'border-line bg-line/20'
          }`}
        >
          {open ? <CheckIcon /> : <UndoIcon />}
        </button>
      </div>
    </li>
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

function CheckIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function UndoIcon() {
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
      <path d="M3 7v6h6" />
      <path d="M3 13a9 9 0 1 0 3-7.7L3 8" />
    </svg>
  );
}
