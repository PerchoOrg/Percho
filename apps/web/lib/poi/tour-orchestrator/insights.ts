/**
 * The facts a narrator would know that the camera cannot show. PURE.
 *
 * Owner 2026-08-21: "the narrative is just talking about the pics, but in
 * between we can fill more insights, that are not on the video."
 *
 * The script was descriptive because that is all it had: each section reached
 * the model as `{poi_name, bucket, duration_s}`, so captioning the picture was
 * the only thing left to do. This assembles what we already know about each
 * place — how far, how well reviewed, by how many people — and a few things
 * true of the set rather than of any one member.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 *  · School ratings. Not because quality claims are forbidden — the owner
 *    confirmed they are fine, and `feed/listing-highlights.ts` already surfaces
 *    a "Top Schools" chip — but because that chip only fires when the LISTING'S
 *    OWN COPY asserts it: "the agent's claim, quoted — not our inference".
 *    Today the only source for "top-ranked" is our own research model saying
 *    so, unsourced, which is the fabricated editorial that file warns against.
 *    When GreatSchools or the community's own site is wired up, it belongs
 *    here as a sourced fact.
 *  · Crime and safety. No data, and in US housing marketing crime language is a
 *    recognised steering proxy. Physical attributes a photo can corroborate —
 *    gated entry, sidewalks, lighting — are the safe version of this and can be
 *    added when we capture them.
 *  · Anything predictive. "Median price rose 12% over two years" is a fact;
 *    "this will appreciate" is investment advice and is not ours to give.
 */

export interface PlaceFact {
  name: string;
  bucket: string;
  /** Straight-line distance. 0 for the community's own amenities. */
  miles: number | null;
  rating: number | null;
  reviews: number | null;
}

/**
 * The kinds of thing a line can be ABOUT, beyond what is on screen.
 *
 * A film uses a few of these, not all — a script that lands every angle in
 * every section reads like a datasheet. Which few is decided per community, so
 * two neighbourhoods get different emphases and one neighbourhood keeps its
 * own across re-renders.
 */
export const INSIGHT_ANGLES = ['standing', 'reach', 'tradeoff', 'density'] as const;
export type InsightAngle = (typeof INSIGHT_ANGLES)[number];

export const ANGLE_BRIEF: Record<InsightAngle, string> = {
  standing: `STANDING — how well regarded a place actually is, from its rating AND how
many people left one. 4.8 from two thousand people is the area's favourite; 4.8
from sixty is a local secret. Say which, in words, when the numbers support it.
Never quote a rating for a school.`,
  reach: `REACH — how far things really are, and what that means. Under a mile is a walk
or a two-minute drive; four miles is a trip you plan. Use the actual figure once
or twice rather than "nearby", which says nothing.`,
  tradeoff: `TRADE-OFF — what is close set against what is not. "The grocery is under two
miles; dinner out is a five-mile drive" tells a buyer more about living here than
either fact alone. Be honest about the far ones.`,
  density: `DENSITY — what the set adds up to. How many parks inside a given radius, how
much of this film is within a few miles. A count is worth more than another
adjective.`,
};

/** Stable, well-spread index from a string. */
function hash(seed: string): number {
  let h = 2166136261;
  for (const ch of seed) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Which angles this community's film leans on.
 *
 * Seeded on the community id, like the narrator's voice and the music: two
 * communities sound different from each other, one community sounds like
 * itself every time. `standing` is always in — it is the angle with real data
 * behind it for every commercial place — and the rest rotate.
 */
export function anglesForCommunity(seed: string, count = 3): InsightAngle[] {
  const rest = INSIGHT_ANGLES.filter((a) => a !== 'standing');
  const start = hash(seed) % rest.length;
  const picked: InsightAngle[] = ['standing'];
  for (let i = 0; picked.length < Math.min(count, INSIGHT_ANGLES.length); i++) {
    picked.push(rest[(start + i) % rest.length] as InsightAngle);
  }
  return picked;
}

/** "4.8 from 1,988 reviews", or null when there is nothing to say. */
export function describeStanding(f: PlaceFact): string | null {
  if (f.rating == null || !f.reviews) return null;
  return `${f.rating.toFixed(1)} from ${f.reviews.toLocaleString('en-US')} reviews`;
}

/** "0.8 mi" / "in the community". */
export function describeDistance(f: PlaceFact): string | null {
  if (f.miles == null) return null;
  if (f.miles < 0.05) return 'in the community';
  return `${f.miles.toFixed(1)} mi`;
}

/**
 * Facts true of the whole film rather than of one place.
 *
 * Computed rather than asserted, so a line built on one of these can be
 * checked against the shot list.
 */
export function filmFacts(facts: PlaceFact[]): string[] {
  const out: string[] = [];
  const away = facts.filter((f) => (f.miles ?? 0) > 0.05);
  if (away.length >= 2) {
    const far = Math.max(...away.map((f) => f.miles ?? 0));
    out.push(`everything outside the community is within ${far.toFixed(1)} miles`);
  }
  const parks = away.filter((f) => f.bucket === 'outdoor');
  if (parks.length >= 2) {
    const r = Math.max(...parks.map((p) => p.miles ?? 0));
    out.push(`${parks.length} parks within ${r.toFixed(1)} miles`);
  }
  const walk = away.filter((f) => (f.miles ?? 99) <= 1.0);
  if (walk.length > 0) {
    out.push(`${walk.length} of them under a mile: ${walk.map((f) => f.name).join(', ')}`);
  }
  const best = away
    .filter((f) => (f.reviews ?? 0) >= 200 && (f.rating ?? 0) >= 4.5)
    .sort((a, b) => (b.reviews ?? 0) - (a.reviews ?? 0))[0];
  if (best) {
    out.push(`the most reviewed well-rated place is ${best.name} (${describeStanding(best)})`);
  }
  return out;
}

/** The per-place block for the prompt, one line each, facts only. */
export function renderFacts(facts: PlaceFact[]): string {
  return facts
    .map((f) => {
      const bits = [describeDistance(f), describeStanding(f)].filter(Boolean);
      return `    ${f.name}${bits.length ? ` — ${bits.join(', ')}` : ''}`;
    })
    .join('\n');
}
