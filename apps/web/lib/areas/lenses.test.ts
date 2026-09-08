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
  insuranceMonthlyUsd,
  legendRange,
  lensById,
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
