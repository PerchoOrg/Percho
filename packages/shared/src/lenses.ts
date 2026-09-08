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
import { estimatePropertyTax } from './property-tax';

export type MetricKey =
  | 'property_tax_rate_pct'
  /** The adopted millage rate on market value, before homestead exemptions
   *  and credits. Sourced from the state, and NOT what the true-cost lens
   *  prices with — see `scripts/admin/import-ga-millage.ts` for why the two
   *  are different numbers. Shown as provenance, never summed into a cost. */
  | 'property_tax_millage_statutory_pct'
  /** The four levies, in mills, kept apart because a homestead exemption
   *  reduces an M&O base and by law never touches bond millage. These are
   *  what `@percho/shared/property-tax` needs to price a real bill. */
  | 'county_mo_mills'
  | 'county_bond_mills'
  | 'school_mo_mills'
  | 'school_bond_mills'
  | 'school_proficiency_pct'
  | 'electric_monthly_usd'
  | 'water_monthly_usd'
  | 'trash_monthly_usd';

/** Anything the lens map can be drawn on. Mirrors the `area_kind` enum. */
export type AreaKind = 'county' | 'city' | 'school_district' | 'utility_territory';

/**
 * Who supplies the thing a figure prices, when it comes from a named supplier.
 *
 * A narrow, named field rather than passing the metric row's whole `detail`
 * jsonb through: `detail` is free-form and each scraper writes whatever it
 * found useful, so shipping it wholesale would let the UI quietly depend on a
 * key one importer happened to emit. This is a contract; `detail` is a
 * scratchpad.
 *
 * `share` matters more than it looks. An electric figure for a county where
 * one utility covers 98% is a different claim from one where it covers 55%,
 * and a buyer whose house is in the other 45% deserves to see that rather than
 * be told a number flatly.
 */
export interface MetricSupplier {
  /** As the source spells it, e.g. "Georgia Power Co". */
  name: string;
  /** Fraction of the area this supplier covers, 0–1. */
  share?: number;
  /** The unit price behind the figure, when the source publishes one. */
  unitPrice?: number;
  /** How to read `unitPrice`, e.g. `usd_per_kwh`. */
  unitPriceUnit?: string;
}

/** One figure for one area, as the API hands it over. */
export interface AreaMetric {
  metric: MetricKey;
  value: number;
  unit: string;
  source: string;
  sourceUrl?: string;
  asOf: string;
  estimated: boolean;
  supplier?: MetricSupplier;
}

/** One area, with everything we know about it. */
export interface Area {
  key: string;
  name: string;
  kind: AreaKind;
  state: string;
  metrics: AreaMetric[];
}

export type LensId = 'true_cost' | 'property_tax' | 'schools' | 'electric' | 'utilities';

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
  /**
   * Computes the lens's number from the area's metrics.
   *
   * `areaKey` is passed because property tax cannot be read off a stored
   * percentage: the county's homestead exemption is a fixed dollar amount and
   * has to be looked up by key. Lenses that do not need it ignore it.
   */
  compute: (get: (metric: MetricKey) => number | undefined, areaKey: string) => number | undefined;
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
export const insuranceMonthlyUsd = Math.round((REFERENCE_HOME_USD * INSURANCE_RATE_ANNUAL) / 12);

/**
 * Monthly property tax on the reference home, in the county's own key.
 *
 * Computed from the four levies and the county's homestead exemption rather
 * than from a stored percentage, because a fixed-dollar exemption makes the
 * effective rate depend on the price — see `property-tax.ts`. Falls back to a
 * stored `property_tax_rate_pct` only when the levies are missing, which is
 * how a county with no scraped millage still prices at all.
 */
export function taxMonthlyUsdFor(
  countyKey: string,
  get: (metric: MetricKey) => number | undefined,
): number | undefined {
  const countyMo = get('county_mo_mills');
  const schoolMo = get('school_mo_mills');
  if (countyMo !== undefined && schoolMo !== undefined) {
    const est = estimatePropertyTax(
      REFERENCE_HOME_USD,
      {
        countyMo,
        countyBond: get('county_bond_mills') ?? 0,
        schoolMo,
        schoolBond: get('school_bond_mills') ?? 0,
      },
      countyKey,
    );
    if (est) return est.monthlyUsd;
  }
  const rate = get('property_tax_rate_pct');
  return rate === undefined ? undefined : taxMonthlyUsd(rate);
}

