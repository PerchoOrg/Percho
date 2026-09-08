/**
 * Areas for the search tab's lens map — the shapes to fill and the numbers to
 * fill them with.
 *
 * Two sources, deliberately:
 *
 *   shapes  `@/data/metro-county-shapes.json`, built from Census TIGER by
 *           `scripts/admin/build-metro-county-shapes.ts`. County lines move
 *           roughly never, the file is 30 KB, and a phone that has to fetch
 *           geometry before it can draw anything shows a blank map first. So
 *           it ships with the app rather than living in a table.
 *
 *   metrics `area_metrics`, read live. These DO change — a millage sheet is
 *           re-adopted every year, a proficiency file lands every summer, and
 *           phase200's scrapers rewrite rows behind the app without a deploy.
 *
 * An area with a shape and no metrics is still returned. It renders as a
 * neutral outline the buyer can tap and be told we do not have the number
 * yet, which is the honest state — dropping it would silently redraw the
 * metro as smaller than it is.
 */

import shapeFile from '@/data/metro-county-shapes.json';
import type { Area, AreaMetric, MetricKey } from '@percho/shared/lenses';
import { createClient as createPlainClient } from '@supabase/supabase-js';

/** A county outline, ready for react-native-maps / MapLibre. */
export interface AreaShape {
  key: string;
  name: string;
  /** Label anchor, `[lng, lat]`. */
  centre: [number, number];
  /** Outer rings, `[lng, lat]` pairs. */
  rings: [number, number][][];
}

export interface AreasDTO {
  state: string;
  shapes: AreaShape[];
  areas: Area[];
  /** ISO instant the metrics were read — the client shows nothing with it, but
   *  it makes a stale cache obvious in a bug report. */
  fetchedAt: string;
}

const shapes = shapeFile as unknown as {
  state: string;
  counties: { key: string; name: string; centre: [number, number]; rings: [number, number][][] }[];
};

/** The metrics any lens can ask for. A row with a metric outside this list is
 *  something a newer client writes and this one does not understand — skip it
 *  rather than widen `MetricKey` at runtime. */
const KNOWN_METRICS = new Set<string>([
  'property_tax_rate_pct',
  'school_proficiency_pct',
  'electric_monthly_usd',
  'water_monthly_usd',
  'trash_monthly_usd',
]);

/**
 * Untyped on purpose, and only until the migration is applied.
 *
 * `20260908040000_area_metrics.sql` has not been pushed yet (the owner runs
 * `pnpm db:push`), so `area_metrics` is absent from the generated
 * `database.types.ts` and the typed client rejects the table name outright.
 * Hand-writing the row into the generated file would be worse: the next
 * `pnpm db:types` silently overwrites it, and until then the checked-in types
 * would claim a shape the database has not agreed to.
 *
 * The rows are validated at runtime by `groupMetrics` instead — it drops any
 * row whose metric it does not know or whose value is not finite — so nothing
 * here trusts the response's shape either way.
 *
 * **After `pnpm db:push` + `pnpm db:types`**: restore the `<Database>` generic
 * and type `MetricRow` as
 * `Database['public']['Tables']['area_metrics']['Row']`.
 */
function createUncachedAnonClient() {
  // Same fetch-cache opt-out as `lib/listings/search.ts` — see the note there.
  return createPlainClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: 'no-store' }),
      },
    },
  );
}

interface MetricRow {
  area_kind: string;
  state: string;
  area_key: string;
  area_name: string;
  metric: string;
  value: number | string;
  unit: string;
  source: string;
  source_url: string | null;
  as_of: string;
  estimated: boolean;
}

/** Groups metric rows into `Area`s, keyed by kind + key. Exported for tests —
 *  the grouping is where a bad join shows up, not the query. */
export function groupMetrics(rows: readonly MetricRow[]): Area[] {
  const byArea = new Map<string, Area>();
  for (const row of rows) {
    if (!KNOWN_METRICS.has(row.metric)) continue;
    // Postgres `numeric` arrives as a string through PostgREST; a silent NaN
    // here would render as a blank county rather than an error.
    const value = typeof row.value === 'string' ? Number(row.value) : row.value;
    if (!Number.isFinite(value)) continue;

    const id = `${row.area_kind}:${row.state}:${row.area_key}`;
    let area = byArea.get(id);
    if (!area) {
      area = {
        key: row.area_key,
        name: row.area_name,
        kind: row.area_kind as Area['kind'],
        state: row.state,
        metrics: [],
      };
      byArea.set(id, area);
    }
    const metric: AreaMetric = {
      metric: row.metric as MetricKey,
      value,
      unit: row.unit,
      source: row.source,
      ...(row.source_url ? { sourceUrl: row.source_url } : {}),
      asOf: row.as_of,
      estimated: row.estimated,
    };
    area.metrics.push(metric);
  }
  return [...byArea.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Every county we have a shape for, with whatever metrics exist.
 *
 * One query, no pagination: 29 counties × 5 metrics is under 150 rows and the
 * lens map needs all of them at once to compute its class breaks — quantiles
 * over a page would recolour the map as you scroll.
 */
export async function fetchAreas(): Promise<AreasDTO> {
  const supabase = createUncachedAnonClient();
  const { data, error } = await supabase
    .from('area_metrics')
    .select(
      'area_kind, state, area_key, area_name, metric, value, unit, source, source_url, as_of, estimated',
    )
    .eq('state', shapes.state);
  if (error) throw new Error(`area_metrics: ${error.message}`);

  return {
    state: shapes.state,
    shapes: shapes.counties,
    areas: groupMetrics((data ?? []) as unknown as MetricRow[]),
    fetchedAt: new Date().toISOString(),
  };
}
