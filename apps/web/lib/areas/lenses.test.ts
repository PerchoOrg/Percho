import {
  type Area,
  type AreaMetric,
  DEFAULT_LENS,
  LENSES,
  type Lens,
  type MetricKey,
  REFERENCE_HOME_USD,
  classBreaks,
  classOf,
  colorFor,
  costBreakdown,
  estimateNoteFor,
  estimateNoteForRows,
  estimatedFromReads,
  insuranceMonthlyUsd,
  legendRange,
  lensById,
  listOf,
  rankedBy,
  readingMetrics,
  taxMonthlyUsd,
  taxMonthlyUsdFor,
  valuesFor,
} from '@percho/shared/lenses';
import { describe, expect, it } from 'vitest';

function metric(m: MetricKey, value: number, estimated = false): AreaMetric {
  return {
    metric: m,
    value,
    unit: m.endsWith('_pct') ? 'percent' : 'usd_per_month',
    source: estimated ? 'internal estimate' : 'GA DOR 2024 tax digest',
    asOf: '2024-12-31',
    estimated,
  };
}

/** Figures from the real metro: Cobb is the cheap-and-good corner, DeKalb the
 *  expensive one, Forsyth the best schools. Keeping them realistic means a
 *  broken direction shows up as an answer a local would call wrong. */
function county(
  name: string,
  o: { tax: number; school: number; electric: number; water: number; trash: number },
  estimated = false,
): Area {
  return {
    key: name.toLowerCase(),
    name,
    kind: 'county',
    state: 'GA',
    metrics: [
      metric('property_tax_rate_pct', o.tax, estimated),
      metric('school_proficiency_pct', o.school, estimated),
      metric('electric_monthly_usd', o.electric, estimated),
      metric('water_monthly_usd', o.water, estimated),
      metric('trash_monthly_usd', o.trash, estimated),
    ],
  };
}

const COBB = county('Cobb', { tax: 0.72, school: 50, electric: 148, water: 58, trash: 28 });
const DEKALB = county('DeKalb', { tax: 1.04, school: 33, electric: 165, water: 92, trash: 30 });
const FORSYTH = county('Forsyth', { tax: 0.77, school: 62, electric: 142, water: 65, trash: 27 });
const FULTON = county('Fulton', { tax: 1.02, school: 42, electric: 165, water: 78, trash: 32 });
const CHEROKEE = county('Cherokee', { tax: 0.72, school: 50, electric: 150, water: 70, trash: 25 });
const ALL = [COBB, DEKALB, FORSYTH, FULTON, CHEROKEE];

/**
 * A lens built for a test rather than taken from the catalogue.
 *
 * Most of what follows is about `valuesFor` / `classBreaks` / `rankedBy` /
 * `estimateNoteFor` — the machinery — and not about any particular lens. Those
 * tests used to reach into the catalogue for whichever real lens happened to
 * have the shape they needed: `property_tax` when they wanted a low-is-better
 * percentage, `electric` when they wanted one input, `utilities` when they
 * wanted a sum with no baked-in assumption. None of that was a claim about
 * electricity; it was a claim about the machinery, borrowing a lens to make it.
 *
 * Which is why cutting three lenses in phase274 broke thirty assertions that
 * had no opinion about any of them. A probe states the shape it needs, so a
 * future catalogue change breaks only the tests that are actually ABOUT the
 * catalogue.
 *
 * `id` is not read by any function under test here — they take the lens as a
 * parameter and never look it up — so the default is arbitrary and only the
 * type demands a real one.
 */
function probe(o: {
  inputs: readonly MetricKey[];
  betterIsLow?: boolean;
  assumes?: readonly string[];
  compute?: Lens['compute'];
  format?: Lens['format'];
}): Lens {
  const [first] = o.inputs;
  return {
    id: 'true_cost',
    label: 'Probe',
    unit: 'probe units',
    caption: 'A lens that exists only in this file.',
    rankTitle: 'Probe',
    areaKind: 'county',
    betterIsLow: o.betterIsLow ?? true,
    ramp: ['#EEEEEE', '#CCCCCC', '#999999', '#666666', '#333333'],
    inputs: o.inputs,
    ...(o.assumes ? { assumes: o.assumes } : {}),
    compute: o.compute ?? ((get) => (first ? get(first) : undefined)),
    format: o.format ?? ((v) => `${v}`),
  };
}

/** An area's metric lookup, the same shape `compute` is handed. */
function lookup(area: Area): (m: MetricKey) => number | undefined {
  return (m) => area.metrics.find((x) => x.metric === m)?.value;
}

/** A monthly tax figure back as the effective annual rate it represents. */
function asRatePct(monthlyUsd: number): number {
  return ((monthlyUsd * 12) / REFERENCE_HOME_USD) * 100;
}

describe('lens catalogue', () => {
  it('opens on a lens that exists', () => {
    expect(lensById(DEFAULT_LENS)).toBeDefined();
  });

  it('has no crime or safety lens — fair housing, see the module header', () => {
    const ids = LENSES.map((l) => l.id).join(' ');
    const labels = LENSES.map((l) => l.label.toLowerCase()).join(' ');
    expect(`${ids} ${labels}`).not.toMatch(/crime|safety|police|arrest/);
  });

  it('gives every lens a five-step ramp', () => {
    for (const lens of LENSES) {
      expect(lens.ramp, lens.id).toHaveLength(5);
      expect(new Set(lens.ramp).size, `${lens.id} has a repeated step`).toBe(5);
    }
  });

  it('gives every lens a ramp of its own', () => {
    // Two lenses sharing a hue would read as the same map recoloured. This
    // lived in the electricity block until phase274 cut that lens; it was
    // always a statement about the catalogue, not about electricity.
    const darkest = LENSES.map((l) => l.ramp[4]);
    expect(new Set(darkest).size, 'two lenses share a darkest step').toBe(LENSES.length);
  });

  it('carries only the two lenses the owner asked for', () => {
    // phase274. The three cut lenses were each a SLICE of true cost, and the
    // breakdown they duplicated lives on `/area/[key]`. Re-adding one is a
    // product decision, not a refactor — see the `LensId` header.
    expect(LENSES.map((l) => l.id)).toEqual(['schools', 'true_cost']);
  });

  it('declares every metric its compute actually reads', () => {
    for (const lens of LENSES) {
      const read: MetricKey[] = [];
      lens.compute((m) => {
        read.push(m);
        return 1;
      }, 'cobb');
      for (const m of read) expect(lens.inputs, lens.id).toContain(m);
    }
  });
});

