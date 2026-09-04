/**
 * ZIP → typical single-family rent, for the listing page's ROI block (phase D).
 *
 * Reads the JSON `scripts/admin/refresh-rent-index.ts` writes — Zillow ZORI,
 * metro-SFR-adjusted, ~8.5k ZIPs. Bundled with the app rather than fetched
 * at request time because Zillow publishes monthly and the file is 110 KB;
 * re-run the script to refresh. Everything here is a DEFAULT the buyer can
 * edit, never a valuation of the specific home — see the script header.
 */
import rentIndex from '@/data/rent-by-zip.json';

export interface RentEstimateDTO {
  /** Typical single-family monthly rent in the ZIP, USD, rounded. */
  monthlyUsd: number;
  /** Month the index covers, ISO date. */
  asOf: string;
  source: 'Zillow ZORI';
  zip: string;
}

const index = rentIndex as { asOf: string; zips: Record<string, number> };

/** Undefined when the ZIP has no coverage — the block then asks for a figure. */
export function rentEstimateForZip(zip: string | undefined): RentEstimateDTO | undefined {
  const z = zip?.trim();
  if (!z) return undefined;
  const monthlyUsd = index.zips[z];
  if (monthlyUsd === undefined || !(monthlyUsd > 0)) return undefined;
  return { monthlyUsd, asOf: index.asOf, source: 'Zillow ZORI', zip: z };
}
