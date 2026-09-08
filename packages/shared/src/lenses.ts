/**
 * The search tab's lenses — what an area costs, what its schools do, and how
 * to colour a map by either.
 *
 * ── What a lens is ─────────────────────────────────────────────────────────
 *
 * A lens is ONE dimension, rendered over the geography that dimension actually
 * has. Property tax is set per taxing jurisdiction and steps at its border;
 * school proficiency belongs to a district; electricity to a service
 * territory. Interpolating all of them onto one grid — the thing "heat map"
 * usually means — would draw a gradient across a line where the real number
 * jumps, which is a picture of something that is not true. So each lens names
 * the `areaKind` it is defined on and is drawn on those polygons.
 *
 * ── What a lens is NOT ─────────────────────────────────────────────────────
 *
 * A lens never removes anything from the map. Picking one recolours; it does
 * not narrow the result set, and there is no lens that hides an area for
 * failing a threshold. The Search tab's rule (§4.1) is that the only narrowing
 * affordances are the search box and the viewport, and lenses are deliberately
 * inside that rule rather than an exception to it.
 *
 * **There is no crime or safety lens, and adding one needs the owner.** Safety
 * was the #2 thing buyers said they look up (7/10 in the 2026-09 study), so
 * the omission is deliberate, not an oversight: Zillow and Redfin both
 * publicly declined crime layers on fair-housing grounds, because crime counts
 * carry reporting bias and shading a map by them approximates steering. The
 * need is answered at community level by resident reviews, which are signed,
 * subjective and about a place someone lives — see `community_reviews`.
 *
 * ── Reading the numbers ────────────────────────────────────────────────────
 *
 * `betterIsLow` is the lens's own direction, and it is why the ramp cannot be
 * assigned globally: a low tax rate is good news, a low proficiency score is
 * not. Callers rank with `rankedBy` rather than sorting on their own.
 *
 * Values arrive from `area_metrics`, one row per (area, metric), each with a
 * source and an `as_of`. A figure flagged `estimated` has not been sourced yet
 * and must render with its disclosure — the buyer study's top post-move regret
 * was hidden carrying cost, and answering it with an unlabelled guess would be
 * a worse version of the same problem.
 */

/** A metric key as stored in `area_metrics.metric`. */
export type MetricKey =
  | 'property_tax_rate_pct'
  /** The adopted millage rate on market value, before homestead exemptions
   *  and credits. Sourced from the state, and NOT what the true-cost lens
   *  prices with — see `scripts/admin/import-ga-millage.ts` for why the two
   *  are different numbers. Shown as provenance, never summed into a cost. */
  | 'property_tax_millage_statutory_pct'
  | 'school_proficiency_pct'
  | 'electric_monthly_usd'
  | 'water_monthly_usd'
  | 'trash_monthly_usd';

/** Anything the lens map can be drawn on. Mirrors the `area_kind` enum. */
export type AreaKind = 'county' | 'city' | 'school_district' | 'utility_territory';

/** One figure for one area, as the API hands it over. */
export interface AreaMetric {
  metric: MetricKey;
  value: number;
  unit: string;
  source: string;
  sourceUrl?: string;
  asOf: string;
  estimated: boolean;
}

/** One area, with everything we know about it. */
export interface Area {
  key: string;
  name: string;
  kind: AreaKind;
  state: string;
  metrics: AreaMetric[];
}

export type LensId = 'true_cost' | 'property_tax' | 'schools' | 'utilities';

export interface Lens {
  id: LensId;
  /** Chip label. Short — the row scrolls on a 390pt phone. */
  label: string;
  /** What the number means, under the legend ramp. */
  unit: string;
  /** One line under the ranking title: what this lens answers, and why. */
  caption: string;
  /** Heading over the ranking list, which already implies the sort direction. */
  rankTitle: string;
  /** The geography this dimension is actually defined on. */
  areaKind: AreaKind;
  /** True when a smaller number is the better outcome. */
  betterIsLow: boolean;
  /**
   * Single-hue sequential ramp, light → dark, five steps. Validated against
   * the light chart surface (monotone lightness, ≥0.06 ΔL between steps, the
   * light end clears 2:1 so "low" never reads as "no data"). Do not re-order
   * or re-step without re-running the palette validator.
   */
  ramp: readonly [string, string, string, string, string];
  /** Which stored metrics this lens needs. Missing any → the area is unranked. */
  inputs: readonly MetricKey[];
  /** Computes the lens's number from the area's metrics. */
  compute: (get: (metric: MetricKey) => number | undefined) => number | undefined;
  /** Renders the number the way its unit reads. */
  format: (value: number) => string;
}

