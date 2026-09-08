import { describe, expect, it } from 'vitest';
import { classify, millsToPoints, omissionFor } from './district-millage';

describe('classify', () => {
  it('reads UNINC before anything else', () => {
    // `COUNTY UNINC FIRE DISTRICT` would otherwise fall through to ambiguous
    // and be counted toward every home. A levy only some homes pay must never
    // become one every home pays.
    expect(classify('COUNTY UNINC FIRE DISTRICT', [])).toBe('unincorporated');
    expect(classify('COUNTY UNINC DEVELOPMENT SVC', [])).toBe('unincorporated');
  });

  it('names a county levy for one city', () => {
    expect(classify('COUNTY INC - TYRONE', [])).toBe('city');
  });

  it('accepts either spelling of county-wide', () => {
    expect(classify('COUNTY WIDE AMBULANCE', [])).toBe('countywide');
    expect(classify('COUNTY FIRE DIST - COUNTYWIDE', [])).toBe('countywide');
  });

  it('sees a family of sub-districts only when there is more than one', () => {
    // Jackson levies eleven fire districts and a home is in exactly one.
    const jackson = ['COUNTY FIRE - ARCADE', 'COUNTY FIRE - MAYSVILLE', 'COUNTY FIRE - PLAINVIEW'];
    expect(classify('COUNTY FIRE - ARCADE', jackson)).toBe('sub-district');
    // One alone is not a family — it is a single district with a hyphen.
    expect(classify('COUNTY FIRE - ARCADE', ['COUNTY FIRE - ARCADE'])).toBe('ambiguous');
  });

  it('leaves a bare district ambiguous rather than guessing', () => {
    expect(classify('COUNTY FIRE DISTRICT', [])).toBe('ambiguous');
    expect(classify('COUNTY RECREATION', [])).toBe('ambiguous');
  });
});

describe('millsToPoints', () => {
  it('applies the 40% assessment ratio', () => {
    // 1 mill is $1 per $1,000 of ASSESSED value, and Georgia assesses at 40%
    // of market — so a mill is 0.04 points of what a buyer paid.
    expect(millsToPoints(1)).toBeCloseTo(0.04, 10);
    expect(millsToPoints(8.67)).toBeCloseTo(0.3468, 10);
  });
});

describe('omissionFor', () => {
  it('puts certain levies in the floor and ambiguous ones only in the ceiling', () => {
    const o = omissionFor([
      { district: 'COUNTY WIDE AMBULANCE', mills: 0.571 },
      { district: 'COUNTY UNINC FIRE DISTRICT', mills: 2.65 },
      { district: 'COUNTY FIRE DISTRICT (INC)', mills: 4.08 },
    ]);
    expect(o.lowPoints).toBeCloseTo(millsToPoints(3.221), 10);
    expect(o.highPoints).toBeCloseTo(millsToPoints(7.301), 10);
  });

  it('takes the cheapest sub-district for the floor and the dearest for the ceiling', () => {
    // A home is in exactly one of them, and the report does not say which.
    const o = omissionFor([
      { district: 'COUNTY FIRE - NORTH', mills: 0.7 },
      { district: 'COUNTY FIRE - WEST', mills: 3.39 },
    ]);
    expect(o.lowPoints).toBeCloseTo(millsToPoints(0.7), 10);
    expect(o.highPoints).toBeCloseTo(millsToPoints(3.39), 10);
  });

  it('never counts a city levy, at either end', () => {
    // The published figure is the unincorporated one; a levy for Tyrone's
    // residents is not part of it in any direction.
    const o = omissionFor([{ district: 'COUNTY INC - TYRONE', mills: 5 }]);
    expect(o.lowPoints).toBe(0);
    expect(o.highPoints).toBe(0);
  });

  it('is nothing when a county levies nothing extra', () => {
    const o = omissionFor([]);
    expect(o.lowPoints).toBe(0);
    expect(o.highPoints).toBe(0);
    expect(o.levies).toHaveLength(0);
  });

  it('reproduces the worst county in the report', () => {
    // Hall: ambulance 0.571 + uninc dev 1.005 + uninc fire 2.650 certain,
    // plus ambiguous fire 4.080 and recreation 0.364 at the ceiling.
    const o = omissionFor([
      { district: 'COUNTY FIRE DISTRICT (INC)', mills: 4.08 },
      { district: 'COUNTY RECREATION', mills: 0.364 },
      { district: 'COUNTY WIDE AMBULANCE', mills: 0.571 },
      { district: 'COUNTY UNINC DEVELOPMENT SVC', mills: 1.005 },
      { district: 'COUNTY UNINC FIRE DISTRICT', mills: 2.65 },
    ]);
    expect(o.lowPoints).toBeCloseTo(0.169, 3);
    expect(o.highPoints).toBeCloseTo(0.347, 3);
  });
});