describe('true cost', () => {
  const lens = lensById('true_cost');
  if (!lens) throw new Error('true_cost lens missing');

  it('is tax + utilities + trash + insurance on the reference home', () => {
    const [value] = valuesFor(lens, [DEKALB]);
    // 1.04% of $500k / 12 = $433, + 165 + 92 + 30 + insurance
    expect(value?.value).toBe(taxMonthlyUsd(1.04) + 165 + 92 + 30 + insuranceMonthlyUsd);
  });

  it('ranks the cheapest county first', () => {
    const ranked = rankedBy(lens, ALL);
    expect(ranked[0]?.area.name).toBe('Cobb');
    expect(ranked.at(-1)?.area.name).toBe('DeKalb');
  });

  it('skips an area missing any cost input rather than pricing it low', () => {
    const partial: Area = {
      key: 'partial',
      name: 'Partial',
      kind: 'county',
      state: 'GA',
      metrics: [metric('property_tax_rate_pct', 0.5)],
    };
    expect(valuesFor(lens, [partial])).toHaveLength(0);
  });

  it('breaks the cost into lines that sum to the headline', () => {
    const lines = costBreakdown(DEKALB);
    const [value] = valuesFor(lens, [DEKALB]);
    expect(lines?.reduce((n, l) => n + l.monthlyUsd, 0)).toBe(value?.value);
  });

  it('has no breakdown for an area it cannot price', () => {
    expect(costBreakdown({ ...COBB, metrics: [] })).toBeUndefined();
  });
});

describe('direction', () => {
  // `betterIsLow` is the property under test, and it needs both answers. Only
  // one real lens has each since phase274, and the low-is-better one (true
  // cost) sums five things — which makes "is 0.72 first?" a statement about
  // arithmetic rather than about direction. A probe reads the rate straight.
  const lowIsBetter = probe({ inputs: ['property_tax_rate_pct'], betterIsLow: true });

  it('ranks a low rate best and a high proficiency best', () => {
    const schools = lensById('schools');
    if (!schools) throw new Error('lens missing');
    expect(rankedBy(lowIsBetter, ALL)[0]?.value).toBe(0.72);
    expect(rankedBy(schools, ALL)[0]?.area.name).toBe('Forsyth');
  });

  it('breaks ties on name so the list does not reshuffle between renders', () => {
    // Cobb and Cherokee are both 0.72.
    const top = rankedBy(lowIsBetter, ALL)
      .slice(0, 2)
      .map((v) => v.area.name);
    expect(top).toEqual(['Cherokee', 'Cobb']);
  });
});

describe('classing', () => {
  // A one-metric probe so the class boundaries below are the fixture's own
  // numbers, not a five-part sum a reader would have to recompute.
  const lens = probe({ inputs: ['property_tax_rate_pct'], betterIsLow: true });

  it('puts the lowest value in the lightest class and the highest in the darkest', () => {
    const breaks = classBreaks(lens, ALL);
    expect(classOf(0.72, breaks)).toBe(0);
    expect(classOf(1.04, breaks)).toBe(4);
  });

  it('never returns a step outside the ramp', () => {
    const breaks = classBreaks(lens, ALL);
    for (const v of [-100, 0, 0.8, 1.5, 1e9]) {
      const step = classOf(v, breaks);
      expect(step).toBeGreaterThanOrEqual(0);
      expect(step).toBeLessThanOrEqual(4);
      expect(lens.ramp[step]).toBeDefined();
    }
  });

  it('colours every area when they all share one value', () => {
    const flat = [COBB, { ...CHEROKEE, key: 'c2', name: 'Twin' }];
    const breaks = classBreaks(lens, flat);
    expect(colorFor(lens, 0.72, breaks)).toBeDefined();
  });

  it('has no breaks when nothing can be measured', () => {
    expect(classBreaks(lens, [])).toEqual([]);
    expect(legendRange(lens, [])).toBeUndefined();
  });
});

describe('provenance', () => {
  it('flags a value whose inputs are estimates', () => {
    const guessed = county(
      'Guessy',
      { tax: 0.9, school: 40, electric: 150, water: 70, trash: 28 },
      true,
    );
    const lens = lensById('true_cost');
    if (!lens) throw new Error('lens missing');
    expect(valuesFor(lens, [guessed])[0]?.estimated).toBe(true);
    // The control cannot be true cost: since phase222 it declares a flat
    // insurance assumption and is estimated however well sourced its metrics
    // are, so it can only ever answer `true` and proves nothing. The control
    // needs a lens that assumes nothing — a probe, since phase274 left no real
    // cost lens without an assumption.
    const noAssumption = probe({ inputs: ['water_monthly_usd'] });
    expect(valuesFor(noAssumption, [guessed])[0]?.estimated).toBe(true);
    expect(valuesFor(noAssumption, [COBB])[0]?.estimated).toBe(false);
  });

  it('does not flag a cost value because an unrelated metric is estimated', () => {
    const mixed: Area = {
      ...COBB,
      metrics: [
        ...COBB.metrics.filter((m) => m.metric !== 'school_proficiency_pct'),
        metric('school_proficiency_pct', 50, true),
      ],
    };
    // A probe rather than true cost, which is always estimated because of its
    // insurance assumption and so cannot show that an UNRELATED estimate fails
    // to leak — which is what this test is about. The probe sums the same three
    // utility metrics the cut `utilities` lens did and assumes nothing.
    const cost = probe({
      inputs: ['electric_monthly_usd', 'water_monthly_usd', 'trash_monthly_usd'],
      compute: (get) => {
        const e = get('electric_monthly_usd');
        const w = get('water_monthly_usd');
        const t = get('trash_monthly_usd');
        return e === undefined || w === undefined || t === undefined ? undefined : e + w + t;
      },
    });
    const schools = lensById('schools');
    if (!schools) throw new Error('lens missing');
    expect(valuesFor(cost, [mixed])[0]?.estimated).toBe(false);
    expect(valuesFor(schools, [mixed])[0]?.estimated).toBe(true);
  });
});

