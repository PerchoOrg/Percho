/**
 * AnalyticsPanel — per-listing analytics view (Phase 47.8).
 *
 * Lifted from the standalone /dashboard/listings/[id]/analytics page so it
 * can render inline as a tab in the edit hub. The standalone route now
 * redirects to /edit?tab=analytics (see app/dashboard/listings/[id]/analytics/page.tsx).
 *
 * Server component. Reuses lib/analytics/listing-stats.ts. RLS scopes the
 * underlying events/leads queries to the calling agent's listings.
 */

import { type TopCardEntry, getListingStats } from '@/lib/analytics/listing-stats';
import { createClient } from '@/lib/supabase/server';

interface VideoLabelRow {
  id: string;
  kind: string;
  title: string | null;
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function labelForVideo(v: VideoLabelRow): string {
  if (v.title && v.title.length > 0) return v.title;
  return v.kind.toLowerCase();
}

export async function AnalyticsPanel({ listingId }: { listingId: string }) {
  const supabase = await createClient();
  const stats = await getListingStats(supabase, listingId);

  let videosById = new Map<string, VideoLabelRow>();
  if (stats.topCards.length > 0) {
    const ids = stats.topCards.map((c) => c.cardId);
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const videosRes = await (supabase as any)
      .from('listing_videos')
      .select('id, kind, title')
      .in('id', ids);
    const videos = (videosRes.data ?? []) as VideoLabelRow[];
    videosById = new Map(videos.map((v) => [v.id, v]));
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Page views" value={stats.pageViews} />
        <Stat label="Unique sessions" value={stats.uniqueSessions} />
        <Stat label="Card views" value={stats.cardViews} />
        <Stat label="Video completes" value={stats.videoCompletes} />
        <Stat label="Leads" value={stats.leads} />
        <Stat
          label="Lead conv. %"
          value={stats.leadConversionPct}
          valueFormatter={(v) => `${v}%`}
        />
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-serif text-lg">Engagement funnel</h2>
          <span className="text-muted text-xs">
            % relative to {fmtNum(stats.pageViews)} page views
          </span>
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

      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-serif text-lg">Top cards</h2>
          <span className="text-muted text-xs">By card_view events</span>
        </div>
        {stats.topCards.length === 0 ? (
          <p className="text-muted text-xs">
            No card views yet. (A card view is logged each time a viewer scrolls
            into a video card on the public listing page.)
          </p>
        ) : (
          <TopCards
            cards={stats.topCards}
            videosById={videosById}
            maxViews={stats.topCards[0]?.views ?? 1}
          />
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

function TopCards({
  cards,
  videosById,
  maxViews,
}: {
  cards: TopCardEntry[];
  videosById: Map<string, VideoLabelRow>;
  maxViews: number;
}) {
  return (
    <ol className="space-y-1.5">
      {cards.map((c, i) => {
        const v = videosById.get(c.cardId);
        const label = v ? labelForVideo(v) : `${c.cardId.slice(0, 8)}…`;
        const widthPct = Math.max(4, Math.round((c.views / maxViews) * 100));
        return (
          <li key={c.cardId} className="flex items-center gap-3 text-xs">
            <span className="w-5 shrink-0 text-muted tabular-nums">{i + 1}.</span>
            <span className="w-32 shrink-0 truncate text-ink2">{label}</span>
            <div className="relative h-5 flex-1 overflow-hidden rounded bg-bg">
              <div
                className="h-full bg-ink2/50 transition-all"
                style={{ width: `${widthPct}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-end px-2 font-mono text-ink">
                {fmtNum(c.views)}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
