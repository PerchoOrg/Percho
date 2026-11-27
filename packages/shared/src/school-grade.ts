/**
 * A letter for where a school stands among Georgia's — "A+" for the top 5%.
 *
 * Owner 2026-11-27, of the figures above a feed card: a city's graduation
 * rate reads the same on every city (94.8%–98.4% across seven), and "Top 4%"
 * wants reading — 「可不可以用学区评级抽象一点的」, then 「用字母」. The letter is
 * the figure; the standing it is a letter for stays beside it in words, so two
 * A's can still be told apart.
 *
 * PERCHO'S OWN SCALE, not a publisher's and not the state's: Georgia stopped
 * grading its schools A–F in 2022-23, and Niche's and GreatSchools' grades are
 * licensed. It is a rewording of the "Top N%" a place's Explore page already
 * prints — the share of Georgia's schools at that level that score as well on
 * the state's tests — and a page that prints the letter says so.
 *
 * NO LETTER BELOW B−. A "C" or a "D" on a place's schools is a verdict on the
 * place, which these pages do not give (`profile-build.ts`: no verdict line is
 * ever a low school score). Past the top half the standing is printed as it
 * was, in words, with no letter. Whether that should change is the owner's
 * call when a city that needs it is added; none of today's does.
 *
 * Shared, like `rank-share.ts`: the server words the feed's figure and the app
 * words the page, and the two must grade alike.
 */

/** Best first: the letter for a standing in the top `within` percent. */
const SCALE: ReadonlyArray<{ within: number; grade: string }> = [
  { within: 5, grade: 'A+' },
  { within: 10, grade: 'A' },
  { within: 20, grade: 'A−' },
  { within: 30, grade: 'B+' },
  { within: 40, grade: 'B' },
  { within: 50, grade: 'B−' },
];

/** `share` is the N of "Top N%", 1–100. Null past the top half. */
export function schoolGrade(share: number): string | null {
  return SCALE.find((step) => share <= step.within)?.grade ?? null;
}

/**
 * Where a city's typical school stands: the middle of its schools' shares,
 * every level together, as a whole percent. Null for a city with no scored
 * school.
 */
export function typicalShare(schools: ReadonlyArray<{ share: number }>): number | null {
  if (schools.length === 0) return null;
  const shares = schools.map((s) => s.share).sort((a, b) => a - b);
  const mid = Math.floor(shares.length / 2);
  const upper = shares[mid] ?? 0;
  const median = shares.length % 2 === 1 ? upper : ((shares[mid - 1] ?? upper) + upper) / 2;
  return Math.min(100, Math.max(1, Math.round(median)));
}

/** How a page that prints a letter explains it. */
export const SCHOOL_GRADE_NOTE =
  "Percho's letter for a standing among Georgia's schools: A+ is the top 5%, A the top 10%, A− the top 20%, B+ the top 30%.";