describe('legend', () => {
  it('prints the real range in the lens’s own units', () => {
    const schools = lensById('schools');
    const cost = lensById('true_cost');
    if (!schools || !cost) throw new Error('lens missing');
    // A percentage lens and a dollar lens, so the formatting half is covered
    // both ways round.
    expect(legendRange(schools, ALL)).toEqual({ low: '33%', high: '62%' });
    expect(legendRange(cost, ALL)?.high).toMatch(/^\$\d/);
  });
});

describe('area kinds', () => {
  it('ignores an area of a kind the lens is not defined on', () => {
    // Deliberately the schools lens against a school DISTRICT: proficiency is
    // stored per county here, so a district-shaped row is the wrong geometry
    // even though it is obviously the right subject.
    const district: Area = { ...FORSYTH, kind: 'school_district', key: 'fcs' };
    const lens = lensById('schools');
    if (!lens) throw new Error('lens missing');
    expect(valuesFor(lens, [district])).toHaveLength(0);
  });
});

// Tests `taxMonthlyUsdFor` directly. They used to go through the `property_tax`
// lens, which was only ever a thin wrapper that divided this function's answer
// by the reference price — so when phase274 cut the lens, the subject under
// test was never in question, just the door these tests walked in through.
describe('property tax comes from the levies, not a stored percentage', () => {
  /** DeKalb's real 2023 levies, plus a deliberately wrong stored rate. */
  const dekalb: Area = {
    key: 'dekalb',
    name: 'DeKalb',
    kind: 'county',
    state: 'GA',
    metrics: [
      metric('county_mo_mills', 17.494),
      metric('county_bond_mills', 0.479),
      metric('school_mo_mills', 22.98),
      metric('school_bond_mills', 0),
      metric('property_tax_rate_pct', 9.99, true),
      metric('electric_monthly_usd', 165),
      metric('water_monthly_usd', 92),
      metric('trash_monthly_usd', 30),
    ],
  };

  it('ignores the stored rate when the levies are present', () => {
    const monthly = taxMonthlyUsdFor('dekalb', lookup(dekalb));
    if (monthly === undefined) throw new Error('not priced');
    // 9.99% is absurd on purpose; the computed figure lands near 1.1%.
    expect(asRatePct(monthly)).toBeLessThan(1.3);
    expect(asRatePct(monthly)).toBeGreaterThan(0.9);
  });

  it('applies the homestead exemption and DeKalb’s EHOST credit', () => {
    const monthly = taxMonthlyUsdFor('dekalb', lookup(dekalb));
    if (monthly === undefined) throw new Error('not priced');
    // The statutory rate on these levies is 1.638%. Anything at or above it
    // means the exemption and credit were not applied.
    expect(asRatePct(monthly)).toBeLessThan(1.638);
  });

  it('falls back to the stored rate when the levies are missing', () => {
    const noLevies: Area = {
      ...dekalb,
      metrics: dekalb.metrics.filter((m) => !m.metric.endsWith('_mills')),
    };
    const monthly = taxMonthlyUsdFor('dekalb', lookup(noLevies));
    if (monthly === undefined) throw new Error('not priced');
    expect(asRatePct(monthly)).toBeCloseTo(9.99, 2);
  });

  it('feeds the same tax figure into the true-cost breakdown', () => {
    const lines = costBreakdown(dekalb);
    const tax = lines?.find((l) => l.label === 'Property tax');
    const monthly = taxMonthlyUsdFor('dekalb', lookup(dekalb));
    if (!tax || monthly === undefined) throw new Error('missing');
    // The breakdown must not compute its own tax: one function, one answer.
    expect(tax.monthlyUsd).toBeCloseTo(monthly, 0);
  });

  it('prices an unverified county at the statutory floor rather than skipping it', () => {
    const unknown: Area = { ...dekalb, key: 'atlantis', name: 'Atlantis' };
    expect(taxMonthlyUsdFor('atlantis', lookup(unknown))).toBeGreaterThan(0);
  });
});

describe('estimated reflects what was read, not what was declared', () => {
  /** Real state-sourced levies beside an estimated fallback rate. */
  const sourcedLevies: Area = {
    key: 'cobb',
    name: 'Cobb',
    kind: 'county',
    state: 'GA',
    metrics: [
      metric('county_mo_mills', 8.46),
      metric('county_bond_mills', 0),
      metric('school_mo_mills', 18.7),
      metric('school_bond_mills', 0),
      metric('property_tax_rate_pct', 0.72, true),
      metric('electric_monthly_usd', 148, true),
      metric('water_monthly_usd', 58, true),
      metric('trash_monthly_usd', 28, true),
    ],
  };

  it('does not call a sourced tax figure an estimate because the unused fallback is one', () => {
    // Straight at the mechanism: what the tax computation READ, against what
    // the area has. `property_tax_rate_pct` is an estimate and is sitting right
    // there — it just never gets reached, so it must not count.
    const { read } = readingMetrics(sourcedLevies, (get) => taxMonthlyUsdFor('cobb', get));
    expect(read.has('property_tax_rate_pct')).toBe(false);
    expect(estimatedFromReads(sourcedLevies, read)).toBe(false);
  });

  it('still calls it an estimate when the fallback is what got used', () => {
    const noLevies: Area = {
      ...sourcedLevies,
      metrics: sourcedLevies.metrics.filter((m) => !m.metric.endsWith('_mills')),
    };
    const { read } = readingMetrics(noLevies, (get) => taxMonthlyUsdFor('cobb', get));
    expect(read.has('property_tax_rate_pct')).toBe(true);
    expect(estimatedFromReads(noLevies, read)).toBe(true);
  });

  it('still flags true cost, whose utility inputs really are estimates', () => {
    const lens = lensById('true_cost');
    if (!lens) throw new Error('lens missing');
    expect(valuesFor(lens, [sourcedLevies])[0]?.estimated).toBe(true);
  });

  it('does not let a computation that read NOTHING pass as sourced', () => {
    // The vacuous case. "No metric it read was an estimate" is trivially true
    // of a computation that read no metrics, so a hard-coded constant earned
    // the strongest provenance claim in the app by consulting nothing. This is
    // how the compare table printed insurance — a flat share of price with no
    // county in it — with no estimate mark.
    const { read } = readingMetrics(sourcedLevies, () => 146);
    expect(read.size).toBe(0);
    expect(estimatedFromReads(sourcedLevies, read)).toBe(true);
  });

  it('still clears a computation that read only sourced metrics', () => {
    // The guard above must not swallow the case it sits next to.
    const { read } = readingMetrics(sourcedLevies, (get) => get('county_mo_mills'));
    expect(read.size).toBe(1);
    expect(estimatedFromReads(sourcedLevies, read)).toBe(false);
  });
});

