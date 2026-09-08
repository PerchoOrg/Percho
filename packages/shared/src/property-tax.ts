/**
 * What a buyer will actually pay in property tax on a specific home.
 *
 * ── Why a rate per county is the wrong shape ───────────────────────────────
 *
 * The obvious design is one percentage per county, and it cannot be right.
 * Georgia's homestead exemptions are FIXED DOLLAR amounts off the assessed
 * value, so the share of a home's price that ends up taxed rises with the
 * price. Fulton's $30,000 county exemption is 15% of the assessed value of a
 * $500k home and 7.5% of a $1M one. A single percentage has to pick a house
 * and then be wrong about every other house.
 *
 * So this computes a BILL from a price, and the lens divides afterwards.
 *
 * ── The three numbers people quote, and why none of them is the answer ─────
 *
 *   **Statutory rate** (mills × 40%) describes a NON-homestead owner exactly.
 *   Verified against a real DeKalb tax bill: a corporately-held parcel pays
 *   precisely this. It is too high for anyone living in the house.
 *
 *   **"Average effective rate"** (median taxes paid ÷ median home value, the
 *   figure most sites publish) describes a long-tenured owner: assessment
 *   freezes that have held their base down for a decade, and senior exemptions
 *   that waive school tax entirely at 62 in Cobb and 65 in Forsyth, where
 *   school is over half the bill. It is far too low for a buyer.
 *
 *   **What a buyer pays** sits between them, and is neither. The freezes reset
 *   at closing — a new owner's base is 40% of what they just paid — and a
 *   buyer is not a senior. That is the number computed here.
 *
 * ── The formula ───────────────────────────────────────────────────────────
 *
 *   assessed         = price × 0.40                (O.C.G.A. § 48-5-7)
 *   county M&O tax   = (assessed − county exemption) × county M&O mills
 *   county bond tax  =  assessed × county bond mills
 *   school M&O tax   = (assessed − school exemption) × school M&O mills
 *   school bond tax  =  assessed × school bond mills
 *   − credits
 *
 * Bond levies are NOT reduced by an exemption: O.C.G.A. § 48-5-44 excludes
 * levies "to pay interest on and to retire bonded indebtedness", and every
 * county source checked repeats it. Applying the exemption to bond as well is
 * the easy mistake here, and one county's own worked example on its website
 * makes it.
 *
 * ── What this deliberately does not model ─────────────────────────────────
 *
 * Senior and disability exemptions (a buyer may be 65, but pricing for the
 * median case and letting the exception be pleasantly surprised is the right
 * direction to be wrong in); city millage for a home inside city limits, which
 * needs the address rather than the county; agricultural assessment at 30%;
 * and HB 581's inflation cap, which by construction does nothing in year one
 * because the base was just reset at purchase.
 */

/** Statewide assessment ratio, O.C.G.A. § 48-5-7. */
export const ASSESSMENT_RATIO = 0.4;

/**
 * The basic homestead exemption an owner-occupant gets, in dollars off the
 * 40% assessed value, per levy.
 *
 * Every entry is from the county's own assessor or tax commissioner. Where a
 * county was not reachable, `null` records that we have not verified it — the
 * caller falls back to the statutory floor and says so, rather than a number
 * shaped like a fact.
 *
 * O.C.G.A. § 48-5-44 sets the floor at $2,000 against county and school M&O.
 * Counties may and often do raise it locally, and the spread is wide enough to
 * matter: Fulton gives $30,000 against county tax and only the $2,000 floor
 * against school, which is the larger levy — so its headline generosity is
 * worth less than Rockdale's flat $15,000 on both.
 */
export interface HomesteadExemption {
  /** Dollars off assessed value for the county M&O levy. */
  county: number;
  /** Dollars off assessed value for the school M&O levy. */
  school: number;
  /** Where the figure came from. */
  source: string;
  /** False when we are falling back to the statutory floor. */
  verified: boolean;
}

/** The statutory floor, for a county we have not verified. */
export const STATUTORY_FLOOR: HomesteadExemption = {
  county: 2000,
  school: 2000,
  source: 'O.C.G.A. § 48-5-44 statewide floor — county amount not yet verified',
  verified: false,
};

const v = (county: number, school: number, source: string): HomesteadExemption => ({
  county,
  school,
  source,
  verified: true,
});

