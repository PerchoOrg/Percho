/**
 * Freddie Mac Primary Mortgage Market Survey — the weekly 30-yr / 15-yr fixed
 * averages, from the public history CSV (no key, no auth, ~100 KB).
 *
 * This is the rate source `apps/mobile/lib/listing/assumptions.ts` said did
 * not exist. The mobile cost block used to carry a hand-typed figure with an
 * `as of` date that had to be bumped by hand and went stale in July 2026;
 * `GET /api/mobile/rates` serves this instead, cached for a day.
 *
 * CSV shape (header verified 2026-09-04):
 *   date,pmms30,pmms30p,pmms15,pmms15p,pmms51,pmms51p,pmms51m,pmms51spread
 *   9/3/2026,6.71,,6.04,,,,,
 * Dates are M/D/YYYY; the newest row is last. Rows may be blank-padded.
 */

export const PMMS_URL = 'https://www.freddiemac.com/pmms/docs/PMMS_history.csv';

export interface MortgageRates {
  /** 30-yr fixed, annual fraction (0.0671 = 6.71%). */
  rate30: number;
  /** 15-yr fixed, annual fraction. Absent when the row has none. */
  rate15?: number;
  /** ISO date (UTC) of the survey week. */
  asOf: string;
  source: 'Freddie Mac PMMS';
}

/** 6.71 → 0.0671 without the float noise `/ 100` leaves behind. */
function toFraction(pct: number): number {
  return Math.round(pct * 10_000) / 1_000_000;
}

/** Parse the newest complete row. Returns null when nothing usable is found. */
export function parsePmmsCsv(csv: string): MortgageRates | null {
  const lines = csv.split(/\r?\n/);
  for (let i = lines.length - 1; i > 0; i--) {
    const cells = (lines[i] ?? '').split(',');
    const date = cells[0]?.trim();
    const rate30 = Number.parseFloat(cells[1] ?? '');
    if (!date || !Number.isFinite(rate30) || rate30 <= 0 || rate30 > 30) continue;
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date);
    if (!m) continue;
    const asOf = `${m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
    const rate15 = Number.parseFloat(cells[3] ?? '');
    return {
      rate30: toFraction(rate30),
      ...(Number.isFinite(rate15) && rate15 > 0 ? { rate15: toFraction(rate15) } : {}),
      asOf,
      source: 'Freddie Mac PMMS',
    };
  }
  return null;
}

/** Fetch + parse. Throws on network/HTTP failure; null on an unparseable body. */
export async function fetchMortgageRates(): Promise<MortgageRates | null> {
  const res = await fetch(PMMS_URL, { next: { revalidate: 21_600 } });
  if (!res.ok) throw new Error(`PMMS fetch failed: ${res.status}`);
  return parsePmmsCsv(await res.text());
}