describe('cost lines name their supplier', () => {
  const priced = (supplier?: {
    name: string;
    share?: number;
    unitPrice?: number;
    unitPriceUnit?: string;
  }): Area => ({
    key: 'fulton',
    name: 'Fulton',
    kind: 'county',
    state: 'GA',
    metrics: [
      metric('property_tax_rate_pct', 1.05),
      {
        ...metric('electric_monthly_usd', 157),
        ...(supplier ? { supplier } : {}),
      },
      metric('water_monthly_usd', 78),
      metric('trash_monthly_usd', 32),
    ],
  });

  const electricLine = (a: Area) => costBreakdown(a)?.find((l) => l.label === 'Electric');

  it('names the utility and its rate', () => {
    const line = electricLine(
      priced({ name: 'Georgia Power Co', unitPrice: 0.14624, unitPriceUnit: 'usd_per_kwh' }),
    );
    expect(line?.note).toContain('Georgia Power Co');
    expect(line?.note).toContain('14.6¢ per kWh');
  });

  it('says what share of the county a supplier covers when it is not all of it', () => {
    const line = electricLine(priced({ name: 'Georgia Power Co', share: 0.55 }));
    expect(line?.note).toContain('55% of the county');
  });

  it('does not say "100% of the county", which is noise', () => {
    const line = electricLine(priced({ name: 'Amicalola EMC', share: 1 }));
    expect(line?.note).toBe('Amicalola EMC');
  });

  it('has no note at all when nothing is known about the supplier', () => {
    expect(electricLine(priced())?.note).toBeUndefined();
  });

  it('leaves lines with no supplier alone', () => {
    const lines = costBreakdown(priced({ name: 'Georgia Power Co' }));
    expect(lines?.find((l) => l.label === 'Property tax')?.note).toBeUndefined();
    expect(lines?.find((l) => l.label === 'Insurance (est.)')?.note).toBeUndefined();
  });

  it('still sums to the true-cost figure with notes attached', () => {
    const area = priced({ name: 'Georgia Power Co', share: 0.55 });
    const lens = lensById('true_cost');
    if (!lens) throw new Error('lens missing');
    const total = costBreakdown(area)?.reduce((n, l) => n + l.monthlyUsd, 0);
    expect(total).toBe(valuesFor(lens, [area])[0]?.value);
  });

  it('ignores a unit price whose unit it does not understand', () => {
    const line = electricLine(
      priced({ name: 'Someone', unitPrice: 3.5, unitPriceUnit: 'usd_per_furlong' }),
    );
    expect(line?.note).toBe('Someone');
  });
});

describe('listOf', () => {
  it('reads as English rather than as a truncated list', () => {
    expect(listOf([])).toBe('');
    expect(listOf(['trash'])).toBe('trash');
    expect(listOf(['water & sewer', 'trash'])).toBe('water & sewer and trash');
    expect(listOf(['tax', 'water & sewer', 'trash'])).toBe('tax, water & sewer and trash');
  });
});

describe('cost lines say which of THEM is a guess', () => {
  /** Tax and electric sourced, water and trash not — production's real shape. */
  const mixed: Area = {
    key: 'fulton',
    name: 'Fulton',
    kind: 'county',
    state: 'GA',
    metrics: [
      metric('county_mo_mills', 8.87),
      metric('county_bond_mills', 0.18),
      metric('school_mo_mills', 17.14),
      metric('school_bond_mills', 0),
      metric('electric_monthly_usd', 157),
      metric('water_monthly_usd', 78, true),
      metric('trash_monthly_usd', 32, true),
    ],
  };

  const flagged = (a: Area) =>
    (costBreakdown(a) ?? []).filter((l) => l.estimated).map((l) => l.label);

  it('flags only the lines that are actually guesses', () => {
    expect(flagged(mixed).sort()).toEqual(['Insurance', 'Trash', 'Water & sewer']);
  });

  it('does not flag tax when it came from the levies', () => {
    expect(flagged(mixed)).not.toContain('Property tax');
  });

  it('does not flag tax because the UNUSED fallback rate is an estimate', () => {
    // Production's real shape: the seeded `property_tax_rate_pct` is still in
    // the table as a fallback the computation never reads once the levies are
    // there. Asking whether any declared input is an estimate printed the GA
    // DOR's own adopted millage under a "still our estimate" footnote.
    const withStaleFallback: Area = {
      ...mixed,
      metrics: [...mixed.metrics, metric('property_tax_rate_pct', 1.05, true)],
    };
    expect(flagged(withStaleFallback)).not.toContain('Property tax');
  });

  it('flags tax when it fell back to a stored estimate', () => {
    const noLevies: Area = {
      ...mixed,
      metrics: [
        ...mixed.metrics.filter((m) => !m.metric.endsWith('_mills')),
        metric('property_tax_rate_pct', 1.05, true),
      ],
    };
    expect(flagged(noLevies)).toContain('Property tax');
  });

  it('always flags insurance — it is one flat assumption, not a measurement', () => {
    const allSourced: Area = {
      ...mixed,
      metrics: mixed.metrics.map((m) => ({ ...m, estimated: false })),
    };
    expect(flagged(allSourced)).toEqual(['Insurance']);
  });

  it('still sums to the true-cost figure', () => {
    const lens = lensById('true_cost');
    if (!lens) throw new Error('lens missing');
    const total = costBreakdown(mixed)?.reduce((n, l) => n + l.monthlyUsd, 0);
    expect(total).toBe(valuesFor(lens, [mixed])[0]?.value);
  });
});

