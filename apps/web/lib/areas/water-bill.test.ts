import { describe, expect, it } from 'vitest';
import { type WaterRates, coveredGallons, monthlyBill, waterCharge } from './water-bill';

/** DeKalb's published 2026 rates, which the county prices at $84.08 for 4,000. */
const DEKALB: WaterRates = {
  waterBase: 3.64,
  sewerBase: 8.84,
  waterTiers: [
    [2000, 2.77],
    [10000, 3.95],
    [20000, 5.9],
  ],
  sewerPerThousand: 14.54,
};

describe('waterCharge', () => {
  it('prices inside the first band', () => {
    expect(waterCharge(1000, DEKALB.waterTiers)).toBeCloseTo(2.77, 10);
  });

  it('charges the NEXT band only for what is above the previous bound', () => {
    // The trap: bands are cumulative bounds, not widths. 4,000 gallons is
    // 2,000 at $2.77 plus 2,000 at $3.95 — not 2,000 at $2.77 plus 4,000.
    expect(waterCharge(4000, DEKALB.waterTiers)).toBeCloseTo(5.54 + 7.9, 10);
  });

  it('is exact on a band boundary', () => {
    // Exactly 2,000 must be wholly in tier 1, with nothing spilling into 2.
    expect(waterCharge(2000, DEKALB.waterTiers)).toBeCloseTo(5.54, 10);
    expect(waterCharge(10000, DEKALB.waterTiers)).toBeCloseTo(5.54 + 8 * 3.95, 10);
  });

  it('costs nothing at zero', () => {
    expect(waterCharge(0, DEKALB.waterTiers)).toBe(0);
  });

  it('is monotonic across every boundary', () => {
    // A step function that dips at an edge is the classic off-by-one here.
    let last = -1;
    for (let g = 0; g <= 20000; g += 250) {
      const c = waterCharge(g, DEKALB.waterTiers);
      expect(c, `${g} gallons`).toBeGreaterThanOrEqual(last);
      last = c;
    }
  });

  it('does not price beyond the ladder', () => {
    // waterCharge itself simply stops; monthlyBill is where that is refused.
    expect(waterCharge(30000, DEKALB.waterTiers)).toBeCloseTo(
      waterCharge(20000, DEKALB.waterTiers),
      10,
    );
  });
});

describe('monthlyBill', () => {
  it('reproduces the figure DeKalb publishes', () => {
    // The whole reason this county is sourced and the others are not.
    expect(monthlyBill(4000, DEKALB)).toBeCloseTo(84.08, 10);
  });

  it('charges both standing charges even at zero use', () => {
    expect(monthlyBill(0, DEKALB)).toBeCloseTo(3.64 + 8.84, 10);
  });

  it('refuses a volume the ladder cannot reach', () => {
    // Not a partial total: a ladder ending at 20,000 would charge nothing for
    // the 21st thousand and return a bill that looks complete and is too low.
    expect(monthlyBill(25000, DEKALB)).toBeUndefined();
    expect(monthlyBill(20000, DEKALB)).toBeDefined();
  });

  it('refuses nonsense rather than returning NaN', () => {
    expect(monthlyBill(Number.NaN, DEKALB)).toBeUndefined();
    expect(monthlyBill(-1, DEKALB)).toBeUndefined();
  });

  it('accepts an open-ended top band', () => {
    const open: WaterRates = {
      ...DEKALB,
      waterTiers: [...DEKALB.waterTiers, [Number.POSITIVE_INFINITY, 10.36]],
    };
    expect(coveredGallons(open.waterTiers)).toBe(Number.POSITIVE_INFINITY);
    expect(monthlyBill(25000, open)).toBeDefined();
    // 5,000 gallons past the $5.90 band, at $10.36.
    expect((monthlyBill(25000, open) ?? 0) - (monthlyBill(20000, open) ?? 0)).toBeCloseTo(
      5 * 10.36 + 5 * 14.54,
      10,
    );
  });
});
