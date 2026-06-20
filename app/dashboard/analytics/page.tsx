/**
 * Agent-level Analytics rollup (Phase 43.10).
 *
 * Minimal stat cards + a 7-day views trend sparkline. Aggregates across all
 * of the calling agent's listings. Uses the existing `events` table (page_view
 * type), `leads`, and `listing_likes` (Phase 43.3). No `listing_saves` table
 * exists yet — that signal is intentionally omitted; treat Likes as the
 * positive-intent metric. Inline SVG sparkline is used because `recharts` was
 * not installable on the build machine; segment B can swap in recharts later
 * without changing the data layer.
 */


import { getRollupStats } from '@/lib/analytics/listing-stats';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Analytics · Vicinity' };

interface DayBucket {
  date: string;
  views: number;
}

function buildLast7Days(): DayBucket[] {
  const out: DayBucket[] = [];
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    out.push({ date: d.toISOString().slice(0, 10), views: 0 });
  }
  return out;
}

function Sparkline({ buckets }: { buckets: DayBucket[] }) {
  const w = 280;
  const h = 80;
  const pad = 4;
  const max = Math.max(1, ...buckets.map((b) => b.views));
  const stepX = (w - pad * 2) / (buckets.length - 1 || 1);
  const points = buckets.map((b, i) => {
    const x = pad + i * stepX;
    const y = h - pad - (b.views / max) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `M ${points.join(' L ')}`;
  const area = `M ${pad},${h - pad} L ${points.join(' L ')} L ${(w - pad).toFixed(1)},${h - pad} Z`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-20 w-full text-ink"
      role="img"
      aria-label="Views, last 7 days"
    >
      <path d={area} fill="currentColor" opacity={0.08} />
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} />
      {buckets.map((b, i) => {
        const x = pad + i * stepX;
        const y = h - pad - (b.views / max) * (h - pad * 2);
        return <circle key={b.date} cx={x} cy={y} r={2} fill="currentColor" />;
      })}
    </svg>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="font-serif text-3xl text-ink">{value.toLocaleString()}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-ink2">{label}</div>
    </div>
  );
}

export default async function DashboardAnalyticsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agentRow } = (await (supabase as any)
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string } | null };
  if (!agentRow?.id) redirect('/dashboard');

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: listings } = (await (supabase as any)
    .from('listings')
    .select('id')
    .eq('agent_id', agentRow.id)) as { data: Array<{ id: string }> | null };
  const listingIds = (listings ?? []).map((l) => l.id);

  const rollup = await getRollupStats(supabase, listingIds);

  // Likes count across all of agent's listings.
  let likes = 0;
  if (listingIds.length > 0) {
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { count } = (await (supabase as any)
      .from('listing_likes')
      .select('id', { head: true, count: 'exact' })
      .in('listing_id', listingIds)) as { count: number | null };
    likes = count ?? 0;
  }

  // 7-day views trend: pull page_view events with created_at in last 7 days,
  // bucket in JS.
  const buckets = buildLast7Days();
  if (listingIds.length > 0) {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - 6);
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { data: events } = (await (supabase as any)
      .from('events')
      .select('created_at')
      .eq('event_type', 'page_view')
      .in('listing_id', listingIds)
      .gte('created_at', since.toISOString())) as {
      data: Array<{ created_at: string }> | null;
    };
    const idx = new Map(buckets.map((b, i) => [b.date, i]));
    for (const ev of events ?? []) {
      const day = ev.created_at.slice(0, 10);
      const i = idx.get(day);
      if (i !== undefined) {
        const b = buckets[i];
        if (b) b.views += 1;
      }
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Phase 45.9 (2026-06-20): H1 + description removed per owner. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Page Views" value={rollup.pageViews} />
        <StatCard label="Unique Sessions" value={rollup.uniqueSessions} />
        <StatCard label="Likes" value={likes} />
        <StatCard label="Leads" value={rollup.leads} />
      </div>

      <div className="mt-6 rounded-xl border border-line bg-surface p-5">
        <div className="text-xs uppercase tracking-wide text-ink2">Views · Last 7 days</div>
        <div className="mt-3">
          <Sparkline buckets={buckets} />
        </div>
        <div className="mt-2 flex justify-between text-[10px] uppercase tracking-wide text-ink2">
          <span>{buckets[0]?.date.slice(5) ?? ''}</span>
          <span>{buckets[buckets.length - 1]?.date.slice(5) ?? ''}</span>
        </div>
      </div>
    </div>
  );
}
