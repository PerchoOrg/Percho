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
import type { Database } from '@/lib/supabase/database.types';
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
  'property_tax_millage_statutory_pct',
  'county_mo_mills',
  'county_bond_mills',
  'school_mo_mills',
  'school_bond_mills',
  'school_proficiency_pct',
  'electric_monthly_usd',
  'water_monthly_usd',
  'trash_monthly_usd',
]);

/**
 * The anon client, typed against the generated schema.
 *
 * This spent phase196–208 UNTYPED, because `area_metrics` did not exist in the
 * database yet and so was absent from `database.types.ts`; hand-writing the
 * row into that generated file would have been overwritten by the next
 * `pnpm db:types` and, until then, would have claimed a shape the database had
 * not agreed to. The migration is applied and the types are regenerated, so
 * the generic is back and `.from('area_metrics')` is checked again.
 *
 * The runtime validation in `groupMetrics` stays regardless. The generated
 * types describe what the schema PROMISES; they say nothing about a metric key
 * a newer importer writes that this build does not understand, or about a row
 * that arrives malformed for any other reason.
 */
function createUncachedAnonClient() {
  // Same fetch-cache opt-out as `lib/listings/search.ts` — see the note there.
  return createPlainClient<Database>(
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

/** Exactly the columns `fetchAreas` selects. Keeping the list beside the type
 *  means adding a column to the query without widening this fails to compile. */
type SelectedColumn =
  | 'area_kind'
  | 'state'
  | 'area_key'
  | 'area_name'
  | 'metric'
  | 'value'
  | 'unit'
  | 'source'
  | 'source_url'
  | 'as_of'
  | 'estimated'
  | 'detail';

/**
 * A row as this projection sees it — derived from the generated schema, with
 * one deliberate widening.
 *
 * `value` is widened to `number | string`, and the reason is narrower than it
 * was first written down as.
 *
 * **Measured, 2026-09-08**: this Supabase instance's PostgREST returns
 * `numeric` as a JSON NUMBER. The raw body of
 * `/rest/v1/area_metrics?select=metric,value` is `{"value":0.9}`, not
 * `{"value":"0.9"}`. An earlier version of this comment asserted the opposite
 * as fact and it was simply wrong — see the phase210 DEVLOG entry.
 *
 * The widening stays anyway, because it is one union member and a `Number()`
 * call: PostgREST HAS stringified `numeric` in other versions and
 * configurations, arbitrary-precision values genuinely cannot round-trip
 * through float64, and the failure mode if it ever changes under us is silent
 * — every rate becomes NaN and every county on the map goes grey. Cheap
 * tolerance for an expensive surprise. It is NOT a description of what
 * currently arrives.
 */
type MetricRow = Omit<
  Pick<Database['public']['Tables']['area_metrics']['Row'], SelectedColumn>,
  'value'
> & { value: number | string };

/**
 * The supplier a scraper recorded in `detail`, if it recorded one.
 *
 * `detail` is a scratchpad each importer writes freely; this reads the three
 * keys the client has a contract for and ignores everything else, so an
 * importer adding a field cannot change what the app receives.
 *
 * **Nothing is projected from an ESTIMATED row.** The seeded estimates carry a
 * hand-written `provider`, and those names are exactly the guesses phase202
 * disproved — Cobb's seed row still says "Cobb EMC", which covers 41% of the
 * county and was never sourced. A supplier name rendered beside a figure reads
 * as provenance, so attaching one to a guess would make the guess look
 * checked. An importer that genuinely knows the supplier but not the price can
 * say so, but it has to be a deliberate change here rather than a side effect
 * of an old seed row surviving.
 */
function supplierOf(detail: unknown, estimated: boolean): AreaMetric['supplier'] {
  if (estimated) return undefined;
  if (!detail || typeof detail !== 'object') return undefined;
  const d = detail as Record<string, unknown>;

  // Two shapes. Since phase219 the electric importer writes every provider it
  // found, because the figure is an average across them; before that it wrote
  // the single dominant one. Both are read rather than migrating the rows,
  // since a scraper rerun replaces them anyway and a half-migrated table would
  // silently drop the note for whatever it missed — which is exactly what
  // happened when the importer changed shape and this function did not.
  const list = Array.isArray(d.providers) ? d.providers : undefined;
  const lead = list?.[0] as Record<string, unknown> | undefined;

  const name =
    typeof lead?.name === 'string'
      ? lead.name
      : typeof d.provider === 'string'
        ? d.provider
        : undefined;
  if (!name) return undefined;

  const count = typeof d.provider_count === 'number' ? d.provider_count : list?.length;
  const share =
    typeof lead?.share === 'number'
      ? lead.share
      : typeof d.provider_share === 'number'
        ? d.provider_share
        : undefined;
  const unitPrice = typeof d.rate_usd_per_kwh === 'number' ? d.rate_usd_per_kwh : undefined;

  return {
    name,
    ...(count !== undefined && count > 1 ? { count } : {}),
    ...(share !== undefined ? { share } : {}),
    ...(unitPrice !== undefined ? { unitPrice, unitPriceUnit: 'usd_per_kwh' } : {}),
  };
}

/** Groups metric rows into `Area`s, keyed by kind + key. Exported for tests —
 *  the grouping is where a bad join shows up, not the query. */
export function groupMetrics(rows: readonly MetricRow[]): Area[] {
  const byArea = new Map<string, Area>();
  for (const row of rows) {
    if (!KNOWN_METRICS.has(row.metric)) continue;
    // Tolerated, not expected: this instance sends `numeric` as a JSON number
    // (measured). A silent NaN here would render as a blank county rather than
    // as an error, so the coercion is worth its one line either way.
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
    const supplier = supplierOf(row.detail, row.estimated);
    if (supplier) metric.supplier = supplier;
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
      'area_kind, state, area_key, area_name, metric, value, unit, source, source_url, as_of, estimated, detail',
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
