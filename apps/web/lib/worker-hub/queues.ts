/**
 * The queues the two local workers drain, as data.
 *
 * There is no jobs table. There are eight independent queues in six tables,
 * each with its own status vocabulary, and the render worker polls them in a
 * fixed priority order (`main()` in `scripts/render-worker/worker.py`):
 * listing renders → bucket videos → assemblies → photo clips → outpaint →
 * enhance. The seedance worker drains the two paid queues. `order` below is
 * that polling order, so the hub shows the pipeline in the sequence the worker
 * actually walks it — a queue high in the list starves everything under it.
 *
 * Keeping this a list rather than eight hand-written loaders is what makes
 * "did we forget a queue" answerable: the tab shows every entry here, and
 * adding a queue to the worker means adding one object.
 */

import { restQuery } from './rest';

export type QueueWorker = 'render' | 'seedance';

export interface QueueSpec {
  id: string;
  label: string;
  worker: QueueWorker;
  table: string;
  /** Status column. Two queues live in photo tables and use their own column. */
  column: string;
  /** Extra PostgREST filters ANDed into every count (scope, engine, …). */
  filters: Record<string, string>;
  waiting: string[];
  active: string[];
  done: string[];
  failed: string[];
  /** Column recording when a row entered the queue. Null when the table has none. */
  enqueued: string | null;
  /** Column that moves when a row finishes. Null when the table has none. */
  completed: string | null;
  hint: string;
}

/**
 * `enhanced_status` / `outpaint_status` live on the photo rows themselves, so
 * their only timestamp is when the PHOTO was created — not when it was queued.
 * Both time columns are null there on purpose: an age or a throughput built on
 * `poi_photos.created_at` would be a number that looks right and means nothing.
 */
export const QUEUES: QueueSpec[] = [
  {
    id: 'render-jobs',
    label: 'Home tour renders',
    worker: 'render',
    table: 'render_jobs',
    column: 'status',
    filters: {},
    waiting: ['queued'],
    active: ['running'],
    done: ['done'],
    failed: ['failed'],
    enqueued: 'created_at',
    completed: 'updated_at',
    hint: 'agent clicked Generate — interactive, polled first',
  },
  {
    id: 'bucket-videos',
    label: 'Bucket videos',
    worker: 'render',
    table: 'generated_videos',
    column: 'status',
    filters: { scope: 'in.(listing_intent_bucket,community_intent_bucket)' },
    waiting: ['pending'],
    active: ['processing'],
    done: ['ready', 'approved'],
    failed: ['failed'],
    enqueued: 'created_at',
    // generated_videos has no updated_at — created_at is the closest signal for
    // a completion time, and rows drain within seconds of being enqueued.
    completed: 'created_at',
    hint: 'intent-bucket cuts for listings and communities',
  },
  {
    id: 'assemblies',
    label: 'Tour assemblies',
    worker: 'render',
    table: 'tour_assemblies',
    column: 'status',
    filters: {},
    waiting: ['pending'],
    active: ['processing'],
    done: ['ready'],
    failed: ['failed'],
    enqueued: 'created_at',
    completed: 'updated_at',
    hint: 'stitch approved clips into the film — TTS + BGM mux',
  },
  {
    id: 'photo-clips',
    label: 'Photo clips (local)',
    worker: 'render',
    table: 'photo_clips',
    column: 'status',
    filters: { engine: 'in.(depthflow,kenburns)' },
    waiting: ['pending'],
    active: ['processing'],
    done: ['ready'],
    failed: ['failed'],
    enqueued: 'created_at',
    completed: 'updated_at',
    hint: 'DepthFlow / Ken Burns — free, runs on this box',
  },
  {
    id: 'outpaint',
    label: 'Outpaint',
    worker: 'render',
    table: 'poi_photos',
    column: 'outpaint_status',
    filters: {},
    waiting: ['queued'],
    active: ['processing'],
    done: ['ready', 'skipped'],
    failed: ['failed'],
    enqueued: null,
    completed: null,
    hint: 'reframe a POI photo to portrait before enhancement',
  },
  {
    id: 'enhance-listing',
    label: 'Enhance · listing photos',
    worker: 'render',
    table: 'listing_photos',
    column: 'enhanced_status',
    filters: {},
    waiting: ['queued'],
    active: ['processing'],
    done: ['ready', 'approved'],
    failed: ['failed'],
    enqueued: null,
    completed: null,
    hint: 'batch — deliberately last, never delays a render',
  },
  {
    id: 'enhance-poi',
    label: 'Enhance · POI photos',
    worker: 'render',
    table: 'poi_photos',
    column: 'enhanced_status',
    filters: {},
    waiting: ['queued'],
    active: ['processing'],
    done: ['ready', 'approved'],
    failed: ['failed'],
    enqueued: null,
    completed: null,
    hint: 'same chain, one photo at a time (no listing to group by)',
  },
  {
    id: 'seedance-clips',
    label: 'Seedance clips',
    worker: 'seedance',
    table: 'photo_clips',
    column: 'status',
    filters: { engine: 'eq.seedance' },
    waiting: ['pending'],
    active: ['submitting', 'processing'],
    done: ['ready'],
    failed: ['failed'],
    enqueued: 'created_at',
    completed: 'updated_at',
    hint: 'PAID — OpenRouter. Every row here costs money',
  },
  {
    id: 'ai-tour-videos',
    label: 'AI tour videos',
    worker: 'seedance',
    table: 'ai_tour_videos',
    column: 'status',
    filters: {},
    waiting: ['pending'],
    active: ['submitting', 'processing'],
    done: ['ready'],
    failed: ['failed'],
    enqueued: 'created_at',
    completed: 'updated_at',
    hint: 'PAID — multi-photo community clips',
  },
];

