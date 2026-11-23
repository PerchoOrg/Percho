/**
 * A rank someone can read: "Top 38%".
 *
 * The Explore tile used to print "#452" over "of 1,220 in GA", which leaves
 * the division to the reader (owner 2026-11-22: "看了数字跟没看一样"). This does
 * it. From the rank and the count when both read as numbers — the worse of two
 * when a row is two schools ("#3 · #6") — rounded UP, so the claim is never
 * better than the rank; otherwise from the share ranked below.
 *
 * Shared since phase378: the feed's figures are worded by the server and the
 * Explore page by the app, and the two must round alike.
 */
import type { CommunityRank } from './community-profile';

type Ranked = Pick<CommunityRank, 'rank' | 'of' | 'percentile'>;

const firstCount = (text: string): number | null => {
  const m = text.match(/\d[\d,]*/);
  return m ? Number(m[0].replace(/,/g, '')) : null;
};

/** The share as a number, 1–100. */
export function rankShare(row: Ranked): number {
  const places = (row.rank.match(/\d[\d,]*/g) ?? []).map((n) => Number(n.replace(/,/g, '')));
  const of = firstCount(row.of);
  const share =
    places.length > 0 && of && of > 0
      ? Math.ceil((Math.max(...places) / of) * 100)
      : Math.round(100 - row.percentile);
  return Math.min(100, Math.max(1, share));
}

export function topShare(row: Ranked): string {
  return `Top ${rankShare(row)}%`;
}
