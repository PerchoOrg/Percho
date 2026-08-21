/**
 * Two cross-cutting reads for the worker hub: what the workers did recently,
 * and what the paid ones cost.
 *
 * Spend is here rather than in `queues.ts` because it is not a queue property —
 * it is the answer to "what did today cost", and only the two seedance queues
 * carry a `cost_usd`. The owner's standing rule is to reach for the free path
 * first, which needs the paid number visible rather than buried in a bill.
 */

import { restQuery } from './rest';

export interface ActivityEvent {
  id: string;
  /** Which queue produced it, as the hub labels it. */
  source: string;
  status: string;
  at: string;
  detail: string;
  error: string | null;
}

interface FeedSource {
  source: string;
  table: string;
  select: string;
  timeColumn: string;
  filters: Record<string, string>;
  detail: (row: Record<string, unknown>) => string;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const short = (v: unknown): string => str(v)?.slice(0, 8) ?? '—';

const FEED_SOURCES: FeedSource[] = [
  {
    source: 'Home tour renders',
    table: 'render_jobs',
    select: 'id,status,updated_at,error,listing_id,engine,attempts',
    timeColumn: 'updated_at',
    filters: {},
    detail: (r) => `listing ${short(r.listing_id)} · ${str(r.engine) ?? 'kenburns'}`,
  },
  {
    source: 'Bucket videos',
    table: 'generated_videos',
    select: 'id,status,created_at,error,scope,intent_bucket',
    timeColumn: 'created_at',
    filters: { scope: 'in.(listing_intent_bucket,community_intent_bucket)' },
    detail: (r) => `${str(r.intent_bucket) ?? '—'} · ${str(r.scope) ?? ''}`,
  },
  {
    source: 'Tour assemblies',
    table: 'tour_assemblies',
    select: 'id,status,updated_at,error,community_id',
    timeColumn: 'updated_at',
    filters: {},
    detail: (r) => `community ${short(r.community_id)}`,
  },
  {
    source: 'Community clips',
    table: 'photo_clips',
    select: 'id,status,updated_at,error,engine,move,cost_usd',
    timeColumn: 'updated_at',
    filters: {},
    detail: (r) => `${str(r.engine) ?? '—'}${r.move ? ` · ${str(r.move)}` : ''}`,
  },
  {
    source: 'Home tour clips',
    table: 'listing_photo_clips',
    select: 'id,status,updated_at,error,engine,move,surface',
    timeColumn: 'updated_at',
    filters: {},
    detail: (r) => `${str(r.engine) ?? '—'} · ${str(r.surface) ?? '—'}`,
  },
  {
    source: 'Home tour assemblies',
    table: 'listing_tour_assemblies',
    select: 'id,status,updated_at,error,listing_id,surface',
    timeColumn: 'updated_at',
    filters: {},
    detail: (r) => `listing ${short(r.listing_id)} · ${str(r.surface) ?? '—'}`,
  },
  {
    source: 'AI tour videos',
    table: 'ai_tour_videos',
    select: 'id,status,updated_at,error,community_id,model',
    timeColumn: 'updated_at',
    filters: {},
    detail: (r) => str(r.model) ?? '—',
  },
];

const PER_SOURCE = 8;

/** Newest transitions across every queue, merged into one timeline. */
export async function loadActivity(limit = 24): Promise<ActivityEvent[]> {
  const perSource = await Promise.all(
    FEED_SOURCES.map(async (src) => {
      try {
        const { rows } = await restQuery<Record<string, unknown>>(src.table, {
          ...src.filters,
          select: src.select,
          order: `${src.timeColumn}.desc`,
          limit: String(PER_SOURCE),
        });
        return rows.map((r) => ({
          id: str(r.id) ?? '',
          source: src.source,
          status: str(r.status) ?? '—',
          at: str(r[src.timeColumn]) ?? '',
          detail: src.detail(r),
          error: str(r.error),
        }));
      } catch {
        return [] as ActivityEvent[];
      }
    }),
  );

  return perSource
    .flat()
    .filter((e) => e.at)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}

export interface SpendSnapshot {
  today: number;
  last7d: number;
  /** Oldest day first, seven entries, so the panel can draw a bar per day. */
  byDay: { date: string; usd: number }[];
  jobs7d: number;
}

/**
 * Every table with a `cost_usd`. `listing_photo_clips` joined the list in phase
 * 74 — a paid home-tour clip bills the same provider as a paid community one,
 * so leaving it out would under-report the week.
 */
const SPEND_TABLES = ['photo_clips', 'listing_photo_clips', 'ai_tour_videos'] as const;
const SPEND_SAMPLE = 1000;

/** UTC day key. Days are the unit the owner reasons about spend in. */
export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function summarise(
  rows: { cost_usd: number; created_at: string }[],
  now = new Date(),
): SpendSnapshot {
  const byDay = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    byDay.set(d.toISOString().slice(0, 10), 0);
  }

  const todayKey = now.toISOString().slice(0, 10);
  let today = 0;
  let last7d = 0;

  for (const row of rows) {
    const key = dayKey(row.created_at);
    if (!byDay.has(key)) continue;
    byDay.set(key, (byDay.get(key) ?? 0) + row.cost_usd);
    last7d += row.cost_usd;
    if (key === todayKey) today += row.cost_usd;
  }

  return {
    today,
    last7d,
    byDay: [...byDay.entries()].map(([date, usd]) => ({ date, usd })),
    jobs7d: rows.length,
  };
}

/** What the two paid queues have billed in the last seven days. */
export async function loadSpend(): Promise<SpendSnapshot> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const perTable = await Promise.all(
    SPEND_TABLES.map(async (table) => {
      try {
        const { rows } = await restQuery<{ cost_usd: number | null; created_at: string }>(table, {
          select: 'cost_usd,created_at',
          created_at: `gte.${since}`,
          cost_usd: 'not.is.null',
          order: 'created_at.desc',
          limit: String(SPEND_SAMPLE),
        });
        return rows;
      } catch {
        return [];
      }
    }),
  );

  const rows = perTable
    .flat()
    .filter((r): r is { cost_usd: number; created_at: string } => typeof r.cost_usd === 'number');

  return summarise(rows);
}
