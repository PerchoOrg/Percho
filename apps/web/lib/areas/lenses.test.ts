import {
  type Area,
  type AreaMetric,
  DEFAULT_LENS,
  LENSES,
  type MetricKey,
  REFERENCE_HOME_USD,
  classBreaks,
  classOf,
  colorFor,
  costBreakdown,
  estimateNoteFor,
  insuranceMonthlyUsd,
  legendRange,
  lensById,
  listOf,
  rankedBy,
  taxMonthlyUsd,
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
  it('ranks a low tax rate best and a high proficiency best', () => {
    const tax = lensById('property_tax');
    const schools = lensById('schools');
    if (!tax || !schools) throw new Error('lens missing');
    expect(rankedBy(tax, ALL)[0]?.value).toBe(0.72);
    expect(rankedBy(schools, ALL)[0]?.area.name).toBe('Forsyth');
  });

  it('breaks ties on name so the list does not reshuffle between renders', () => {
    const tax = lensById('property_tax');
    if (!tax) throw new Error('lens missing');
    // Cobb and Cherokee are both 0.72.
    const top = rankedBy(tax, ALL)
      .slice(0, 2)
      .map((v) => v.area.name);
    expect(top).toEqual(['Cherokee', 'Cobb']);
  });
});

describe('classing', () => {
  const lens = lensById('property_tax');
  if (!lens) throw new Error('lens missing');

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
    expect(valuesFor(lens, [COBB])[0]?.estimated).toBe(false);
  });

  it('does not flag a cost value because an unrelated metric is estimated', () => {
    const mixed: Area = {
      ...COBB,
      metrics: [
        ...COBB.metrics.filter((m) => m.metric !== 'school_proficiency_pct'),
        metric('school_proficiency_pct', 50, true),
      ],
    };
    const cost = lensById('true_cost');
    const schools = lensById('schools');
    if (!cost || !schools) throw new Error('lens missing');
    expect(valuesFor(cost, [mixed])[0]?.estimated).toBe(false);
    expect(valuesFor(schools, [mixed])[0]?.estimated).toBe(true);
  });
});

describe('legend', () => {
  it('prints the real range in the lens’s own units', () => {
    const tax = lensById('property_tax');
    const cost = lensById('true_cost');
    if (!tax || !cost) throw new Error('lens missing');
    expect(legendRange(tax, ALL)).toEqual({ low: '0.72%', high: '1.04%' });
    expect(legendRange(cost, ALL)?.high).toMatch(/^\$\d/);
  });
});