/**
 * The reference home the cost lenses price. Every cost figure is "what this
 * area asks of the SAME house", so the map compares places rather than
 * houses — a $500k home in Cobb against a $500k home in DeKalb.
 *
 * $500k is roughly the metro's median new-build ask and, more importantly, it
 * is the number the demo and the compare card use. Change it in one place.
 */
export const REFERENCE_HOME_USD = 500_000;

/**
 * Homeowner's insurance as a fraction of price per year. Same rate the listing
 * page's cost block has used since phase D (`apps/mobile/lib/listing/cost.ts`)
 * — kept identical so a buyer is never shown two different insurance numbers
 * for one house. It is a metro-wide assumption, not an area metric, which is
 * why it does not vary across the map.
 */
export const INSURANCE_RATE_ANNUAL = 0.0035;

/** Monthly insurance on the reference home. */
export const insuranceMonthlyUsd = Math.round(
  (REFERENCE_HOME_USD * INSURANCE_RATE_ANNUAL) / 12,
);

/** Monthly property tax on the reference home at an effective rate. */
export function taxMonthlyUsd(ratePct: number): number {
  return Math.round((REFERENCE_HOME_USD * (ratePct / 100)) / 12);
}

export const LENSES: readonly Lens[] = [
  {
    id: 'true_cost',
    label: 'True cost /mo',
    unit: `per month on a $${(REFERENCE_HOME_USD / 1000).toFixed(0)}k home`,
    caption:
      'Tax, utilities, trash and insurance on the same home. Hidden carrying cost was the #1 thing buyers said they got wrong after moving in.',
    rankTitle: 'Cheapest to own first',
    areaKind: 'county',
    betterIsLow: true,
    ramp: ['#D5A998', '#C48A74', '#B06C53', '#985137', '#7E3D22'],
    inputs: [
      'property_tax_rate_pct',
      'electric_monthly_usd',
      'water_monthly_usd',
      'trash_monthly_usd',
    ],
    compute: (get) => {
      const rate = get('property_tax_rate_pct');
      const electric = get('electric_monthly_usd');
      const water = get('water_monthly_usd');
      const trash = get('trash_monthly_usd');
      if (rate === undefined || electric === undefined) return undefined;
      if (water === undefined || trash === undefined) return undefined;
      return taxMonthlyUsd(rate) + electric + water + trash + insuranceMonthlyUsd;
    },
    format: (v) => `$${Math.round(v).toLocaleString()}`,
  },
  {
    id: 'property_tax',
    label: 'Property tax',
    unit: 'effective rate',
    caption:
      'What the county actually collects on a home’s value — the biggest line item a listing never shows you.',
    rankTitle: 'Lowest tax first',
    areaKind: 'county',
    betterIsLow: true,
    ramp: ['#D4AD79', '#C08F51', '#AB7330', '#935917', '#7A4409'],
    inputs: ['property_tax_rate_pct'],
    compute: (get) => get('property_tax_rate_pct'),
    format: (v) => `${v.toFixed(2)}%`,
  },
  {
    id: 'schools',
    label: 'Schools',
    unit: 'proficient, district average',
    caption:
      'District test proficiency — the first thing buyers look up about an area they have never visited.',
    rankTitle: 'Strongest districts first',
    areaKind: 'county',
    betterIsLow: false,
    ramp: ['#99BBA7', '#76A488', '#548C6C', '#337452', '#155C3B'],
    inputs: ['school_proficiency_pct'],
    compute: (get) => get('school_proficiency_pct'),
    format: (v) => `${Math.round(v)}%`,
  },
  {
    id: 'utilities',
    label: 'Utilities & trash',
    unit: 'per month, typical home',
    caption:
      'Electric, water and trash. Who provides them — and whether pickup is a county service or your own contract — changes at the county line.',
    rankTitle: 'Cheapest first',
    areaKind: 'county',
    betterIsLow: true,
    ramp: ['#9BB6C7', '#7BA0B4', '#5C89A1', '#3F728D', '#295C77'],
    inputs: ['electric_monthly_usd', 'water_monthly_usd', 'trash_monthly_usd'],
    compute: (get) => {
      const electric = get('electric_monthly_usd');
      const water = get('water_monthly_usd');
      const trash = get('trash_monthly_usd');
      if (electric === undefined || water === undefined || trash === undefined) {
        return undefined;
      }
      return electric + water + trash;
    },
    format: (v) => `$${Math.round(v).toLocaleString()}`,
  },
] as const;

export function lensById(id: string): Lens | undefined {
  return LENSES.find((l) => l.id === id);
}

/** The lens the tab opens on. */
export const DEFAULT_LENS: LensId = 'true_cost';

/** An area's value under one lens, plus whether any input was a guess. */
export interface LensValue {
  area: Area;
  value: number;
  /** True when any metric feeding this value is flagged `estimated`. */
  estimated: boolean;
}

