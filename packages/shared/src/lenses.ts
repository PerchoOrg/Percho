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

import { estimatePropertyTax } from './property-tax';

/**
 * Every metric key, as stored in `area_metrics.metric`.
 *
 * ONE list, because there were three: this union plus a hand-copied
 * `KNOWN_METRICS` allowlist on the server and another in the mobile DTO.
 * Adding `public_water_pct` to the union and not to the two copies wrote 29
 * correct rows that the API then silently dropped — the type said the key
 * existed and both runtime guards disagreed.
 *
 * The allowlists themselves are right and stay: an unknown key is a row a
 * newer writer produced, and skipping it is better than trusting it. They just
 * derive from here now, so a shipped binary keeps the older list it was built
 * with (which is the version skew they exist for) while nobody maintains a
 * copy by hand.
 */
export const METRIC_KEYS = [
  'property_tax_rate_pct',
  /** The adopted millage rate on market value, before homestead exemptions
   *  and credits. Sourced from the state, and NOT what the true-cost lens
   *  prices with — see `scripts/admin/import-ga-millage.ts` for why the two
   *  are different numbers. Shown as provenance, never summed into a cost. */
  'property_tax_millage_statutory_pct',
  /** The four levies, in mills, kept apart because a homestead exemption
   *  reduces an M&O base and by law never touches bond millage. These are
   *  what `@percho/shared/property-tax` needs to price a real bill. */
  'county_mo_mills',
  'county_bond_mills',
  'school_mo_mills',
  'school_bond_mills',
  'school_proficiency_pct',
  'electric_monthly_usd',
  'water_monthly_usd',
  'trash_monthly_usd',
  /** Share of the county's people on a public water system rather than a
   *  private well, 0–100. Not a cost: it says whether a county-level water
   *  bill is the right SHAPE for the place. In Pike County four households in
   *  five have a well and no water bill at all. */
  'public_water_pct',
  /**
   * What the published county tax rate leaves out, in percentage points of
   * market value — the floor and the ceiling of a range.
   *
   * Georgia counties levy fire, EMS, police, recreation and ambulance as
   * SEPARATE districts that `import-ga-millage.ts` does not total, and 19 of
   * the 29 metro counties levy something. Which of them a given home pays
   * depends on whether it is inside a city and, in Jackson, on which of eleven
   * fire sub-districts covers it — so this is a range and not a number, and the
   * figure itself is deliberately NOT adjusted by it. See
   * `apps/web/lib/areas/district-millage.ts`.
   */
  'district_millage_omitted_min_pct',
  'district_millage_omitted_max_pct',
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

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
 * be told a number flatly. Since phase219 the figure is an average across all
 * of them, so `count` says how many there were and `name`/`share` describe the
 * largest — a note that named one utility beside a blended rate would credit
 * that rate to a company most of the county may not buy from.
 */
export interface MetricSupplier {
  /** As the source spells it, e.g. "Georgia Power Co". The LARGEST, when several. */
  name: string;
  /** How many suppliers serve the area. Absent or 1 means just this one. */
  count?: number;
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
  /**
   * Whether a water figure includes the sewer half.
   *
   * Undefined on every metric this does not apply to. `false` says the figure
   * is water ALONE, because the county has no sewer utility to price — five of
   * the twenty-nine are like that, and they sit at the bottom of the water
   * ranking partly because of it: water-only counties average $41 a month
   * against $68 for the rest. Some of that gap is a genuinely cheaper place
   * and some of it is a component that is not there, and a reader comparing
   * $25 against $75 cannot tell which without being told.
   *
   * It deliberately does NOT decide whether those households pay for sewer
   * some other way. Public water and a septic tank is an ordinary combination
   * in exurban Georgia, and we have no source for which homes are on one. The
   * field says what the figure contains, not what the household pays.
   */
  coversSewer?: boolean;
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
   * Parts of the figure that are NOT stored metrics — flat assumptions baked
   * into `compute`.
   *
   * Everything else in this file reasons about provenance from the metrics a
   * computation READ, which makes a constant invisible: true cost silently
   * carried $146/month of insurance while its own footnote said "the rest of
   * each figure comes from a public record". phase218 fixed the same blindness
   * in the estimate FLAG and in the compare table's footnote; this is the
   * third function of that family and the one on the default lens.
   *
   * A declaration, and this codebase has been burned three times by
   * declarations drifting from what a computation does — so
   * `lenses.test.ts` pins the arithmetic: true cost must equal its metrics
   * plus exactly the assumptions named here.
   */
  assumes?: readonly string[];
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
    // `insuranceMonthlyUsd` is added by `compute` and is a flat share of
    // price, so it is never sourced and never varies by county.
    assumes: ['insurance'],
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

/** What a metric is called when a sentence has to name it. */
const METRIC_LABELS: Partial<Record<MetricKey, string>> = {
  property_tax_rate_pct: 'property tax',
  electric_monthly_usd: 'electricity',
  water_monthly_usd: 'water & sewer',
  trash_monthly_usd: 'trash',
  school_proficiency_pct: 'school results',
};

/**
 * The footnote under a ranking, naming what is actually a guess.
 *
 * The list used to carry one sentence for every lens: "estimated — we have not
 * sourced this county's figure yet." For a single-metric lens that is true.
 * For true cost it is a **misdescription of our own work**: property tax comes
 * from the GA DOR and electricity from EIA-861, together most of every dollar
 * in the figure, and the asterisk was telling a buyer to discount all of it
 * because water and trash are guesses.
 *
 * So the note names the estimated INPUTS, and says the rest is sourced when
 * the rest exists. Which metrics count is decided by what the computation
 * actually read — see `readingMetrics`, and the three times that distinction
 * was got wrong before it was centralised.
 */
export function estimateNoteFor(lens: Lens, areas: readonly Area[]): string | undefined {
  /** Per estimated metric, how many flagged rows it is a guess in. */
  const guessedIn = new Map<MetricKey, number>();
  const read = new Set<MetricKey>();
  let flagged = 0;

  for (const area of areas) {
    if (area.kind !== lens.areaKind) continue;
    const { value, read: readHere } = readingMetrics(area, (get) => lens.compute(get, area.key));
    if (value === undefined || !Number.isFinite(value)) continue;
    for (const m of readHere) read.add(m);
    const guesses = area.metrics.filter((m) => m.estimated && readHere.has(m.metric));
    if (guesses.length === 0) continue;
    flagged++;
    for (const m of guesses) {
      guessedIn.set(m.metric, (guessedIn.get(m.metric) ?? 0) + 1);
    }
  }
  const assumed = [...(lens.assumes ?? [])];
  // A lens with a baked-in assumption always has something to say, even in a
  // future where every metric it reads is sourced.
  if (flagged === 0 && assumed.length === 0) return undefined;

  const label = (m: MetricKey) => METRIC_LABELS[m];
  // A metric that is a guess in EVERY marked row is a property of the figure.
  // One that is a guess in a handful is a property of those counties, and
  // lumping the two together overstates: electricity is sourced in 27 of 29
  // counties, and listing it beside trash implied the whole line was invented.
  const always = [
    ...assumed,
    ...[...guessedIn]
      .filter(([, n]) => n === flagged)
      .map(([m]) => label(m))
      .filter((l): l is string => l !== undefined),
  ].sort();
  const sometimes = [...guessedIn]
    .filter(([, n]) => n < flagged)
    .map(([m, n]) => {
      const l = label(m);
      return l === undefined ? undefined : `${l} in ${n} of them`;
    })
    .filter((l): l is string => l !== undefined)
    .sort();

  // Only claim a sourced remainder when the lens read something beyond the
  // guesses — a single-metric lens whose one input is a guess has no rest.
  // The assumptions are named above, so they are not part of "the rest"; the
  // sentence used to promise a public record for money that was never one.
  const rest = read.size > guessedIn.size;

  // A lens with one input does not need that input named: "electricity is
  // still our estimate" under a lens called Electricity says it twice.
  if ((read.size === 1 && assumed.length === 0) || (always.length === 0 && sometimes.length === 0)) {
    return '* still our estimate for the counties marked.';
  }

  const isAre = always.length === 1 ? 'is' : 'are';
  const head =
    always.length > 0 ? `* ${listOf(always)} ${isAre} still our estimate` : '* our estimate covers';
  const tail = sometimes.length > 0 ? `, and ${listOf(sometimes)}` : '';
  // "in 2 of them" has already said which counties, so appending "for the
  // counties marked" both repeats it and reads as though it governs the
  // count. Only the unqualified form needs that scope.
  const closing = rest
    ? '. The rest of each figure comes from a public record.'
    : sometimes.length > 0
      ? '.'
      : ' for the counties marked.';
  return `${head}${tail}${closing}`;
}

/**
 * The same footnote, for a table of rows rather than a lens ranking.
 *
 * The compare screen carried its own copy of the sentence phase216 replaced —
 * "we have not sourced that county's figure yet" — over a table whose property
 * tax row comes from the GA DOR. Third surface, same claim, and it survived
 * two separate fixes because each one only looked at the screen in front of it.
 *
 * Takes labels rather than metrics because a compare row is a computed line
 * ("Property tax / year"), not a stored figure, and its label is what the
 * reader is looking at.
 */
/**
 * The rows a reader thinks in, and the metrics behind each.
 *
 * Both review demos print a "where the numbers come from" table, and both used
 * to hand-write it. They drifted the same way at the same time: each credited
 * electricity to NREL/OpenEI for several phases after it moved to EIA-861. Two
 * pages describing one set of sources is two chances to be out of date, so the
 * grouping and the summary both live here.
 */
export const PROVENANCE_ROWS: readonly { label: string; metrics: readonly MetricKey[] }[] = [
  { label: 'Property tax', metrics: ['county_mo_mills', 'school_mo_mills'] },
  { label: 'Schools', metrics: ['school_proficiency_pct'] },
  { label: 'Electric', metrics: ['electric_monthly_usd'] },
  { label: 'Water & sewer', metrics: ['water_monthly_usd'] },
  { label: 'Trash', metrics: ['trash_monthly_usd'] },
];

export interface SourceLine {
  label: string;
  source: string;
  estimated: boolean;
  areas: number;
}

/**
 * Where each row's figures actually come from, counted off real areas.
 *
 * One entry per (row, distinct source) rather than one per row, because a row
 * is not uniformly sourced: electricity is EIA-861 in most counties and still
 * a Percho estimate in a couple, and a summary that collapsed to the majority
 * source would hide exactly the counties a reader should be careful about.
 *
 * Insurance is appended by the caller if it wants it — it has no metric, which
 * is the whole point of it (see `estimatedFromReads`).
 */
export function sourceSummary(areas: readonly Area[]): SourceLine[] {
  const out: SourceLine[] = [];
  for (const row of PROVENANCE_ROWS) {
    const counts = new Map<string, SourceLine>();
    for (const area of areas) {
      for (const m of area.metrics) {
        if (!row.metrics.includes(m.metric)) continue;
        const key = `${m.source}|${m.estimated === true}`;
        const hit = counts.get(key);
        if (hit) hit.areas++;
        else {
          counts.set(key, {
            label: row.label,
            source: m.source,
            estimated: m.estimated === true,
            areas: 1,
          });
        }
      }
    }
    // A row built from several metrics counts each area once, not once per
    // metric — the tax row reads two millage figures from the same digest.
    for (const c of [...counts.values()].sort((a, b) => b.areas - a.areas)) {
      out.push({ ...c, areas: Math.round(c.areas / Math.max(1, row.metrics.length)) });
    }
  }
  return out;
}

/** The insurance line, which no metric backs. */
export function insuranceSourceLine(areaCount: number): SourceLine {
  return {
    label: 'Insurance',
    source: `Percho assumption — ${(INSURANCE_RATE_ANNUAL * 100).toFixed(2)}% of price per year, the same in every county`,
    estimated: true,
    areas: areaCount,
  };
}

export function estimateNoteForRows(
  rows: readonly { label: string; cells: readonly { estimated: boolean }[] }[],
): string | undefined {
  const always: string[] = [];
  const sometimes: string[] = [];
  let anySourced = false;
  for (const row of rows) {
    const marked = row.cells.filter((c) => c.estimated).length;
    if (marked === 0) {
      anySourced = true;
      continue;
    }
    const name = row.label.split('/')[0]?.trim().toLowerCase() ?? row.label;
    if (marked === row.cells.length) always.push(name);
    else sometimes.push(`${name} in ${marked} of them`);
  }
  if (always.length === 0 && sometimes.length === 0) return undefined;

  const isAre = always.length === 1 ? 'is' : 'are';
  const head =
    always.length > 0
      ? `* ${listOf(always.sort())} ${isAre} still our estimate`
      : '* our estimate covers';
  const tail = sometimes.length > 0 ? `, and ${listOf(sometimes.sort())}` : '';
  const closing = anySourced ? '. Every other row comes from a public record.' : '.';
  return `${head}${tail}${closing}`;
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
 * Run a computation over an area's metrics and record which ones it READ.
 *
 * This exists because the same mistake has now been made three times, in three
 * files, by three separate pieces of code written to the same wrong instinct:
 * asking whether any DECLARED input is an estimate. Declared inputs include
 * fallbacks. A fallback the computation never reached is invisible to
 * reasoning and visible to `.some()`, so a figure computed from the state's
 * own adopted millage kept rendering with an "estimated" asterisk because a
 * seeded `property_tax_rate_pct` still sits in the table behind it.
 *
 * It happened in `valuesFor`, then in `costBreakdown`, then in the mobile
 * compare table. Three is enough: any "is this sourced?" question goes through
 * here, and the answer is about what was read.
 */
export function readingMetrics<T>(
  area: Area,
  compute: (get: (metric: MetricKey) => number | undefined) => T,
): { value: T; read: ReadonlySet<MetricKey> } {
  const byKey = new Map(area.metrics.map((m) => [m.metric, m]));
  const read = new Set<MetricKey>();
  const value = compute((metric) => {
    read.add(metric);
    return byKey.get(metric)?.value;
  });
  return { value, read };
}

/**
 * True when the computation is not backed by a sourced record.
 *
 * Two ways that happens. The obvious one: a metric it READ is an estimate.
 *
 * The other is why this is not a one-liner. "No metric it read was an
 * estimate" is VACUOUSLY true of a computation that read no metrics at all,
 * so a hard-coded constant came out the far side marked as sourced — the
 * strongest possible provenance claim, earned by consulting nothing. That is
 * how the compare table came to print insurance, a flat share of price with
 * no county in it, with no estimate mark, while the cost sheet two taps away
 * marked the identical number as an assumption.
 *
 * A figure derived from zero records is an assumption by construction. It can
 * be a good one — but it is not a reading.
 */
export function estimatedFromReads(area: Area, read: ReadonlySet<MetricKey>): boolean {
  if (read.size === 0) return true;
  return area.metrics.some((m) => m.estimated && read.has(m.metric));
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
 * whatever it might have read — provided it read something. Reading nothing at
 * all is an assumption, not a clean bill of health; see `estimatedFromReads`.
 */
export function valuesFor(lens: Lens, areas: readonly Area[]): LensValue[] {
  const out: LensValue[] = [];
  for (const area of areas) {
    if (area.kind !== lens.areaKind) continue;
    const { value, read } = readingMetrics(area, (get) => lens.compute(get, area.key));
    if (value === undefined || !Number.isFinite(value)) continue;
    // A lens that bakes in a flat assumption is partly assumed however well
    // sourced its metrics are. Without this, sourcing water and trash would
    // one day mark true cost fully sourced while $146 of it stayed a guess.
    const assumed = (lens.assumes?.length ?? 0) > 0;
    out.push({ area, value, estimated: assumed || estimatedFromReads(area, read) });
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
 * "about 1 in 5 homes here has a well and no water bill", or nothing when
 * almost everyone is on the mains.
 *
 * A county water figure is a real bill for whoever is connected and no bill at
 * all for whoever is not, and the split is not small at the edge of the metro:
 * four households in five in Pike County are on a well. Stated as a RATIO of
 * households rather than as a claim about the figure — "describes a minority"
 * is false at 88%, where it describes a large majority and the remainder is
 * merely worth mentioning.
 */
export function wellShareNote(publicWaterPct: number | undefined): string | undefined {
  if (publicWaterPct === undefined || !Number.isFinite(publicWaterPct)) return undefined;
  const wells = 100 - publicWaterPct;
  // Under a twentieth is noise next to a figure rounded to the dollar.
  if (wells < 5) return undefined;
  const who =
    wells >= 50
      ? `about ${Math.round(wells)}% of homes here have`
      : `about 1 in ${Math.round(100 / wells)} homes here has`;
  return `${who} a well and no water bill`;
}

/**
 * "the county also levies fire and EMS districts this excludes — $70 to $145 a
 * month more, depending where in the county the home is", or nothing.
 *
 * A RANGE, because which district levies a home pays depends on whether it is
 * inside a city and which sub-district covers it. Naming a single number would
 * be the confident wrongness phase240 refused; naming nothing leaves a buyer
 * reading a ranking where Hall is third cheapest and would be sixteenth.
 *
 * The figure itself is not adjusted. Correcting it needs a ruling on which
 * levies apply where, and that is the owner's to make.
 */
export function districtOmissionNote(
  minPct: number | undefined,
  maxPct: number | undefined,
  priceUsd: number,
): string | undefined {
  if (maxPct === undefined || !Number.isFinite(maxPct) || maxPct <= 0) return undefined;
  const perMonth = (pct: number) => Math.round((priceUsd * (pct / 100)) / 12);
  const hi = perMonth(maxPct);
  if (hi < 1) return undefined;
  const lo = minPct === undefined || !Number.isFinite(minPct) ? 0 : perMonth(minPct);
  const amount = lo > 0 && lo !== hi ? `$${lo}–$${hi}` : `up to $${hi}`;
  return `excludes this county’s separately-levied fire, EMS and similar districts — ${amount} a month more, depending where in the county`;
}

/**
 * "water only — no sewer utility in this county", or nothing.
 *
 * Only ever says something when the answer is no. A figure that includes both
 * halves is the normal case and does not need announcing; one that is missing a
 * half does, because it reads as cheap rather than as partial.
 */
export function sewerNote(coversSewer: boolean | undefined): string | undefined {
  return coversSewer === false ? 'water only — no sewer utility in this county' : undefined;
}

/** Above this share, a supplier is "the county's" and the rest is rounding. */
const EFFECTIVELY_ALL = 0.95;

/**
 * How a supplier reads on a cost line, or nothing when there is nothing to add
 * beyond the figure itself.
 */
function supplierNote(metric: AreaMetric | undefined): string | undefined {
  const s = metric?.supplier;
  if (!s) return undefined;
  const price =
    s.unitPrice !== undefined && s.unitPriceUnit === 'usd_per_kwh'
      ? `${(s.unitPrice * 100).toFixed(1)}¢ per kWh`
      : undefined;

  // Several utilities: the price is the county's AVERAGE, so it must not be
  // printed next to one company's name as though that company charged it.
  //
  // "Effectively one" is a share test, not a count. Hall is served by four
  // utilities and Georgia Power covers 98% of it, so "averaged across 4
  // utilities" overstated the mixing for a county where the average and that
  // one company's rate agree to within a tenth of a cent. Same 95% the plain
  // branch uses to decide a share is not worth mentioning.
  const mixed = s.share === undefined || s.share < EFFECTIVELY_ALL;
  if (s.count !== undefined && s.count > 1 && mixed) {
    const bits = [`averaged across ${s.count} utilities`];
    if (price) bits.push(price);
    if (s.share !== undefined) {
      bits.push(`largest is ${s.name} at ${Math.round(s.share * 100)}%`);
    }
    return bits.join(' · ');
  }

  const bits = [s.name];
  if (price) bits.push(price);
  // Only worth saying when the supplier is NOT effectively the whole county:
  // "serves 100% of the county" is noise.
  if (s.share !== undefined && s.share < EFFECTIVELY_ALL) {
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
    extraNote?: string,
  ): CostLine => {
    const supplied = supplierKey ? supplierNote(byKey.get(supplierKey)) : undefined;
    const note = [supplied, extraNote].filter(Boolean).join(' · ') || undefined;
    return { label, monthlyUsd, estimated, ...(note ? { note } : {}) };
  };
  const isEstimate = (key: MetricKey) => byKey.get(key)?.estimated === true;

  return [
    // Tax is an estimate only when the STORED RATE is what answered. Asking
    // whether any DECLARED input is an estimate flags it always, because the
    // seeded `property_tax_rate_pct` is still in the table as an unused
    // fallback — the same mistake `valuesFor` had, and here it printed the
    // state's own adopted millage under a "still our estimate" footnote.
    line(
      'Property tax',
      tax,
      taxWasEstimated,
      undefined,
      districtOmissionNote(
        get('district_millage_omitted_min_pct'),
        get('district_millage_omitted_max_pct'),
        REFERENCE_HOME_USD,
      ),
    ),
    line('Electric', electric, isEstimate('electric_monthly_usd'), 'electric_monthly_usd'),
    // Whether a water bill applies at all is part of what it costs to live
    // here. Four households in five in Pike County are on a well.
    line(
      'Water & sewer',
      water,
      isEstimate('water_monthly_usd'),
      'water_monthly_usd',
      [sewerNote(byKey.get('water_monthly_usd')?.coversSewer), wellShareNote(get('public_water_pct'))]
        .filter(Boolean)
        .join(' · ') || undefined,
    ),
    line('Trash', trash, isEstimate('trash_monthly_usd'), 'trash_monthly_usd'),
    // A flat share of price, identical in every county — an assumption by
    // construction, never a measurement.
    line('Insurance', insuranceMonthlyUsd, true),
  ];
}
