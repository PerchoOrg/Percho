/**
 * Which school year a set of GOSA files describes, from their names.
 *
 * GOSA publishes `EOG_2024-25_...csv` and `EOC_2024-25_...csv`, and the year in
 * the name is the only statement of vintage the files carry — nothing inside
 * them says it. So `as_of` on every school figure on the map rests on this.
 *
 * It lived as one line in `scripts/admin/import-ga-proficiency.ts`, with two
 * bugs and no test:
 *
 * **It took the first match while claiming to take the newest.** An EOG from
 * 2023-24 beside an EOC from 2024-25 stamped both with the older year.
 *
 * **Its fallback was the string a correct parse produces.** When no name
 * carried a year it defaulted to `'2025-06-30'` — exactly what a real 2024-25
 * file yields — so a run on unnamed local files claimed the same vintage as a
 * parsed one and nothing downstream could tell them apart. *A fallback
 * indistinguishable from success is not a fallback.*
 *
 * Two attempts to exercise that path through the importer failed on an earlier
 * guard, which is what moved it here: logic that decides a published figure's
 * vintage should be reachable by a test without a valid CSV in hand.
 */

/**
 * The June 30 that ends the newest school year named, or undefined.
 *
 * Undefined rather than a default: the caller must refuse to write rather than
 * stamp a vintage nobody verified.
 */
export function schoolYearAsOf(names: readonly string[]): string | undefined {
  const years: number[] = [];
  for (const m of names.join(' ').matchAll(/(\d{4})-(\d{2})/g)) {
    const start = Number(m[1]);
    const end = Number(`20${m[2]}`);
    // A school year ends the calendar year after it starts, so `2024-25` is
    // 2025 and `2024-99` is a coincidence in a path. That test is what keeps
    // `/tmp/run-1234-56/` from becoming a vintage.
    if (end - start === 1 && end >= 2000 && end <= 2100) years.push(end);
  }
  return years.length === 0 ? undefined : `${Math.max(...years)}-06-30`;
}