// Was `describe('the electricity lens')` until phase274 cut that lens. The
// block never tested electricity — it tested what the machinery does with a
// lens that has exactly ONE input, which is the case with no sum to hide a
// missing part inside. That case still exists (schools is one), so the tests
// stay and take a probe.
describe('a lens with a single input', () => {
  const county = (name: string, monthly: number, estimated = false): Area => ({
    key: name.toLowerCase(),
    name,
    kind: 'county',
    state: 'GA',
    metrics: [metric('electric_monthly_usd', monthly, estimated)],
  });

  const lens = probe({ inputs: ['electric_monthly_usd'] });

  it('ranks the smallest value first when low is better', () => {
    const ranked = rankedBy(lens, [
      county('Meriwether', 189),
      county('Coweta', 125),
      county('Fulton', 157),
    ]);
    expect(ranked.map((r) => r.area.name)).toEqual(['Coweta', 'Fulton', 'Meriwether']);
  });

  it('is not an estimate when the figure is sourced', () => {
    expect(valuesFor(lens, [county('Fulton', 157)])[0]?.estimated).toBe(false);
  });

  it('stays an estimate when the one figure it reads is flagged', () => {
    expect(valuesFor(lens, [county('Cobb', 148, true)])[0]?.estimated).toBe(true);
  });

  it('skips a county with no figure at all rather than pricing it at zero', () => {
    const bare: Area = { ...county('Nowhere', 0), metrics: [] };
    expect(valuesFor(lens, [bare])).toHaveLength(0);
  });
});

describe('the ranking footnote names what is actually a guess', () => {
  /** Production's real shape: tax and electricity sourced, water and trash not. */
  const county = (name: string): Area => ({
    key: name.toLowerCase(),
    name,
    kind: 'county',
    state: 'GA',
    metrics: [
      metric('county_mo_mills', 8.87),
      metric('county_bond_mills', 0.18),
      metric('school_mo_mills', 17.14),
      metric('school_bond_mills', 0),
      metric('school_proficiency_pct', 54),
      metric('electric_monthly_usd', 157),
      metric('water_monthly_usd', 78, true),
      metric('trash_monthly_usd', 32, true),
    ],
  });
  const areas = [county('Fulton'), county('Cobb')];
  const note = (id: string) => {
    const lens = lensById(id);
    if (!lens) throw new Error(`no lens ${id}`);
    return estimateNoteFor(lens, areas);
  };

  it('names the estimated parts of a composite figure, and defends the rest', () => {
    // The old note said "we have not sourced this county's figure yet" over a
    // number whose biggest line comes from the GA DOR.
    const n = note('true_cost');
    expect(n).toContain('trash');
    expect(n).toContain('water & sewer');
    expect(n).toContain('The rest of each figure comes from a public record');
  });

  it('says nothing at all when a lens has no estimates', () => {
    expect(note('schools')).toBeUndefined();
    // And for a multi-input lens reading only sourced levies, which is where
    // the `property_tax` lens used to make this point.
    const levies = probe({
      inputs: ['county_mo_mills', 'school_mo_mills'],
      compute: (get, key) => taxMonthlyUsdFor(key, get),
    });
    expect(estimateNoteFor(levies, areas)).toBeUndefined();
  });

  it('does not name a metric the computation never read', () => {
    // Electricity is sourced here, so it must not appear in true cost's note
    // — and neither may the unused property_tax_rate_pct fallback.
    const n = note('true_cost') ?? '';
    expect(n).not.toContain('electricity');
    expect(n).not.toContain('property tax');
  });

  it('does not promise a sourced remainder when there is none', () => {
    // A single-metric lens whose one input is a guess has no "rest".
    const guessed = areas.map((a) => ({
      ...a,
      metrics: a.metrics.map((m) =>
        m.metric === 'electric_monthly_usd' ? { ...m, estimated: true } : m,
      ),
    }));
    // A one-input lens does not name its own input — "electricity is still our
    // estimate" under a lens called Electricity says it twice.
    const lens = probe({ inputs: ['electric_monthly_usd'] });
    const n = estimateNoteFor(lens, guessed) ?? '';
    expect(n).toBe('* still our estimate for the counties marked.');
  });

  it('agrees in number with what it lists', () => {
    expect(note('true_cost')).toContain('are still our estimate');
    const oneOnly = areas.map((a) => ({
      ...a,
      metrics: a.metrics.map((m) =>
        m.metric === 'water_monthly_usd' ? { ...m, estimated: false } : m,
      ),
    }));
    // The SINGULAR case has to come from a lens with no declared assumption:
    // true cost always lists insurance, so it can never be down to one item.
    // A probe, since phase274 left no real cost lens without an assumption.
    const lens = probe({
      inputs: ['electric_monthly_usd', 'water_monthly_usd', 'trash_monthly_usd'],
      compute: (get) => {
        const e = get('electric_monthly_usd');
        const w = get('water_monthly_usd');
        const t = get('trash_monthly_usd');
        return e === undefined || w === undefined || t === undefined ? undefined : e + w + t;
      },
    });
    expect(estimateNoteFor(lens, oneOnly)).toContain('trash is still our estimate');
    // And true cost, which now lists two, keeps the plural.
    const cost = lensById('true_cost');
    if (!cost) throw new Error('no lens');
    expect(estimateNoteFor(cost, oneOnly)).toBe(
      '* insurance and trash are still our estimate. The rest of each figure comes from a public record.',
    );
  });
});

