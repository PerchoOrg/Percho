import { type CommunityReason, reasonPrevalence } from './community-reasons';

/**
 * A signal family: the one word that still names the category, plus the
 * distinctive phrases this community could show instead.
 *
 * Families stay in the order they were declared — this is the tiebreak order
 * (a community that is both walkable and has restaurants shows walkability
 * first, the stronger lifestyle claim).
 */
interface SignalFamily {
  /** The generic label this family replaces. Never printed. */
  label: string;
  /** Distinctive alternatives, preferred first. */
  signals: string[];
}

/**
 * Signal families for the claims the seed can actually make.
 *
 * Order matters: the FIRST family a community's labels hit wins the first
 * slot. The families are ordered by how decisive the claim is about living
 * there — walkability and quiet first, amenities and upkeep later.
 */
export const SIGNAL_FAMILIES: readonly SignalFamily[] = [
  {
    label: 'Walkability',
    signals: ['Highly walkable', 'Walkable streets', 'Sidewalks everywhere'],
  },
  { label: 'Walking', signals: ['Walkable streets', 'Great for walking'] },
  { label: 'Sidewalks', signals: ['Sidewalks everywhere'] },
  { label: 'Quiet', signals: ['Quiet streets', 'Peaceful streets'] },
  { label: 'Peaceful', signals: ['Quiet streets', 'Peaceful streets'] },
  {
    label: 'Restaurants',
    // The count path prints "N restaurants nearby" before this ever shows.
    signals: ['Cafés nearby', 'Great dining nearby'],
  },
  { label: 'Food', signals: ['Great dining nearby'] },
  { label: 'Trees', signals: ['Mature trees', 'Lots of trees'] },
  { label: 'Woods', signals: ['Mature trees', 'Wooded lots'] },
  { label: 'Parks', signals: ['Parks nearby', 'Green space nearby'] },
  { label: 'Nature', signals: ['Green space nearby'] },
  { label: 'Trails', signals: ['Trails nearby', 'Hiking nearby'] },
  { label: 'Hiking', signals: ['Trails nearby', 'Hiking nearby'] },
  { label: 'Lake', signals: ['Lake nearby'] },
  { label: 'Creek', signals: ['Creek nearby'] },
  { label: 'River', signals: ['River nearby'] },
  { label: 'Dog Friendly', signals: ['Dog friendly'] },
  { label: 'Schools', signals: ['Great schools'] },
  { label: 'Family Friendly', signals: ['Family friendly'] },
  { label: 'Safe', signals: ['Safe'] },
  { label: 'Convenient', signals: ['Convenient'] },
  { label: 'Location', signals: ['Convenient'] },
  { label: 'Proximity', signals: ['Convenient'] },
  { label: 'Shopping', signals: ['Shopping nearby'] },
  { label: 'Stores', signals: ['Shops nearby'] },
  { label: 'Downtown', signals: ['Near downtown'] },
  { label: 'Yards', signals: ['Yards'] },
  { label: 'Golf', signals: ['Golf nearby'] },
  { label: 'Tennis', signals: ['Tennis nearby'] },
];

/** Reverse index: generic label → family, built once at module load. */
const FAMILY_BY_LABEL: Map<string, SignalFamily> = new Map(
  SIGNAL_FAMILIES.map((f) => [f.label, f]),
);

/**
 * Pick up to 2-3 DISTINCTIVE lifestyle signals for a community.
 *
 * @param signals  one specific signal, or null/undefined when none of this
 *   community's reasons is mapped to a family.
 * @param count    how many pills to return (default 2 — the row reads "this
 *   place is X and Y"; a third is only added when the community is rich
 *   enough to deserve it).
 */
export function communityLifestyleSignals(
  reasons: readonly CommunityReason[] | null | undefined,
  count = 2,
): string[] {
  const out: string[] = [];
  const used = new Set<string>();
  const add = (s: string) => {
    if (used.has(s)) return;
    used.add(s);
    out.push(s);
  };

  // 1. A NUMBER beats a phrase. "3 parks nearby" is a measurement; "Parks
  // nearby" is a category word with a qualifier. Once a count is shown for a
  // label, that label's phrase family is spent too — "33 restaurants nearby"
  // followed by "Cafés nearby" would be the same claim twice.
  const counts = extractPoiCounts(reasons);
  const coveredLabels = new Set(
    (reasons ?? []).filter((r) => r.fact?.match(/^\d+ [a-zA-Z ]+$/)).map((r) => r.label),
  );
  for (const s of counts) add(s);

  // 2. Distinctive phrases, rarest first — at most ONE per family, so a row
  // of two never reads "walkable, walkable". Ranking on the GENERIC label's
  // prevalence keeps the measure a property of the corpus, not of this file.
  const ranked = (reasons ?? [])
    .map((r) => r.label)
    .map((label) => ({ label, family: FAMILY_BY_LABEL.get(label) }))
    .filter((x): x is { label: string; family: SignalFamily } => !!x.family)
    .sort((a, b) => reasonPrevalence(a.label) - reasonPrevalence(b.label));
  for (const { label, family } of ranked) {
    if (coveredLabels.has(label)) continue;
    const first = family.signals.find((s) => !used.has(s));
    if (!first) continue;
    add(first);
    if (out.length >= count) return out;
  }

  return out.slice(0, count);
}

/**
 * "N restaurants nearby" / "N parks nearby" from `community_pois` counts.
 *
 * A count is the strongest signal the card can show (owner: 「图标里要有干货
 * 数据 比如33个餐厅」) — the specific phrase with a real number. Returns only
 * facts shaped like a count: a number followed by a plain noun ("33
 * restaurants", "3 parks"). "35% owner-occupied", "1,050 residents" and
 * "median age 42" fail the shape on purpose — they are not POI counts and
 * must never become "N X nearby".
 */
export function extractPoiCounts(reasons: readonly CommunityReason[] | null | undefined): string[] {
  if (!reasons) return [];
  const out: string[] = [];
  for (const r of reasons) {
    const f = r.fact?.match(/^(\d+) ([a-zA-Z ]+)$/);
    if (!f) continue;
    const n = Number(f[1]);
    if (!Number.isFinite(n) || n <= 0) continue;
    out.push(`${n} ${f[2]} nearby`);
  }
  return out;
}