describe('area kinds', () => {
  it('ignores an area of a kind the lens is not defined on', () => {
    const district: Area = { ...FORSYTH, kind: 'school_district', key: 'fcs' };
    const lens = lensById('property_tax');
    if (!lens) throw new Error('lens missing');
    expect(valuesFor(lens, [district])).toHaveLength(0);
  });
});

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
    const lens = lensById('property_tax');
    if (!lens) throw new Error('lens missing');
    const [value] = valuesFor(lens, [dekalb]);
    // 9.99% is absurd on purpose; the computed figure lands near 1.1%.
    expect(value?.value).toBeLessThan(1.3);
    expect(value?.value).toBeGreaterThan(0.9);
  });

  it('applies the homestead exemption and DeKalb’s EHOST credit', () => {
    const lens = lensById('property_tax');
    if (!lens) throw new Error('lens missing');
    // The statutory rate on these levies is 1.638%. Anything at or above it
    // means the exemption and credit were not applied.
    const [value] = valuesFor(lens, [dekalb]);
    expect(value?.value).toBeLessThan(1.638);
  });

  it('falls back to the stored rate when the levies are missing', () => {
    const lens = lensById('property_tax');
    if (!lens) throw new Error('lens missing');
    const noLevies: Area = {
      ...dekalb,
      metrics: dekalb.metrics.filter((m) => !m.metric.endsWith('_mills')),
    };
    expect(valuesFor(lens, [noLevies])[0]?.value).toBeCloseTo(9.99, 2);
  });

  it('feeds the same tax figure into the true-cost breakdown', () => {
    const lines = costBreakdown(dekalb);
    const tax = lines?.find((l) => l.label === 'Property tax');
    const lens = lensById('property_tax');
    if (!lens || !tax) throw new Error('missing');
    const pct = valuesFor(lens, [dekalb])[0]?.value ?? 0;
    // The two faces must not disagree: rate x price / 12 is the monthly line.
    expect(tax.monthlyUsd).toBeCloseTo(((pct / 100) * REFERENCE_HOME_USD) / 12, 0);
  });

  it('prices an unverified county at the statutory floor rather than skipping it', () => {
    const lens = lensById('property_tax');
    if (!lens) throw new Error('lens missing');
    const unknown: Area = { ...dekalb, key: 'atlantis', name: 'Atlantis' };
    expect(valuesFor(lens, [unknown])[0]?.value).toBeGreaterThan(0);
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
    const lens = lensById('property_tax');
    if (!lens) throw new Error('lens missing');
    expect(valuesFor(lens, [sourcedLevies])[0]?.estimated).toBe(false);
  });

  it('still calls it an estimate when the fallback is what got used', () => {
    const lens = lensById('property_tax');
    if (!lens) throw new Error('lens missing');
    const noLevies: Area = {
      ...sourcedLevies,
      metrics: sourcedLevies.metrics.filter((m) => !m.metric.endsWith('_mills')),
    };
    expect(valuesFor(lens, [noLevies])[0]?.estimated).toBe(true);
  });

  it('still flags true cost, whose utility inputs really are estimates', () => {
    const lens = lensById('true_cost');
    if (!lens) throw new Error('lens missing');
    expect(valuesFor(lens, [sourcedLevies])[0]?.estimated).toBe(true);
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

describe('the electricity lens', () => {
  const county = (name: string, monthly: number, estimated = false): Area => ({
    key: name.toLowerCase(),
    name,
    kind: 'county',
    state: 'GA',
    metrics: [metric('electric_monthly_usd', monthly, estimated)],
  });

  const lens = lensById('electric');
  if (!lens) throw new Error('electric lens missing');

  it('exists so a sourced figure is not hidden inside an estimated aggregate', () => {
    // Electricity is the only utility we have a source for; combined with
    // water and trash it reads as an estimate, which is what it was doing.
    expect(lens.inputs).toEqual(['electric_monthly_usd']);
  });

  it('ranks the cheapest power first', () => {
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

  it('stays an estimate for a county with no majority provider', () => {
    // Cobb and Henry are genuinely split between two utilities.
    expect(valuesFor(lens, [county('Cobb', 148, true)])[0]?.estimated).toBe(true);
  });

  it('skips a county with no electric figure rather than pricing it at zero', () => {
    const bare: Area = { ...county('Nowhere', 0), metrics: [] };
    expect(valuesFor(lens, [bare])).toHaveLength(0);
  });

  it('has a ramp distinct from every other lens', () => {
    // Two lenses sharing a hue would read as the same map recoloured.
    const others = LENSES.filter((l) => l.id !== 'electric');
    for (const o of others) {
      expect(o.ramp[4], `${o.id} shares electric's darkest step`).not.toBe(lens.ramp[4]);
    }
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
    expect(note('property_tax')).toBeUndefined();
    expect(note('schools')).toBeUndefined();
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
    const lens = lensById('electric');
    if (!lens) throw new Error('no electric lens');
    // A one-input lens does not name its own input — "electricity is still our
    // estimate" under a lens called Electricity says it twice.
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
    const lens = lensById('true_cost');
    if (!lens) throw new Error('no lens');
    expect(estimateNoteFor(lens, oneOnly)).toContain('trash is still our estimate');
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