describe('the footnote separates always-a-guess from sometimes-a-guess', () => {
  const county = (name: string, electricEstimated: boolean): Area => ({
    key: name.toLowerCase(),
    name,
    kind: 'county',
    state: 'GA',
    metrics: [
      metric('county_mo_mills', 8.87),
      metric('county_bond_mills', 0.18),
      metric('school_mo_mills', 17.14),
      metric('school_bond_mills', 0),
      metric('electric_monthly_usd', 157, electricEstimated),
      metric('water_monthly_usd', 78, true),
      metric('trash_monthly_usd', 32, true),
    ],
  });
  // Production's real shape: electricity sourced everywhere except the two
  // counties genuinely split between suppliers.
  const areas = [county('Fulton', false), county('Forsyth', false), county('Cobb', true)];
  const lens = lensById('true_cost');
  if (!lens) throw new Error('no lens');

  it('does not lump a mostly-sourced input in with the always-guessed ones', () => {
    // Listing electricity beside trash implied the whole line was invented,
    // when it is sourced in 27 of 29 counties.
    const n = estimateNoteFor(lens, areas) ?? '';
    expect(n).toContain('trash and water & sewer are still our estimate');
    expect(n).toContain('electricity in 1 of them');
  });

  it('counts only the rows that are actually marked', () => {
    // Fulton and Forsyth are not flagged at all for electricity, so the count
    // is against flagged rows, not against every county on the map.
    const n = estimateNoteFor(lens, areas) ?? '';
    expect(n).not.toContain('in 3 of them');
  });

  it('says nothing about sometimes when a guess is universal', () => {
    const allSame = areas.map((a) => county(a.name, false));
    const n = estimateNoteFor(lens, allSame) ?? '';
    expect(n).toContain('trash and water & sewer are still our estimate');
    expect(n).not.toContain('of them');
  });
});

describe('the compare table gets the same footnote, from its own rows', () => {
  const row = (label: string, marked: number, total = 3) => ({
    label,
    cells: Array.from({ length: total }, (_, i) => ({ estimated: i < marked })),
  });

  it('names the fully-estimated rows and defends the rest', () => {
    // Production's shape: tax sourced, utilities and insurance not.
    const note = estimateNoteForRows([
      row('True cost / month', 3),
      row('Schools', 0),
      row('Property tax / year', 0),
      row('Utilities & trash / month', 3),
      row('Insurance / month', 3),
    ]);
    expect(note).toContain('Every other row comes from a public record');
    expect(note).toContain('insurance');
    expect(note).toContain('utilities & trash');
  });

  it('strips the unit half of a row label, which is not part of the name', () => {
    // "property tax / year" would read as a fraction in a sentence.
    const note = estimateNoteForRows([row('Property tax / year', 3), row('Schools', 0)]);
    expect(note).toContain('property tax is still our estimate');
    expect(note).not.toContain('/ year');
  });

  it('counts a row estimated in only some columns', () => {
    const note = estimateNoteForRows([row('Electricity', 1), row('Schools', 0)]);
    expect(note).toContain('electricity in 1 of them');
  });

  it('says nothing when every row is sourced', () => {
    expect(estimateNoteForRows([row('Schools', 0), row('Property tax', 0)])).toBeUndefined();
  });

  it('does not promise a sourced remainder when there is none', () => {
    const note = estimateNoteForRows([row('Trash', 3), row('Water', 3)]);
    expect(note).not.toContain('Every other row');
  });
});

describe('a blended figure does not credit one utility with the average', () => {
  const withSupplier = (supplier: AreaMetric['supplier']): Area => ({
    key: 'cobb',
    name: 'Cobb',
    kind: 'county',
    state: 'GA',
    metrics: [
      metric('county_mo_mills', 8.46),
      metric('county_bond_mills', 0),
      metric('school_mo_mills', 18.7),
      metric('school_bond_mills', 0),
      { ...metric('electric_monthly_usd', 141), supplier },
      metric('water_monthly_usd', 58, true),
      metric('trash_monthly_usd', 28, true),
    ],
  });
  const noteOf = (a: Area) => costBreakdown(a)?.find((l) => l.label === 'Electric')?.note;

  it('says the price is an average when several utilities serve the county', () => {
    // Cobb EMC covers 41% of Cobb and does not charge 13.1¢ — that is the
    // county's mean. Printing the two side by side would read as its rate.
    const note = noteOf(
      withSupplier({
        name: 'Cobb EMC',
        count: 4,
        share: 0.41,
        unitPrice: 0.13122,
        unitPriceUnit: 'usd_per_kwh',
      }),
    );
    expect(note).toContain('averaged across 4 utilities');
    expect(note).toContain('13.1¢ per kWh');
    expect(note).toContain('largest is Cobb EMC at 41%');
  });

  it('still names a single utility plainly', () => {
    const note = noteOf(
      withSupplier({
        name: 'Georgia Power Co',
        share: 0.98,
        unitPrice: 0.1549,
        unitPriceUnit: 'usd_per_kwh',
      }),
    );
    expect(note).toBe('Georgia Power Co · 15.5¢ per kWh');
  });

  it('does not say "averaged" for a county with one utility', () => {
    const note = noteOf(withSupplier({ name: 'Solo Power', count: 1, share: 1 }));
    expect(note).toBe('Solo Power');
  });
});

