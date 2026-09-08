/**
 * What the published county tax rate leaves out.
 *
 * `import-ga-millage.ts` totals `COUNTY UNINCORPORATED`, `SCHOOL` and `STATE`.
 * Georgia counties also levy fire, EMS, police, recreation, sanitation and
 * ambulance as SEPARATE districts, and a home outside city limits pays them.
 * **19 of the 29 metro counties levy something the published figure omits.**
 *
 * This lived inside `scripts/admin/audit-millage-districts.ts`, where nothing
 * tests it — `scripts/` is not a workspace package. The classification below is
 * the judgement-laden part of the whole exercise, so it is the part that most
 * needed a test and had none.
 */

/** A county levy row as the DOR report prints it. */
export interface DistrictLevy {
  district: string;
  mills: number;
}

export type Bucket = 'countywide' | 'unincorporated' | 'city' | 'sub-district' | 'ambiguous';

/**
 * Who pays a given county levy.
 *
 * Order matters. `UNINC` is tested first because `COUNTY UNINC FIRE DISTRICT`
 * would otherwise fall through to `ambiguous`, and a levy only some homes pay
 * must never be counted as one every home pays.
 */
export function classify(district: string, siblings: readonly string[]): Bucket {
  if (/UNINC/.test(district)) return 'unincorporated';
  if (/^COUNTY INC - /.test(district)) return 'city';
  if (/WIDE|COUNTYWIDE/.test(district)) return 'countywide';
  // `COUNTY FIRE - ARCADE` beside `COUNTY FIRE - MAYSVILLE`: one service split
  // into areas, and a home is in exactly one of them. Jackson has eleven.
  const prefix = district.split(' - ')[0];
  if (prefix && district.includes(' - ')) {
    if (siblings.filter((d) => d.startsWith(`${prefix} - `)).length > 1) return 'sub-district';
  }
  return 'ambiguous';
}

/** Statewide assessment ratio, O.C.G.A. § 48-5-7. */
export const ASSESSMENT_RATIO = 0.4;

/** Mills → percentage points of MARKET value, which is what a buyer compares. */
export function millsToPoints(mills: number): number {
  return (mills * ASSESSMENT_RATIO) / 10;
}

export interface Omission {
  /** Points of market value a home certainly pays beyond the published rate. */
  lowPoints: number;
  /** The most it could be, if every ambiguous levy applies and the dearest
   *  sub-district covers the home. */
  highPoints: number;
  /** Every omitted levy, with who we think pays it. */
  levies: (DistrictLevy & { bucket: Bucket })[];
}

/**
 * The range a county's published rate understates by.
 *
 * A RANGE and not a number, because which levies a home pays depends on where
 * it is. `countywide` and `unincorporated` are certain for a home outside city
 * limits, so they set the floor. Jackson's eleven mutually exclusive fire
 * districts contribute their cheapest to the floor and their dearest to the
 * ceiling — a home is in exactly one and the report does not say which covers
 * where. `ambiguous` levies count only toward the ceiling.
 *
 * `city` levies are excluded from both: they are a county levy for one named
 * city's residents, and the published figure is the unincorporated one.
 */
export function omissionFor(levies: readonly DistrictLevy[]): Omission {
  const names = levies.map((l) => l.district);
  const tagged = levies.map((l) => ({ ...l, bucket: classify(l.district, names) }));
  const sum = (b: Bucket) => tagged.filter((l) => l.bucket === b).reduce((n, l) => n + l.mills, 0);

  const certain = sum('countywide') + sum('unincorporated');
  const subs = tagged.filter((l) => l.bucket === 'sub-district').map((l) => l.mills);
  const subLow = subs.length > 0 ? Math.min(...subs) : 0;
  const subHigh = subs.length > 0 ? Math.max(...subs) : 0;

  return {
    lowPoints: millsToPoints(certain + subLow),
    highPoints: millsToPoints(certain + subHigh + sum('ambiguous')),
    levies: tagged,
  };
}