/** Monthly property tax on the reference home at a flat effective rate. */
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
      'county_mo_mills',
      'county_bond_mills',
      'school_mo_mills',
      'school_bond_mills',
      'electric_monthly_usd',
      'water_monthly_usd',
      'trash_monthly_usd',
    ],
    compute: (get, areaKey) => {
      const tax = taxMonthlyUsdFor(areaKey, get);
      const electric = get('electric_monthly_usd');
      const water = get('water_monthly_usd');
      const trash = get('trash_monthly_usd');
      if (tax === undefined || electric === undefined) return undefined;
      if (water === undefined || trash === undefined) return undefined;
      return tax + electric + water + trash + insuranceMonthlyUsd;
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
    inputs: [
      'property_tax_rate_pct',
      'county_mo_mills',
      'county_bond_mills',
      'school_mo_mills',
      'school_bond_mills',
    ],
    compute: (get, areaKey) => {
      const monthly = taxMonthlyUsdFor(areaKey, get);
      // Shown as a rate, computed as a bill: the percentage a buyer of the
      // reference home actually ends up paying, exemptions included.
      return monthly === undefined ? undefined : ((monthly * 12) / REFERENCE_HOME_USD) * 100;
    },
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
    id: 'electric',
    label: 'Electricity',
    unit: 'per month at Georgia’s average use',
    caption:
      'Who supplies the power here and what they charge. Service territories were drawn in the 1930s and ignore county lines, so this is not the utility the county is named after.',
    rankTitle: 'Cheapest power first',
    areaKind: 'county',
    betterIsLow: true,
    ramp: ['#AB94BF', '#9478AB', '#7D5D96', '#664582', '#4F2E6D'],
    inputs: ['electric_monthly_usd'],
    compute: (get) => get('electric_monthly_usd'),
    format: (v) => `$${Math.round(v).toLocaleString()}`,
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

/**
 * Every area that has all of the lens's inputs, with its computed value.
 *
 * `estimated` reflects the metrics the computation ACTUALLY read, not the
 * lens's declared `inputs`. The two differ whenever a lens has a fallback:
 * property tax is computed from the state's own millage rates and falls back
 * to a stored percentage only when those are missing, so checking `inputs`
 * flagged a state-sourced figure as an estimate because the unused fallback
 * happened to be one. A lens that read nothing estimated is not an estimate,
 * whatever it might have read.
 */
export function valuesFor(lens: Lens, areas: readonly Area[]): LensValue[] {
  const out: LensValue[] = [];
  for (const area of areas) {
    if (area.kind !== lens.areaKind) continue;
    const lookup = metricLookup(area);
    const read = new Set<MetricKey>();
    const value = lens.compute((metric) => {
      read.add(metric);
      return lookup(metric);
    }, area.key);
    if (value === undefined || !Number.isFinite(value)) continue;
    const estimated = area.metrics.some((m) => m.estimated && read.has(m.metric));
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

/** One line of the true-cost breakdown. */
export interface CostLine {
  label: string;
  monthlyUsd: number;
  /** Who supplies it and at what price, when we know — this is what turns
   *  "Electric $157" into "Electric $157 · Georgia Power · 14.6¢ per kWh". */
  note?: string;
  /**
   * True when this particular line is still a guess.
   *
   * Per LINE, not per area, and the distinction now matters: property tax and
   * schools are sourced from the state while water and trash have no source at
   * all. A single "this county is estimated" banner over the whole sheet was
   * true when everything was a guess and became a lie the moment anything
   * stopped being one — it tells a buyer to discount a figure we can defend.
   */
  estimated: boolean;
}

/**
 * How a supplier reads on a cost line, or nothing when there is nothing to add
 * beyond the figure itself.
 */
function supplierNote(metric: AreaMetric | undefined): string | undefined {
  const s = metric?.supplier;
  if (!s) return undefined;
  const bits = [s.name];
  if (s.unitPrice !== undefined && s.unitPriceUnit === 'usd_per_kwh') {
    bits.push(`${(s.unitPrice * 100).toFixed(1)}¢ per kWh`);
  }
  // Only worth saying when the supplier is NOT effectively the whole county:
  // "serves 100% of the county" is noise, and below the naming threshold there
  // is no supplier here to report in the first place.
  if (s.share !== undefined && s.share < 0.95) {
    bits.push(`serves ${Math.round(s.share * 100)}% of the county`);
  }
  return bits.join(' · ');
}

/**
 * "water & sewer and trash", "tax, water & sewer and trash" — an English list.
 *
 * Worth having rather than `join(', ')` because this sentence is read by a
 * buyer deciding whether to trust a number, and "water & sewer, trash" reads
 * like a truncated list rather than a complete one.
 */
export function listOf(items: readonly string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** The cost lines behind one area's true-cost figure, in display order.
 *  Returns undefined when the area cannot be priced. */
export function costBreakdown(area: Area): CostLine[] | undefined {
  const get = metricLookup(area);
  // Record what the tax computation actually READ, so the line's honesty
  // follows the input that answered rather than the ones it might have.
  const readForTax = new Set<MetricKey>();
  const tax = taxMonthlyUsdFor(area.key, (metric) => {
    readForTax.add(metric);
    return get(metric);
  });
  const taxWasEstimated = area.metrics.some((m) => m.estimated && readForTax.has(m.metric));
  const electric = get('electric_monthly_usd');
  const water = get('water_monthly_usd');
  const trash = get('trash_monthly_usd');
  if (tax === undefined || electric === undefined) return undefined;
  if (water === undefined || trash === undefined) return undefined;
  const byKey = new Map(area.metrics.map((m) => [m.metric, m]));
  const line = (
    label: string,
    monthlyUsd: number,
    estimated: boolean,
    supplierKey?: MetricKey,
  ): CostLine => {
    const note = supplierKey ? supplierNote(byKey.get(supplierKey)) : undefined;
    return { label, monthlyUsd, estimated, ...(note ? { note } : {}) };
  };
  const isEstimate = (key: MetricKey) => byKey.get(key)?.estimated === true;

  return [
    // Tax is an estimate only when the STORED RATE is what answered. Asking
    // whether any DECLARED input is an estimate flags it always, because the
    // seeded `property_tax_rate_pct` is still in the table as an unused
    // fallback — the same mistake `valuesFor` had, and here it printed the
    // state's own adopted millage under a "still our estimate" footnote.
    line('Property tax', tax, taxWasEstimated),
    line('Electric', electric, isEstimate('electric_monthly_usd'), 'electric_monthly_usd'),
    line('Water & sewer', water, isEstimate('water_monthly_usd'), 'water_monthly_usd'),
    line('Trash', trash, isEstimate('trash_monthly_usd'), 'trash_monthly_usd'),
    // A flat share of price, identical in every county — an assumption by
    // construction, never a measurement.
    line('Insurance', insuranceMonthlyUsd, true),
  ];
}