describe('"averaged across N" is a share test, not a count', () => {
  const noteFor = (supplier: AreaMetric['supplier']) =>
    costBreakdown({
      key: 'x',
      name: 'X',
      kind: 'county',
      state: 'GA',
      metrics: [
        metric('county_mo_mills', 8.46),
        metric('county_bond_mills', 0),
        metric('school_mo_mills', 18.7),
        metric('school_bond_mills', 0),
        { ...metric('electric_monthly_usd', 166), supplier },
        metric('water_monthly_usd', 58, true),
        metric('trash_monthly_usd', 28, true),
      ],
    })?.find((l) => l.label === 'Electric')?.note;

  it('does not call a county mixed when one utility covers nearly all of it', () => {
    // Hall has four utilities and Georgia Power covers 98%. The blend and that
    // one rate agree to within a tenth of a cent, so "averaged across 4
    // utilities" overstates the mixing.
    expect(
      noteFor({
        name: 'Georgia Power Co',
        count: 4,
        share: 0.98,
        unitPrice: 0.1542,
        unitPriceUnit: 'usd_per_kwh',
      }),
    ).toBe('Georgia Power Co · 15.4¢ per kWh');
  });

  it('still calls it mixed when the largest covers a real minority', () => {
    expect(
      noteFor({
        name: 'Cobb EMC',
        count: 4,
        share: 0.41,
        unitPrice: 0.1312,
        unitPriceUnit: 'usd_per_kwh',
      }),
    ).toBe('averaged across 4 utilities · 13.1¢ per kWh · largest is Cobb EMC at 41%');
  });
});

describe('the water line says when a county is largely on wells', () => {
  const withWater = (publicPct?: number): Area => ({
    key: 'pike',
    name: 'Pike',
    kind: 'county',
    state: 'GA',
    metrics: [
      metric('county_mo_mills', 8.46),
      metric('county_bond_mills', 0),
      metric('school_mo_mills', 18.7),
      metric('school_bond_mills', 0),
      metric('electric_monthly_usd', 173),
      metric('water_monthly_usd', 58, true),
      metric('trash_monthly_usd', 28, true),
      ...(publicPct === undefined ? [] : [metric('public_water_pct', publicPct)]),
    ],
  });
  const waterNote = (publicPct?: number) =>
    costBreakdown(withWater(publicPct))?.find((l) => l.label === 'Water & sewer')?.note;

  it('states a majority-well county as a percentage', () => {
    // Pike: 20% on public supply. "1 in 1.25 homes" would be absurd.
    expect(waterNote(20)).toBe('about 80% of homes here have a well and no water bill');
  });

  it('states a minority as a ratio, which reads better than a small percentage', () => {
    expect(waterNote(88)).toBe('about 1 in 8 homes here has a well and no water bill');
  });

  it('says nothing where almost everyone is on the mains', () => {
    // DeKalb and Gwinnett are at 100%. A note there is noise.
    expect(waterNote(100)).toBeUndefined();
    expect(waterNote(99)).toBeUndefined();
  });

  it('says nothing when the share is unknown', () => {
    expect(waterNote(undefined)).toBeUndefined();
  });

  it('never claims the figure describes a minority when it describes most people', () => {
    // The wording this replaced said a county below 90% was one where "a flat
    // water bill describes a minority". At 88% it describes seven eighths.
    for (const pct of [88, 85, 80, 75]) {
      expect(waterNote(pct)).not.toMatch(/minority|most|nobody/i);
    }
  });
});

describe('a lens that bakes in an assumption says so', () => {
  const county = (opts: { waterEstimated?: boolean } = {}): Area => ({
    key: 'cobb',
    name: 'Cobb',
    kind: 'county',
    state: 'GA',
    metrics: [
      metric('county_mo_mills', 8.46),
      metric('county_bond_mills', 0),
      metric('school_mo_mills', 18.7),
      metric('school_bond_mills', 0),
      metric('electric_monthly_usd', 141),
      metric('water_monthly_usd', 58, opts.waterEstimated ?? true),
      metric('trash_monthly_usd', 28, opts.waterEstimated ?? true),
    ],
  });

  it('pins the declaration to the arithmetic', () => {
    // `assumes` is a DECLARATION, and this file has three scars from
    // declarations drifting from what a computation does. True cost must equal
    // its metrics plus exactly the assumption it names — remove insurance from
    // `compute` without removing it from `assumes`, or vice versa, and this
    // fails.
    const lens = lensById('true_cost');
    if (!lens) throw new Error('lens missing');
    const a = county();
    const value = valuesFor(lens, [a])[0]?.value;
    const byKey = new Map(a.metrics.map((m) => [m.metric, m.value]));
    const tax = taxMonthlyUsdFor(a.key, (m) => byKey.get(m));
    if (tax === undefined) throw new Error('no tax');
    const metricsOnly = tax + 141 + 58 + 28;
    expect(lens.assumes).toEqual(['insurance']);
    expect(value).toBeCloseTo(metricsOnly + insuranceMonthlyUsd, 6);
  });

  it('names the assumption in the footnote', () => {
    // The sentence used to end "the rest of each figure comes from a public
    // record" over a figure a fifth of which is a flat share of price.
    const lens = lensById('true_cost');
    if (!lens) throw new Error('lens missing');
    const note = estimateNoteFor(lens, [county()]);
    expect(note).toContain('insurance');
    expect(note).toContain('are still our estimate');
  });

  it('still marks the value estimated when every metric it reads is sourced', () => {
    // The latent half: sourcing water and trash would otherwise mark true cost
    // fully sourced while the insurance assumption stayed inside it.
    const lens = lensById('true_cost');
    if (!lens) throw new Error('lens missing');
    const sourced = county({ waterEstimated: false });
    expect(sourced.metrics.every((m) => !m.estimated)).toBe(true);
    expect(valuesFor(lens, [sourced])[0]?.estimated).toBe(true);
    expect(estimateNoteFor(lens, [sourced])).toContain('insurance');
  });

  it('leaves a lens with no assumption alone', () => {
    // Electric + water + trash, assuming nothing, so its footnote must not
    // grow an insurance clause. A probe: every real cost lens assumes
    // insurance since phase274 merged them into one.
    const lens = probe({
      inputs: ['electric_monthly_usd', 'water_monthly_usd', 'trash_monthly_usd'],
      compute: (get) => {
        const e = get('electric_monthly_usd');
        const w = get('water_monthly_usd');
        const t = get('trash_monthly_usd');
        return e === undefined || w === undefined || t === undefined ? undefined : e + w + t;
      },
    });
    expect(lens.assumes).toBeUndefined();
    expect(estimateNoteFor(lens, [county()])).not.toContain('insurance');
  });
});

