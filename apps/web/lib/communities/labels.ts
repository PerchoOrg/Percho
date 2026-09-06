/**
 * Resident-stated labels, de-duplicated in place.
 *
 * Lives in its own file (not detail.ts) because the client island
 * CommunityBody.tsx needs it too, and detail.ts pulls in the server-only
 * Supabase client (`next/headers`) — importing it from a `'use client'`
 * file breaks the build.
 *
 * `communities.interests` and `communities.attributes` are scraped verbatim
 * from Nextdoor, and some neighbourhoods list the same interest twice —
 * Aberdeen carries "Home Improvement & DIY" twice, which React reported as
 * `Encountered two children with the same key` on the owner's phone
 * (2026-09-06) and drew the chip twice on the page.
 *
 * Order is Nextdoor's own ranking and IS the evidence behind every
 * "#N resident interest" sub-line, so the first occurrence wins and nothing is
 * re-sorted. The key is trimmed and case-folded: the same interest written
 * twice with different capitalisation is still one interest, and it keeps the
 * casing Nextdoor gave the first one.
 *
 * The duplicates are in the DB. Cleaning them there is a backfill over scraped
 * data and needs its own decision (CLAUDE.md §10); this makes every read path
 * correct meanwhile.
 */
export function dedupeLabels(values: readonly unknown[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values ?? []) {
    if (typeof value !== 'string') continue;
    const label = value.trim();
    if (label === '') continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}
