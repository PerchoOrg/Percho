'use client';

/**
 * LeadsLive — agent's lead inbox (Phase 49.2: V1 Inbox redesign).
 *
 * Layer 1 (initial): SSR-hydrated rows passed in via `initial`.
 * Layer 2 (Realtime): postgres_changes INSERT + UPDATE subscription on
 *   public.leads. RLS limits payloads to leads the calling agent can SELECT.
 * Layer 3 (polling fallback): every 8s, refetch the most-recent leads and
 *   merge by id (last-write-wins).
 *
 * Phase 49.2 redesign (V1 — Inbox):
 *   - 4-stat strip dropped. The chips below carry the same info implicitly.
 *   - Filter chips lose their "(N)" counts — pills only. The chip itself
 *     filters; the count was visual noise.
 *   - Search box + Export CSV kept (right side of controls row).
 *   - Each lead is a single line: status dot · name · preview · time ·
 *     email/text icon buttons. Followed-up rows fade.
 *   - Inline action menu (Email / Text / Mark) is gone — Email + Text
 *     icons act directly (mailto:/sms: + auto-mark followed-up). A
 *     separate "Mark as new / Mark done" toggle remains via an explicit
 *     check icon at the row end.
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
  listing_id: string;
  listings: {
    address: string | null;
    city: string | null;
    state: string | null;
    slug: string | null;
  } | null;
};

type FilterKey = 'all' | 'open' | 'week' | 'pending';

const OPEN_DOT_COLOR = '#6b7a5a';

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
  const addr = l.listings?.address ?? 'your inquiry';
  const firstName = l.name.split(' ')[0] ?? l.name;
  const subject = `Re: your inquiry about ${addr}`;
  const body = `Hi ${firstName},\n\nThanks for reaching out about ${addr}. I'd be glad to share more details and answer any questions.\n\nWhen would be a good time for a quick call or showing?\n\nBest,\n`;
  return `mailto:${encodeURIComponent(l.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function buildSms(l: LeadRow): string | null {
  if (!l.phone) return null;
  return `sms:${l.phone.replace(/[^+\d]/g, '')}`;
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
            .select(
              'id, name, email, phone, message, source, notified_at, followed_up_at, created_at, listing_id, listings(address, city, state, slug)',
            )
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
        .select(
          'id, name, email, phone, message, source, notified_at, followed_up_at, created_at, listing_id, listings(address, city, state, slug)',
        )
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
      const hay =
        `${r.name} ${r.email ?? ''} ${r.phone ?? ''} ${r.message ?? ''} ${addr} ${city}`.toLowerCase();
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
            placeholder="Search name, email, listing…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink placeholder-cream/40 focus:border-line-strong focus:outline-none sm:w-64"
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
        <ul className="rounded-2xl border border-line bg-surface px-2 sm:px-3">
          {filtered.map((l, i) => (
            <LeadItem
              key={l.id}
              lead={l}
              isFirst={i === 0}
              onMark={(value) => void setFollowUp(l.id, value)}
            />
          ))}
        </ul>
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
  isFirst,
  onMark,
}: {
  lead: LeadRow;
  isFirst: boolean;
  onMark: (value: 'now' | null) => void;
}) {
  const open = !lead.followed_up_at;
  const addr = lead.listings?.address ?? '(unknown listing)';
  const preview = lead.message ?? addr;
  const mailto = buildMailto(lead);
  const sms = buildSms(lead);

  return (
    <li
      className={`grid grid-cols-[10px_minmax(0,160px)_1fr_auto_auto] items-center gap-3 sm:gap-4 py-2.5 ${
        isFirst ? '' : 'border-t border-line/60'
      } ${open ? '' : 'opacity-55'}`}
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
      {/* Name (linked to detail) */}
      <Link
        href={`/dashboard/leads/${lead.id}`}
        prefetch={false}
        className={`truncate text-sm hover:underline ${
          open ? 'font-medium text-ink' : 'text-ink2'
        }`}
        title={lead.name}
      >
        {lead.name}
      </Link>
      {/* Message preview + listing */}
      <Link
        href={`/dashboard/leads/${lead.id}`}
        prefetch={false}
        className="min-w-0 truncate text-sm text-ink2 hover:text-ink"
        title={`${preview} — ${addr}`}
      >
        {preview}
        <span className="text-muted"> · {addr}</span>
      </Link>
      {/* Time */}
      <span className="shrink-0 text-muted text-[11px] tabular-nums">
        {timeAgo(lead.created_at)}
      </span>
      {/* Icon actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        {mailto ? (
          <a
            href={mailto}
            onClick={() => onMark('now')}
            aria-label={`Email ${lead.name}`}
            title="Email (auto-marks as followed up)"
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
            title="Text (auto-marks as followed up)"
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
        <button
          type="button"
          onClick={() => onMark(open ? 'now' : null)}
          aria-label={open ? 'Mark as followed up' : 'Mark as new'}
          title={open ? 'Mark as followed up' : 'Mark as new'}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-ink2 hover:bg-line/30 hover:text-ink ${
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
      <path d="M5 12.5 10 17l9-10" />
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
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 5 5v0a5 5 0 0 1-5 5h-4" />
    </svg>
  );
}
