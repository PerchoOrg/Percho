'use client';

/**
 * LeadsLive — three-layer freshness for the agent's lead inbox.
 *
 * Layer 1 (initial): SSR-hydrated rows passed in via `initial`.
 * Layer 2 (Realtime): postgres_changes INSERT + UPDATE subscription on
 *   public.leads. RLS limits payloads to leads the calling agent can SELECT.
 * Layer 3 (polling fallback): every 8s, refetch the most-recent leads and
 *   merge by id (last-write-wins).
 *
 * Phase 18 additions:
 * - Stats strip: This week / Pending email / Awaiting follow-up
 * - Search box (name / email / phone / message / address)
 * - Filter chips: All · Awaiting follow-up · This week · Pending email
 * - Follow-up dropdown per row: Email / Text / Mark as followed up.
 *   Email + Text auto-mark as followed up (single-click intent — Mom Test:
 *   she will not double-click to confirm she just emailed someone).
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

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
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

  // Close dropdown on outside click
  useEffect(() => {
    if (!openMenuId) return;
    const onDocClick = () => setOpenMenuId(null);
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [openMenuId]);

  const stats = useMemo(() => {
    let week = 0;
    let pendingEmail = 0;
    let openFollow = 0;
    for (const r of rows) {
      if (isThisWeek(r.created_at)) week++;
      if (!r.notified_at) pendingEmail++;
      if (!r.followed_up_at) openFollow++;
    }
    return { total: rows.length, week, pendingEmail, openFollow };
  }, [rows]);

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
      {/* Stats strip */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Stat label="Total" value={stats.total} />
        <Stat label="This week" value={stats.week} accent />
        <Stat label="Pending email" value={stats.pendingEmail} />
        <Stat label="Awaiting follow-up" value={stats.openFollow} accent />
      </div>

      {/* Controls */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
            All ({rows.length})
          </Chip>
          <Chip active={filter === 'open'} onClick={() => setFilter('open')}>
            Awaiting follow-up ({stats.openFollow})
          </Chip>
          <Chip active={filter === 'week'} onClick={() => setFilter('week')}>
            This week ({stats.week})
          </Chip>
          <Chip active={filter === 'pending'} onClick={() => setFilter('pending')}>
            Pending email ({stats.pendingEmail})
          </Chip>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            placeholder="Search name, email, listing…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-full border border-bronze/40 bg-ink2 px-3 py-1.5 text-xs text-cream placeholder-cream/40 focus:border-gold focus:outline-none sm:w-64"
          />
          <a
            href="/api/leads/export"
            className="shrink-0 rounded-full border border-bronze/40 px-3 py-1.5 text-xs text-cream/80 hover:border-gold hover:text-gold"
            title="Download all leads as CSV"
          >
            Export CSV
          </a>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-bronze/40 bg-ink2 px-8 py-16 text-center">
          <p className="text-sm text-cream/70">
            {rows.length === 0
              ? 'No leads yet. When a buyer submits the form on a published listing, it will appear here in real time.'
              : 'No leads match this filter.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-bronze/20 rounded border border-bronze/30 bg-ink2">
          {filtered.map((l) => (
            <LeadItem
              key={l.id}
              lead={l}
              menuOpen={openMenuId === l.id}
              onToggleMenu={(e) => {
                e.stopPropagation();
                setOpenMenuId((prev) => (prev === l.id ? null : l.id));
              }}
              onMark={(value) => {
                setOpenMenuId(null);
                void setFollowUp(l.id, value);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 ${
        accent ? 'border-gold/30 bg-gold/5' : 'border-bronze/30 bg-ink2'
      }`}
    >
      <div className="text-[10px] uppercase tracking-widest text-cream/50">{label}</div>
      <div className={`mt-0.5 font-serif text-2xl ${accent ? 'text-gold' : 'text-cream'}`}>
        {value}
      </div>
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
          ? 'bg-bronze/40 text-cream'
          : 'border border-bronze/30 text-cream/60 hover:border-gold/40 hover:text-cream'
      }`}
    >
      {children}
    </button>
  );
}

function LeadItem({
  lead,
  menuOpen,
  onToggleMenu,
  onMark,
}: {
  lead: LeadRow;
  menuOpen: boolean;
  onToggleMenu: (e: React.MouseEvent) => void;
  onMark: (value: 'now' | null) => void;
}) {
  const addr = lead.listings?.address ?? '(unknown listing)';
  const cityState =
    lead.listings?.city && lead.listings?.state
      ? `${lead.listings.city}, ${lead.listings.state}`
      : '';
  const sent = lead.notified_at != null;
  const followed = lead.followed_up_at != null;
  const mailto = buildMailto(lead);
  const sms = buildSms(lead);

  return (
    <li
      className={`relative flex items-center justify-between gap-3 px-4 py-3 hover:bg-bronze/10 ${followed ? 'opacity-60' : ''}`}
    >
      <Link href={`/dashboard/leads/${lead.id}`} className="min-w-0 flex-1" prefetch={false}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-cream">{lead.name}</p>
          <StatusPill sent={sent} followed={followed} followedAt={lead.followed_up_at} />
        </div>
        <p className="truncate text-xs text-cream/60">
          {addr}
          {cityState ? ` · ${cityState}` : ''}
        </p>
        {lead.message ? (
          <p className="mt-1 line-clamp-1 text-xs text-cream/50">{lead.message}</p>
        ) : null}
      </Link>

      <div className="flex shrink-0 items-center gap-3">
        <div className="text-right text-[11px] text-cream/50">{timeAgo(lead.created_at)}</div>
        <div className="relative">
          <button
            type="button"
            onClick={onToggleMenu}
            className="rounded border border-bronze/40 px-2.5 py-1 text-[11px] text-cream/80 hover:border-gold hover:text-gold"
          >
            Follow up ▾
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full z-20 mt-1 w-48 rounded-md border border-bronze/40 bg-ink2 py-1 shadow-lg"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onMark(lead.followed_up_at ? null : 'now');
              }}
            >
              {mailto ? (
                <a
                  href={mailto}
                  onClick={() => onMark('now')}
                  className="block px-3 py-2 text-xs text-cream hover:bg-bronze/30"
                >
                  📧 Email reply
                </a>
              ) : (
                <span className="block px-3 py-2 text-xs text-cream/30">📧 No email</span>
              )}
              {sms ? (
                <a
                  href={sms}
                  onClick={() => onMark('now')}
                  className="block px-3 py-2 text-xs text-cream hover:bg-bronze/30"
                >
                  💬 Text message
                </a>
              ) : (
                <span className="block px-3 py-2 text-xs text-cream/30">💬 No phone</span>
              )}
              <div className="my-1 border-t border-bronze/20" />
              {followed ? (
                <button
                  type="button"
                  onClick={() => onMark(null)}
                  className="block w-full px-3 py-2 text-left text-xs text-cream/80 hover:bg-bronze/30"
                >
                  ↺ Mark as new
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onMark('now')}
                  className="block w-full px-3 py-2 text-left text-xs text-cream/80 hover:bg-bronze/30"
                >
                  ✓ Mark as followed up
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function StatusPill({
  sent,
  followed,
  followedAt,
}: {
  sent: boolean;
  followed: boolean;
  followedAt: string | null;
}) {
  if (followed) {
    return (
      <span
        className="rounded border border-cream/20 bg-cream/5 px-2 py-0.5 text-[10px] font-medium uppercase text-cream/60"
        title={followedAt ? `Followed up ${timeAgo(followedAt)}` : 'Followed up'}
      >
        followed up
      </span>
    );
  }
  return (
    <span
      className={`rounded border px-2 py-0.5 text-[10px] font-medium uppercase ${
        sent ? 'border-gold/30 bg-gold/15 text-gold' : 'border-bronze/40 bg-bronze/10 text-cream/70'
      }`}
      title={sent ? 'Email sent — awaiting follow-up' : 'Email pending'}
    >
      {sent ? 'new' : 'pending'}
    </span>
  );
}