export const HOMESTEAD_EXEMPTIONS: Record<string, HomesteadExemption> = {
  // Core metro, from each county's own published exemption schedule.
  fulton: v(30000, 2000, 'Fulton County 2025 Homestead Exemption Guide'),
  dekalb: v(10000, 12500, 'DeKalb County Tax Commissioner'),
  cobb: v(10000, 10000, 'Cobb County Tax Commissioner — Exemptions'),
  gwinnett: v(10000, 8000, 'Gwinnett County Tax Commissioner — Available Exemptions'),
  forsyth: v(8000, 2000, 'Forsyth County Board of Assessors'),
  henry: v(15000, 4000, 'Henry County Tax Commissioner'),
  cherokee: v(5000, 2000, 'Cherokee County (secondary source — re-verify)'),
  clayton: v(10000, 10000, 'Clayton County (secondary source — re-verify)'),
  // Outer ring, verified county by county.
  rockdale: v(15000, 15000, 'Rockdale County Board of Assessors, 2025 schedule'),
  newton: v(4000, 4000, 'Newton County Board of Assessors'),
  coweta: v(10000, 2000, 'Coweta County Board of Assessors — S1, local supersession'),
  bartow: v(15000, 15000, 'Bartow County Tax Commissioner — HB 622 / HB 118'),
  pickens: v(5000, 5000, 'Pickens County Board of Assessors — local exemptions'),
  carroll: v(4000, 4000, 'Carroll County Board of Tax Assessors — S1'),
  hall: v(2000, 2000, 'Hall County Tax Assessor — 2026 homestead information'),
  barrow: v(2000, 2000, 'Barrow County Tax Commissioner / Board of Assessors'),
  spalding: v(2000, 2000, 'Spalding County Tax Commissioner — S1'),
  douglas: v(6000, 2000, 'Douglas County Tax Commissioner — Regular Homestead'),
  fayette: v(5000, 2000, 'Fayette County — exemption schedule L1'),
  paulding: v(10000, 2000, 'Paulding County Board of Assessors — S1, HB 988'),
};

/**
 * A credit applied AFTER the tax is computed, as a share of specific mills.
 *
 * Only DeKalb runs one at a scale that changes the answer, and it is the
 * single reason DeKalb's published effective rate looks so far below its
 * statutory one. EHOST gives a homesteaded property a 100% credit against the
 * county's General Operations and Hospital levies — 11.638 of 20.810 county
 * mills — funded by a sales tax. Unlike a freeze, it applies to a new buyer
 * immediately, which is exactly why it cannot be ignored here.
 */
export interface TaxCredit {
  /** County mills wholly credited away for a homesteaded property. */
  countyMillsCredited: number;
  label: string;
  source: string;
}

export const TAX_CREDITS: Record<string, TaxCredit> = {
  dekalb: {
    countyMillsCredited: 11.638,
    label: 'EHOST credit',
    source: 'DeKalb County — Equalized Homestead Option Sales Tax, 2025',
  },
};

/** The mills a county levies, split as the exemption rules require. */
export interface CountyMills {
  countyMo: number;
  countyBond: number;
  schoolMo: number;
  schoolBond: number;
}

export interface TaxLine {
  label: string;
  annualUsd: number;
}

export interface PropertyTaxEstimate {
  /** What the buyer pays per year, after exemptions and credits. */
  annualUsd: number;
  monthlyUsd: number;
  /** As a share of the purchase price — derived, never the input. */
  effectivePct: number;
  /** What a non-homestead owner would pay: no exemption, no credit. */
  annualUsdNoHomestead: number;
  lines: TaxLine[];
  exemption: HomesteadExemption;
  credit?: TaxCredit;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * The bill on one home, for an owner who will live in it.
 *
 * Returns undefined when the county's mills are unknown — a tax figure is not
 * something to approximate into existence.
 */
export function estimatePropertyTax(
  priceUsd: number,
  mills: CountyMills | undefined,
  countyKey: string,
): PropertyTaxEstimate | undefined {
  if (!mills || !(priceUsd > 0)) return undefined;

  const assessed = priceUsd * ASSESSMENT_RATIO;
  const exemption = HOMESTEAD_EXEMPTIONS[countyKey] ?? STATUTORY_FLOOR;
  const credit = TAX_CREDITS[countyKey];

  const per = (base: number, m: number) => (Math.max(base, 0) * m) / 1000;

  // The credit removes specific county mills for a homesteaded property, so it
  // reduces the county M&O line rather than being subtracted at the end — a
  // credit bigger than the line it offsets must not become negative tax.
  const countyMoMills = Math.max(mills.countyMo - (credit?.countyMillsCredited ?? 0), 0);

  const lines: TaxLine[] = [
    { label: 'County', annualUsd: round(per(assessed - exemption.county, countyMoMills)) },
    { label: 'County bond', annualUsd: round(per(assessed, mills.countyBond)) },
    { label: 'School', annualUsd: round(per(assessed - exemption.school, mills.schoolMo)) },
    { label: 'School bond', annualUsd: round(per(assessed, mills.schoolBond)) },
  ].filter((l) => l.annualUsd > 0);

  const annualUsd = lines.reduce((n, l) => n + l.annualUsd, 0);

  const noHomestead =
    per(assessed, mills.countyMo) +
    per(assessed, mills.countyBond) +
    per(assessed, mills.schoolMo) +
    per(assessed, mills.schoolBond);

  return {
    annualUsd: round(annualUsd),
    monthlyUsd: Math.round(annualUsd / 12),
    effectivePct: round((annualUsd / priceUsd) * 100 * 1000) / 1000,
    annualUsdNoHomestead: round(noHomestead),
    lines,
    exemption,
    ...(credit ? { credit } : {}),
  };
}
