/**
 * Minimal PostgREST reader for the worker hub.
 *
 * Why not supabase-js: the hub's queues are *data* (`QUEUES` in `queues.ts`) —
 * table name, status column and status vocabulary are strings, because the
 * render worker polls eight different queues that share no schema. supabase-js
 * types `.from()` / `.eq()` against the generated `Database` type and cannot
 * take a column name it hasn't seen at compile time, so a generic loop over
 * the specs would need a cast per call. One small fetch helper is honest about
 * what it does and keeps the specs declarative. The same reasoning is why
 * `scripts/render-worker/worker.py` talks to PostgREST directly.
 *
 * Server-only: reads the service-role key. Never import from a client
 * component (CLAUDE.md §3).
 */

const TIMEOUT_MS = 8_000;

export interface RestResult<T> {
  /** Exact row count matching the filters, from the `content-range` header. */
  count: number;
  /** The rows actually returned (bounded by `limit`). */
  rows: T[];
}

function restBase(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase env missing (URL / service role key)');
  return { url: `${url.replace(/\/$/, '')}/rest/v1`, key };
}

/** `content-range: 0-24/1337` → 1337. `*\/0` → 0. */
export function parseContentRange(header: string | null): number {
  if (!header) return 0;
  const total = header.split('/')[1];
  if (!total || total === '*') return 0;
  const n = Number(total);
  return Number.isFinite(n) ? n : 0;
}

/**
 * One PostgREST GET with an exact count. `params` are raw PostgREST operators
 * (`status: 'in.(pending,processing)'`), passed through as query string.
 */
export async function restQuery<T>(
  table: string,
  params: Record<string, string>,
): Promise<RestResult<T>> {
  const { url, key } = restBase();
  const qs = new URLSearchParams(params).toString();

  const res = await fetch(`${url}/${table}?${qs}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'count=exact',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${table} ${res.status}: ${body.slice(0, 200)}`);
  }

  const rows = (await res.json()) as T[];
  return { count: parseContentRange(res.headers.get('content-range')), rows };
}

/** Count only — asks for a single column and one row, reads the header. */
export async function restCount(table: string, params: Record<string, string>): Promise<number> {
  const { count } = await restQuery(table, { ...params, select: 'id', limit: '1' });
  return count;
}
