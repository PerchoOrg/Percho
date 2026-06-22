/**
 * AnalyticsPanel — per-listing analytics view embedded in the edit hub.
 *
 * Phase 49.1 redesign (Analytics V3 — Asymmetric):
 *   - Magazine-style asymmetric grid: Views is the cover number (big card,
 *     spans two rows), Leads + Watch-through ring are sidebars.
 *   - Watch-through % = videoCompletes / pageViews — fresher metric than the
 *     abstract "Conv. %", and what an agent actually wants to know about
 *     their video edits.
 *   - Compact funnel below grounds the page (4 steps as bars).
 *   - No sparkline / no "vs previous 30d" — current `getListingStats` does
 *     not surface time-series or prior-period data, so we stay honest.
 *
 * Server component. Reuses lib/analytics/listing-stats.ts. RLS scopes the
 * underlying events/leads queries to the calling agent's listings.
 */

import { getListingStats } from '@/lib/analytics/listing-stats';
import { createClient } from '@/lib/supabase/server';

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

const RING_ACCENT = '#6b7a5a';

export async function AnalyticsPanel({ listingId }: { listingId: string }) {
  const supabase = await createClient();
  const stats = await getListingStats(supabase, listingId);

  const watchThroughPct =
    stats.pageViews > 0
      ? Math.round((stats.videoCompletes / stats.pageViews) * 1000) / 10
      : 0;

  const showRing = stats.pageViews > 0;

  return (
    <div className="space-y-4">
      {/* ─── Asymmetric KPI grid ─────────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-3 sm:grid-rows-2">
        {/* Views — spans two rows on sm+ */}
        <div className="rounded-2xl border border-line bg-surface p-5 sm:row-span-2 sm:flex sm:flex-col sm:justify-between">
          <div>
            <div className="text-muted text-[11px] uppercase tracking-widest">
              Views
            </div>
            <div className="mt-2 font-serif text-5xl tabular-nums leading-none">
              {fmtNum(stats.pageViews)}
            </div>
          </div>
          <div className="mt-4 text-muted text-xs">
            {stats.uniqueSessions > 0
              ? `${fmtNum(stats.uniqueSessions)} unique ${stats.uniqueSessions === 1 ? 'session' : 'sessions'}`
              : 'No traffic yet'}
          </div>
        </div>

        {/* Leads */}
        <div className="rounded-2xl border border-line bg-surface p-4 sm:col-span-2">
          <div className="text-muted text-[11px] uppercase tracking-widest">
            Leads
          </div>
          <div className="mt-1 font-serif text-3xl tabular-nums">
            {fmtNum(stats.leads)}
          </div>
          {stats.leads > 0 && stats.uniqueSessions > 0 && (
            <div className="mt-1 text-muted text-xs">
              {stats.leadConversionPct}% of unique sessions
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
                  {fmtNum(stats.videoCompletes)} video{' '}
                  {stats.videoCompletes === 1 ? 'completion' : 'completions'}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="text-muted text-[11px] uppercase tracking-widest">
                Watch-through
              </div>
              <div className="mt-1 text-muted text-sm">
                Available once viewers reach the page.
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ─── Compact funnel ─────────────────────────────────────────── */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="font-serif text-sm">Drop-off</h3>
          <span className="text-muted text-[11px]">% of step before</span>
        </div>
        <Funnel
          steps={[
            { label: 'Page views', value: stats.pageViews },
            { label: 'Card views', value: stats.cardViews },
            { label: 'Video completes', value: stats.videoCompletes },
            { label: 'Leads', value: stats.leads, terminal: true },
          ]}
        />
        {stats.pageViews === 0 && (
          <p className="mt-3 text-muted text-xs">
            No traffic yet. Share the listing URL on Facebook / Instagram / Email
            to start collecting data.
          </p>
        )}
      </section>

      <p className="text-muted text-xs">
        Numbers update in real time from the public listing page (no caching).
      </p>
    </div>
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
