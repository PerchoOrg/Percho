/**
 * Agent-level Analytics rollup (Phase 49.2: V3 Asymmetric redesign).
 *
 * Aggregates across all of the calling agent's listings. Reads from
 * `events` (page_view / card_view / video_complete), `leads`, and the
 * 7-day page_view trend.
 *
 * Phase 49.2 layout:
 *   - Cover card: Views (large) + sparkline + unique-sessions sub-line.
 *   - Sidebar: Leads number with conversion sub-line.
 *   - Sidebar: Watch-through ring (videoCompletes / pageViews).
 *   - Below: 4-step funnel (Page views → Card views → Video completes →
 *     Leads), terminal step in sage.
 *
 * Removed: separate Likes card (now lives in dashboard rollup metrics if
 * needed; not part of this top-level performance view). Unique Sessions
 * demoted from card to a sub-line under Views (it's context, not a goal).
 */

import { getRollupStats } from '@/lib/analytics/listing-stats';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Analytics · Vicinity' };

const RING_ACCENT = '#6b7a5a';

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

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function Sparkline({ buckets }: { buckets: DayBucket[] }) {
  const w = 280;
  const h = 56;
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
      className="h-14 w-full text-ink"
      role="img"
      aria-label="Views, last 7 days"
      preserveAspectRatio="none"
    >
      <path d={area} fill="currentColor" opacity={0.08} />
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

function Ring({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative h-14 w-14 shrink-0">
      <div
        className="h-full w-full rounded-full"
        style={{
          background: `conic-gradient(${RING_ACCENT} 0% ${clamped}%, rgba(49,49,49,0.1) ${clamped}% 100%)`,
        }}
      />
      <div className="absolute inset-[5px] rounded-full bg-surface" />
      <div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] tabular-nums text-ink">
        {clamped}%
      </div>
    </div>
  );
}

function Funnel({
  steps,
}: {
  steps: { label: string; value: number; terminal?: boolean }[];
}) {
  const top = Math.max(steps[0]?.value ?? 0, 1);
  return (
    <div className="space-y-2">
      {steps.map((s, i) => {
        const prev = i > 0 ? (steps[i - 1]?.value ?? 0) : null;
        const stepDrop =
          prev != null && prev > 0 ? Math.round((s.value / prev) * 1000) / 10 : null;
        const widthPct = Math.max(2, Math.round((s.value / top) * 100));
        return (
          <div key={s.label} className="flex items-center gap-3">
            <div className="w-28 shrink-0 text-ink2 text-xs">{s.label}</div>
            <div className="relative h-6 flex-1 overflow-hidden rounded bg-bg">
              <div
                className="h-full transition-all"
                style={{
                  width: `${widthPct}%`,
                  background: s.terminal
                    ? RING_ACCENT
                    : 'linear-gradient(90deg, rgba(49,49,49,0.4), rgba(49,49,49,0.2))',
                }}
              />
              <div
                className={`absolute inset-0 flex items-center justify-end px-2 font-mono text-xs ${
                  s.terminal && widthPct > 25 ? 'text-surface' : 'text-ink'
                }`}
              >
                {fmtNum(s.value)}
              </div>
            </div>
            <div className="w-12 shrink-0 text-right text-muted text-[11px] tabular-nums">
              {stepDrop != null ? `${stepDrop}%` : '—'}
            </div>
          </div>
        );
      })}
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

  // 7-day views trend
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

  const watchThroughPct =
    rollup.pageViews > 0
      ? Math.round((rollup.videoCompletes / rollup.pageViews) * 1000) / 10
      : 0;
  const showRing = rollup.pageViews > 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {/* Asymmetric KPI grid */}
      <section className="grid gap-3 sm:grid-cols-3 sm:grid-rows-2">
        {/* Views — cover card, spans two rows on sm+ */}
        <div className="rounded-2xl border border-line bg-surface p-5 sm:row-span-2 sm:flex sm:flex-col sm:justify-between">
          <div>
            <div className="text-muted text-[11px] uppercase tracking-widest">
              Views · last 7 days
            </div>
            <div className="mt-2 font-serif text-5xl tabular-nums leading-none">
              {fmtNum(rollup.pageViews)}
            </div>
            <div className="mt-1 text-muted text-xs">
              {rollup.uniqueSessions > 0
                ? `${fmtNum(rollup.uniqueSessions)} unique ${rollup.uniqueSessions === 1 ? 'session' : 'sessions'}`
                : 'No traffic yet'}
            </div>
          </div>
          <div className="mt-4">
            <Sparkline buckets={buckets} />
            <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-muted">
              <span>{buckets[0]?.date.slice(5) ?? ''}</span>
              <span>{buckets[buckets.length - 1]?.date.slice(5) ?? ''}</span>
            </div>
          </div>
        </div>

        {/* Leads */}
        <div className="rounded-2xl border border-line bg-surface p-4 sm:col-span-2">
          <div className="text-muted text-[11px] uppercase tracking-widest">
            Leads
          </div>
          <div className="mt-1 font-serif text-3xl tabular-nums">
            {fmtNum(rollup.leads)}
          </div>
          {rollup.leads > 0 && rollup.uniqueSessions > 0 && (
            <div className="mt-1 text-muted text-xs">
              {rollup.leadConversionPct}% of unique sessions
            </div>
          )}
        </div>

        {/* Watch-through ring */}
        <div className="rounded-2xl border border-line bg-surface p-4 sm:col-span-2">
          {showRing ? (
            <div className="flex items-center gap-4">
              <Ring pct={watchThroughPct} />
              <div className="min-w-0">
                <div className="text-muted text-[11px] uppercase tracking-widest">
                  Watch-through
                </div>
                <div className="font-serif text-lg tabular-nums">
                  {watchThroughPct}%
                </div>
                <div className="text-muted text-xs">
                  {fmtNum(rollup.videoCompletes)} video{' '}
                  {rollup.videoCompletes === 1 ? 'completion' : 'completions'}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="text-muted text-[11px] uppercase tracking-widest">
                Watch-through
              </div>
              <div className="mt-1 text-muted text-sm">
                Available once viewers reach a listing.
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Funnel */}
      <section className="mt-4 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-serif text-sm">Drop-off</h2>
          <span className="text-muted text-[11px]">% of step before</span>
        </div>
        <Funnel
          steps={[
            { label: 'Page views', value: rollup.pageViews },
            { label: 'Card views', value: rollup.cardViews },
            { label: 'Video completes', value: rollup.videoCompletes },
            { label: 'Leads', value: rollup.leads, terminal: true },
          ]}
        />
        {rollup.pageViews === 0 && (
          <p className="mt-3 text-muted text-xs">
            No traffic yet. Share your listing URLs on Facebook / Instagram /
            Email to start collecting data.
          </p>
        )}
      </section>

      <p className="mt-4 text-muted text-xs">
        Numbers update in real time across all your listings (no caching).
      </p>
    </div>
  );
}