describe('a water figure says when it has no sewer half', () => {
  const water = (opts: { coversSewer?: boolean; publicPct?: number }): Area => ({
    key: 'fayette',
    name: 'Fayette',
    kind: 'county',
    state: 'GA',
    metrics: [
      metric('county_mo_mills', 8.46),
      metric('county_bond_mills', 0),
      metric('school_mo_mills', 18.7),
      metric('school_bond_mills', 0),
      metric('electric_monthly_usd', 140),
      {
        ...metric('water_monthly_usd', 25, true),
        ...(opts.coversSewer === undefined ? {} : { coversSewer: opts.coversSewer }),
      },
      metric('trash_monthly_usd', 30, true),
      ...(opts.publicPct === undefined ? [] : [metric('public_water_pct', opts.publicPct)]),
    ],
  });
  const noteOf = (a: Area) => costBreakdown(a)?.find((l) => l.label === 'Water & sewer')?.note;

  it('says so when the county has no sewer utility', () => {
    // Fayette's $25 sits at the bottom of the water ranking, and it gets there
    // partly by not counting a component: water-only counties average $41 a
    // month against $68 for the rest. A reader comparing $25 with $75 cannot
    // tell how much of the gap is cheapness and how much is absence.
    expect(noteOf(water({ coversSewer: false }))).toBe(
      'water only — no sewer utility in this county',
    );
  });

  it('says nothing when the figure includes both halves', () => {
    // The normal case does not need announcing; only a missing half does.
    expect(noteOf(water({ coversSewer: true }))).toBeUndefined();
    expect(noteOf(water({}))).toBeUndefined();
  });

  it('sits alongside the well-share note rather than replacing it', () => {
    const note = noteOf(water({ coversSewer: false, publicPct: 83 }));
    expect(note).toContain('water only');
    expect(note).toContain('a well and no water bill');
  });
});

describe('the tax line says what the published rate leaves out', () => {
  const county = (min?: number, max?: number): Area => ({
    key: 'hall',
    name: 'Hall',
    kind: 'county',
    state: 'GA',
    metrics: [
      metric('county_mo_mills', 3.44),
      metric('county_bond_mills', 0),
      metric('school_mo_mills', 15.64),
      metric('school_bond_mills', 0),
      metric('electric_monthly_usd', 166),
      metric('water_monthly_usd', 59, true),
      metric('trash_monthly_usd', 30, true),
      ...(min === undefined ? [] : [metric('district_millage_omitted_min_pct', min)]),
      ...(max === undefined ? [] : [metric('district_millage_omitted_max_pct', max)]),
    ],
  });
  const noteOf = (a: Area) => costBreakdown(a)?.find((l) => l.label === 'Property tax')?.note;

  it('states a range, because which levies a home pays depends where it is', () => {
    // Hall: 0.169–0.347 points of market value on a $500k home.
    const note = noteOf(county(0.169, 0.347));
    expect(note).toContain('$70–$145 a month more');
    expect(note).toContain('depending where in the county');
  });

  it('says "up to" when the floor is zero', () => {
    // Every omitted levy ambiguous: a home might pay none of them.
    expect(noteOf(county(0, 0.166))).toContain('up to $69 a month more');
  });

  it('says nothing for a county that omits nothing', () => {
    expect(noteOf(county())).toBeUndefined();
    expect(noteOf(county(0, 0))).toBeUndefined();
  });

  it('does not turn a rounding-sized omission into a sentence', () => {
    // Below a dollar a month there is nothing worth saying.
    expect(noteOf(county(0, 0.0001))).toBeUndefined();
  });

  it('never claims to have corrected the figure', () => {
    // The correction needs a ruling on which levies apply where. The note
    // discloses; it must not imply the number already accounts for them.
    const note = noteOf(county(0.169, 0.347)) ?? '';
    expect(note).toMatch(/excludes/);
    expect(note).not.toMatch(/includ(es|ing)|corrected|adjusted/);
  });
});

describe('a missing levy is not a levy of zero', () => {
  const cobb = (drop?: MetricKey): Area => ({
    key: 'henry',
    name: 'Henry',
    kind: 'county',
    state: 'GA',
    metrics: [
      metric('county_mo_mills', 12.733),
      metric('county_bond_mills', 0),
      metric('school_mo_mills', 20),
      // Henry's real school bond. Bond millage is never reduced by a homestead
      // exemption, so it lands in full on the bill.
      metric('school_bond_mills', 3.628),
      metric('property_tax_rate_pct', 0.5, true),
      metric('electric_monthly_usd', 141),
      metric('water_monthly_usd', 66, true),
      metric('trash_monthly_usd', 30, true),
    ].filter((m) => m.metric !== drop),
  });

  it('prices from the levies when all four are present', () => {
    const withAll = taxMonthlyUsdFor(cobb().key, (m) => {
      const hit = cobb().metrics.find((x) => x.metric === m);
      return hit === undefined ? undefined : Number(hit.value);
    });
    // Well above what the seeded 0.5% fallback would give ($208).
    expect(withAll).toBeGreaterThan(300);
  });

  it('refuses to price from three of the four levies', () => {
    // `?? 0` used to compute a tax 3.628 mills light — about $60 a month, and
    // entirely plausible-looking. The seeded fallback is not the answer either:
    // it would have given $208 against a real ~$583, which is further off. A
    // broken load drops the county out of the ranking instead.
    const a = cobb('school_bond_mills');
    const got = taxMonthlyUsdFor(a.key, (m) => {
      const hit = a.metrics.find((x) => x.metric === m);
      return hit === undefined ? undefined : Number(hit.value);
    });
    expect(got).toBeUndefined();
  });

  it('still uses the stored rate for a county with NO millage at all', () => {
    // That is what the fallback is for — a county never scraped — and it must
    // survive the stricter rule above.
    const got = taxMonthlyUsdFor('nowhere', (m) =>
      m === 'property_tax_rate_pct' ? 0.5 : undefined,
    );
    expect(got).toBe(taxMonthlyUsd(0.5));
  });
});