function metricLookup(area: Area): (metric: MetricKey) => number | undefined {
  const byKey = new Map(area.metrics.map((m) => [m.metric, m]));
  return (metric) => byKey.get(metric)?.value;
}

/** Every area that has all of the lens's inputs, with its computed value. */
export function valuesFor(lens: Lens, areas: readonly Area[]): LensValue[] {
  const out: LensValue[] = [];
  for (const area of areas) {
    if (area.kind !== lens.areaKind) continue;
    const value = lens.compute(metricLookup(area));
    if (value === undefined || !Number.isFinite(value)) continue;
    const estimated = area.metrics.some(
      (m) => m.estimated && lens.inputs.includes(m.metric),
    );
    out.push({ area, value, estimated });
  }
  return out;
}

/** Best first, by the lens's own direction. Ties break on name, so the list is
 *  stable across renders rather than reordering under the user's thumb. */
export function rankedBy(lens: Lens, areas: readonly Area[]): LensValue[] {
  return valuesFor(lens, areas).sort(
    (a, b) =>
      (lens.betterIsLow ? a.value - b.value : b.value - a.value) ||
      a.area.name.localeCompare(b.area.name),
  );
}

/**
 * Quantile class breaks — the four values that split the areas into the ramp's
 * five buckets.
 *
 * Quantiles rather than equal intervals because these distributions are
 * lopsided: metro Atlanta has a long tail of cheap outer counties and a tight
 * cluster of expensive core ones, and equal intervals put nearly every county
 * in one bucket and paint a flat map. Quantiles guarantee the map uses its
 * whole ramp, at the cost of the classes not being equal-width — which is why
 * the legend prints the actual range rather than the class edges.
 *
 * Breaks are always ascending in VALUE. `classOf` handles the direction, so a
 * low tax rate lands in the light class and a low proficiency in the dark one.
 *
 * Each break is the LAST value of its class, not the first of the next, and
 * `classOf` tests `value > break`. Taking the first instead puts the maximum
 * ON the top break, which — since the maximum is not greater than itself —
 * leaves the darkest step permanently unused and the map visibly short of one
 * colour.
 */
export function classBreaks(lens: Lens, areas: readonly Area[]): number[] {
  const sorted = valuesFor(lens, areas)
    .map((v) => v.value)
    .sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return [];
  const lastOfClass = (p: number) => sorted[Math.max(0, Math.ceil(p * n) - 1)] ?? 0;
  return [lastOfClass(0.2), lastOfClass(0.4), lastOfClass(0.6), lastOfClass(0.8)];
}

/**
 * Which ramp step a value gets: 0 (lightest) … 4 (darkest).
 *
 * Dark always means "more of what this lens measures", and the ramp's dark end
 * is the one that draws the eye — so for a lens where low is better, the
 * ranking's winners are the pale counties. The legend labels both ends, and
 * the ranking list carries the same colour per row, so the direction never has
 * to be inferred from the map alone.
 */
export function classOf(value: number, breaks: readonly number[]): number {
  let step = 0;
  for (const b of breaks) if (value > b) step++;
  return Math.min(step, 4);
}

/** The ramp colour for a value. */
export function colorFor(lens: Lens, value: number, breaks: readonly number[]): string {
  return lens.ramp[classOf(value, breaks)] ?? lens.ramp[0];
}

/** Low and high ends of the legend, already formatted. */
export function legendRange(
  lens: Lens,
  areas: readonly Area[],
): { low: string; high: string } | undefined {
  const values = valuesFor(lens, areas).map((v) => v.value);
  if (values.length === 0) return undefined;
  return {
    low: lens.format(Math.min(...values)),
    high: lens.format(Math.max(...values)),
  };
}

/** The cost lines behind one area's true-cost figure, in display order.
 *  Returns undefined when the area cannot be priced. */
export function costBreakdown(
  area: Area,
): { label: string; monthlyUsd: number }[] | undefined {
  const get = metricLookup(area);
  const rate = get('property_tax_rate_pct');
  const electric = get('electric_monthly_usd');
  const water = get('water_monthly_usd');
  const trash = get('trash_monthly_usd');
  if (rate === undefined || electric === undefined) return undefined;
  if (water === undefined || trash === undefined) return undefined;
  return [
    { label: 'Property tax', monthlyUsd: taxMonthlyUsd(rate) },
    { label: 'Electric', monthlyUsd: electric },
    { label: 'Water & sewer', monthlyUsd: water },
    { label: 'Trash', monthlyUsd: trash },
    { label: 'Insurance (est.)', monthlyUsd: insuranceMonthlyUsd },
  ];
}
