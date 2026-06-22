/**
 * AnalyticsPanel — per-listing analytics view embedded in the edit hub.
 *
 * Phase 49 redesign (Analytics A — 3 KPIs + funnel):
 *   - Three headline KPIs: Views · Leads · Conv. %
 *     Conv. % is hidden when there are no leads yet (per owner: don't show
 *     a 0% number that just signals "no data" — the Leads card already does).
 *   - Engagement funnel kept (Page views → Card views → Video completes →
 *     Leads). Right column shows step-over-step retention; header label
 *     fixed to match what the column actually computes.
 *   - Top cards section dropped (rarely actioned by listing agent).
 *
 * Server component. Reuses lib/analytics/listing-stats.ts. RLS scopes the
 * underlying events/leads queries to the calling agent's listings.
 */

import { getListingStats } from '@/lib/analytics/listing-stats';
import { createClient } from '@/lib/supabase/server';

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

export async function AnalyticsPanel({ listingId }: { listingId: string }) {
  const supabase = await createClient();
  const stats = await getListingStats(supabase, listingId);

  const showConv = stats.leads > 0;

  return (
    <div className="space-y-6">
      {/* ─── Three headline KPIs ─────────────────────────────────────── */}
      <section
        className={`grid gap-3 ${
          showConv ? 'grid-cols-3' : 'grid-cols-2'
        }`}
      >
        <Stat label="Views" value={stats.pageViews} />
        <Stat label="Leads" value={stats.leads} />
        {showConv && (
          <Stat
            label="Conv. %"
            value={stats.leadConversionPct}
            valueFormatter={(v) => `${v}%`}
          />
        )}
      </section>

      {/* ─── Engagement funnel ──────────────────────────────────────── */}
      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-serif text-lg">Engagement funnel</h2>
          <span className="text-muted text-xs">% of step before</span>
        </div>
        <Funnel
          steps={[
            { label: 'Page views', value: stats.pageViews },
            { label: 'Card views', value: stats.cardViews },
            { label: 'Video completes', value: stats.videoCompletes },
            { label: 'Leads', value: stats.leads },
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

function Stat({
  label,
  value,
  valueFormatter,
}: {
  label: string;
  value: number;
  valueFormatter?: (v: number) => string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-muted text-xs uppercase tracking-wide">{label}</div>
      <div className="mt-1 font-serif text-2xl tabular-nums">
        {valueFormatter ? valueFormatter(value) : fmtNum(value)}
      </div>
    </div>
  );
}

function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
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
            <div className="w-32 shrink-0 text-ink2 text-xs">{s.label}</div>
            <div className="relative h-7 flex-1 overflow-hidden rounded bg-bg">
              <div
                className="h-full bg-gradient-to-r from-ink/40 to-ink/20 transition-all"
                style={{ width: `${widthPct}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-end px-2 font-mono text-ink text-xs">
                {fmtNum(s.value)}
              </div>
            </div>
            <div className="w-16 shrink-0 text-right text-muted text-xs tabular-nums">
              {stepDrop != null ? `${stepDrop}%` : '—'}
            </div>
          </div>
        );
      })}
      <p className="pt-1 text-muted text-[10px]">
        Right column = step-over-step retention. Use it to spot the biggest drop-off.
      </p>
    </div>
  );
}