export interface QueueSnapshot {
  id: string;
  label: string;
  worker: QueueWorker;
  hint: string;
  waiting: number;
  active: number;
  failed24h: number;
  done24h: number | null;
  /** Enqueue time of the oldest waiting row — the real "is it stuck" signal. */
  oldestWaitingAt: string | null;
  /** Start time of the oldest in-flight row. A day-old one is a dead claim. */
  oldestActiveAt: string | null;
  /** Completion timestamps in the last 24h, newest first (capped at 500). */
  completions: string[];
  /** Set when this queue's read failed; the rest of the hub still renders. */
  error: string | null;
}

const DAY_MS = 24 * 3600 * 1000;
const COMPLETION_SAMPLE = 500;

function inList(values: string[]): string {
  return `in.(${values.join(',')})`;
}

async function loadQueue(spec: QueueSpec): Promise<QueueSnapshot> {
  const base = { ...spec.filters };
  const since = new Date(Date.now() - DAY_MS).toISOString();

  const waitingQ = restQuery<Record<string, string>>(spec.table, {
    ...base,
    [spec.column]: inList(spec.waiting),
    select: spec.enqueued ?? 'id',
    limit: '1',
    ...(spec.enqueued ? { order: `${spec.enqueued}.asc` } : {}),
  });

  const activeQ = restQuery<Record<string, string>>(spec.table, {
    ...base,
    [spec.column]: inList(spec.active),
    select: spec.enqueued ?? 'id',
    limit: '1',
    ...(spec.enqueued ? { order: `${spec.enqueued}.asc` } : {}),
  });

  const failedQ = restQuery<Record<string, string>>(spec.table, {
    ...base,
    [spec.column]: inList(spec.failed),
    select: 'id',
    limit: '1',
    ...(spec.completed ? { [spec.completed]: `gte.${since}` } : {}),
  });

  const doneQ = spec.completed
    ? restQuery<Record<string, string>>(spec.table, {
        ...base,
        [spec.column]: inList(spec.done),
        [spec.completed]: `gte.${since}`,
        select: spec.completed,
        order: `${spec.completed}.desc`,
        limit: String(COMPLETION_SAMPLE),
      })
    : null;

  const [waiting, active, failed, done] = await Promise.all([waitingQ, activeQ, failedQ, doneQ]);

  const completedCol = spec.completed;
  return {
    id: spec.id,
    label: spec.label,
    worker: spec.worker,
    hint: spec.hint,
    waiting: waiting.count,
    active: active.count,
    failed24h: failed.count,
    done24h: done ? done.count : null,
    oldestWaitingAt: spec.enqueued ? (waiting.rows[0]?.[spec.enqueued] ?? null) : null,
    oldestActiveAt: spec.enqueued ? (active.rows[0]?.[spec.enqueued] ?? null) : null,
    completions:
      done && completedCol
        ? done.rows.map((r) => r[completedCol]).filter((v): v is string => typeof v === 'string')
        : [],
    error: null,
  };
}

/** Every queue, in worker polling order. A failing queue degrades to an error row. */
export async function loadQueues(): Promise<QueueSnapshot[]> {
  return Promise.all(
    QUEUES.map(async (spec) => {
      try {
        return await loadQueue(spec);
      } catch (e) {
        return {
          id: spec.id,
          label: spec.label,
          worker: spec.worker,
          hint: spec.hint,
          waiting: 0,
          active: 0,
          failed24h: 0,
          done24h: null,
          oldestWaitingAt: null,
          oldestActiveAt: null,
          completions: [],
          error: e instanceof Error ? e.message : 'read failed',
        } satisfies QueueSnapshot;
      }
    }),
  );
}
