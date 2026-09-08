import {
  ASSESSMENT_RATIO,
  type CountyMills,
  HOMESTEAD_EXEMPTIONS,
  STATUTORY_FLOOR,
  TAX_CREDITS,
  estimatePropertyTax,
} from '@percho/shared/property-tax';
import { describe, expect, it } from 'vitest';

/** DeKalb's real 2023 county-wide levies, from the DOR millage report. */
const DEKALB: CountyMills = {
  countyMo: 17.494,
  countyBond: 0.479,
  schoolMo: 22.98,
  schoolBond: 0,
};

/** Fulton's, for a county with a large county exemption and a small school one. */
const FULTON: CountyMills = {
  countyMo: 8.87,
  countyBond: 0.18,
  schoolMo: 17.14,
  schoolBond: 0,
};

describe('the shape of the answer', () => {
  it('is a bill, not a rate — the effective rate is derived', () => {
    const est = estimatePropertyTax(500_000, FULTON, 'fulton');
    expect(est?.annualUsd).toBeGreaterThan(0);
    expect(est?.effectivePct).toBeCloseTo(((est?.annualUsd ?? 0) / 500_000) * 100, 3);
  });

  it('rises with price, because the exemption is a fixed dollar amount', () => {
    // This is the whole reason a per-county percentage cannot be right.
    const small = estimatePropertyTax(200_000, FULTON, 'fulton');
    const large = estimatePropertyTax(900_000, FULTON, 'fulton');
    expect(small?.effectivePct).toBeLessThan(large?.effectivePct ?? 0);
  });

  it('approaches but never reaches the no-homestead rate as price grows', () => {
    const huge = estimatePropertyTax(50_000_000, FULTON, 'fulton');
    const statutory =
      ((FULTON.countyMo + FULTON.countyBond + FULTON.schoolMo + FULTON.schoolBond) *
        ASSESSMENT_RATIO) /
      10;
    expect(huge?.effectivePct).toBeLessThan(statutory);
    expect(huge?.effectivePct).toBeGreaterThan(statutory - 0.01);
  });

  it('has no answer when the county’s mills are unknown', () => {
    expect(estimatePropertyTax(500_000, undefined, 'fulton')).toBeUndefined();
  });

  it('has no answer for a price of zero', () => {
    expect(estimatePropertyTax(0, FULTON, 'fulton')).toBeUndefined();
  });
});

describe('exemptions reach M&O and never bond', () => {
  it('taxes the bond levy on the full assessed value', () => {
    const est = estimatePropertyTax(500_000, FULTON, 'fulton');
    const bond = est?.lines.find((l) => l.label === 'County bond');
    // 40% of 500k = 200,000 assessed, at 0.180 mills, with NO exemption.
    expect(bond?.annualUsd).toBeCloseTo((200_000 * 0.18) / 1000, 2);
  });

  it('reduces the county M&O base by the county exemption', () => {
    const est = estimatePropertyTax(500_000, FULTON, 'fulton');
    const county = est?.lines.find((l) => l.label === 'County');
    // (200,000 − 30,000) × 8.870 / 1000
    expect(county?.annualUsd).toBeCloseTo(((200_000 - 30_000) * 8.87) / 1000, 2);
  });

  it('uses the school exemption for school, not the county one', () => {
    // Fulton is the case that catches a copy-paste: $30,000 county, $2,000
    // school, and school is the bigger levy.
    const est = estimatePropertyTax(500_000, FULTON, 'fulton');
    const school = est?.lines.find((l) => l.label === 'School');
    expect(school?.annualUsd).toBeCloseTo(((200_000 - 2_000) * 17.14) / 1000, 2);
  });

  it('never lets an exemption larger than the base produce negative tax', () => {
    const est = estimatePropertyTax(20_000, FULTON, 'fulton');
    // Assessed 8,000 against a 30,000 county exemption.
    expect(est?.lines.find((l) => l.label === 'County')).toBeUndefined();
    expect(est?.annualUsd).toBeGreaterThanOrEqual(0);
  });
});

describe('DeKalb’s EHOST credit', () => {
  it('credits away the general and hospital mills for a homesteaded home', () => {
    const est = estimatePropertyTax(500_000, DEKALB, 'dekalb');
    const county = est?.lines.find((l) => l.label === 'County');
    const credited = DEKALB.countyMo - (TAX_CREDITS.dekalb?.countyMillsCredited ?? 0);
    expect(county?.annualUsd).toBeCloseTo(((200_000 - 10_000) * credited) / 1000, 2);
  });

  it('is what puts DeKalb’s buyer rate near its published effective rate', () => {
    // Statutory DeKalb is 1.638%. Without EHOST the answer stays near that and
    // the county reads as the most expensive in the metro, which is the error
    // this whole module exists to avoid.
    const est = estimatePropertyTax(500_000, DEKALB, 'dekalb');
    expect(est?.effectivePct).toBeLessThan(1.3);
    expect(est?.effectivePct).toBeGreaterThan(0.9);
  });

  it('reports the no-homestead figure alongside, unreduced', () => {
    const est = estimatePropertyTax(500_000, DEKALB, 'dekalb');
    const statutory = (200_000 * (DEKALB.countyMo + DEKALB.countyBond + DEKALB.schoolMo)) / 1000;
    expect(est?.annualUsdNoHomestead).toBeCloseTo(statutory, 2);
    expect(est?.annualUsdNoHomestead).toBeGreaterThan(est?.annualUsd ?? 0);
  });

  it('applies to no other county', () => {
    expect(estimatePropertyTax(500_000, FULTON, 'fulton')?.credit).toBeUndefined();
  });
});

describe('provenance', () => {
  it('falls back to the statutory floor for a county we have not verified', () => {
    const est = estimatePropertyTax(500_000, FULTON, 'nowhere');
    expect(est?.exemption.verified).toBe(false);
    expect(est?.exemption.county).toBe(STATUTORY_FLOOR.county);
  });

  it('marks a verified county as verified, and cites where it came from', () => {
    const est = estimatePropertyTax(500_000, FULTON, 'fulton');
    expect(est?.exemption.verified).toBe(true);
    expect(est?.exemption.source).toMatch(/Fulton/);
  });

  it('never publishes an exemption below the statutory floor', () => {
    // A county cannot legally offer less than $2,000; a smaller number here
    // would be a transcription error, not a local policy.
    for (const [key, ex] of Object.entries(HOMESTEAD_EXEMPTIONS)) {
      expect(ex.county, key).toBeGreaterThanOrEqual(2000);
      expect(ex.school, key).toBeGreaterThanOrEqual(2000);
    }
  });

  it('cites a source for every county in the table', () => {
    for (const [key, ex] of Object.entries(HOMESTEAD_EXEMPTIONS)) {
      expect(ex.source.length, key).toBeGreaterThan(10);
    }
  });
});

describe('against the real world', () => {
  it('puts a $500k Fulton home near the independently computed figure', () => {
    // A separate derivation from Fulton's 2025 rates gave ~0.98% for a $500k
    // homesteaded home. Ours uses 2023 rates, so close is the right test.
    const est = estimatePropertyTax(500_000, FULTON, 'fulton');
    expect(est?.effectivePct).toBeGreaterThan(0.85);
    expect(est?.effectivePct).toBeLessThan(1.1);
  });

  it('lands DeKalb above Fulton, which is the real ordering', () => {
    const dekalb = estimatePropertyTax(500_000, DEKALB, 'dekalb');
    const fulton = estimatePropertyTax(500_000, FULTON, 'fulton');
    expect(dekalb?.annualUsd).toBeGreaterThan(fulton?.annualUsd ?? 0);
  });
});
