/**
 * Neighborhood scores for a listing card — the four dimensions the owner asked
 * for on 2026-07-30: Safety, Schools, Convenience, Potential.
 *
 * ── Two of the four have NO data source, and that is reported, not faked ─────
 *
 * Checked against the live database before writing this:
 *
 *   Schools      ✅ 11 school POIs on the sample listing, each with a measured
 *                   `listing_pois.distance_m` and a Google rating.
 *   Convenience  ✅ 64 POIs across daily_errands / shopping / dining.
 *   Safety       ❌ no source. `crime_stats` and `safety` tables do not exist;
 *                   Google Places carries no crime data.
 *   Potential    ❌ no source. `price_history` / `market_stats` / `comps` tables
 *                   do not exist, and the sample listing's city has exactly one
 *                   active listing (itself), so there are no local comps either.
 *
 * `score: null` means "we don't know", and the card renders it as an em dash. It
 * does NOT mean zero. Inventing a safety number for a house is not a cosmetic
 * shortcut — it is the kind of claim that gets a real-estate company sued, so
 * the missing dimensions stay visibly missing until a feed is wired up.
 *
 * ── The formula is deliberately simple, because it has to be defensible ─────
 *
 * We hold no Walk Score / GreatSchools licence, so any number here is ours to
 * justify to a buyer. Two components, both from measured values:
 *
 *   proximity (0-6): the nearest POI in the dimension. <=400 m scores 6, then
 *                    decays linearly to 0 at 3000 m.
 *   density   (0-4): how many *good* POIs sit within 2 km, where good means
 *                    rating >= 4.0 with >= 20 reviews. Schools and parks often
 *                    carry no Google rating at all, so an unrated POI inside
 *                    1 km also counts — otherwise a listing next door to a
 *                    school scores zero on Schools.
 *
 * The overall score averages only the dimensions that HAVE data, so a listing is
 * never punished for a feed we haven't connected yet.
 */

/** A POI as this module needs it — a flat row, no Supabase types. */
export interface ScorablePoi {
  bucket: string;
  distanceM: number;
  rating: number | null;
  ratingCount: number | null;
}

export type DimensionKey = "safety" | "schools" | "convenience" | "potential";

export interface DimensionScore {
  key: DimensionKey;
  label: string;
  /** 0–10, or null when we have no source for this dimension. */
  score: number | null;
  /** How many POIs fed the score. 0 when unscored. */
  count: number;
  /** Metres to the closest contributing POI. Absent when unscored. */
  nearestM?: number;
  /**
   * Why a null score is null. Shown in dev tooling, not to buyers — the card
   * just renders a dash.
   */
  reason?: string;
}

export interface NeighborhoodScores {
  /** Mean of the scored dimensions, or null when none are scored. */
  overall: number | null;
  dims: DimensionScore[];
}

/**
 * Which buckets feed which dimension. `null` marks a dimension we cannot
 * compute at all yet — see the header. Dining rolls into Convenience rather
 * than standing alone because the owner asked for exactly four dimensions.
 */
const DIMENSION_BUCKETS: Record<DimensionKey, string[] | null> = {
  safety: null,
  schools: ["schools"],
  convenience: ["daily_errands", "shopping", "dining"],
  potential: null,
};

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  safety: "Safety",
  schools: "Schools",
  convenience: "Convenience",
  potential: "Potential",
};

/** Fixed order, so the card's four rows never reshuffle between renders. */
export const DIMENSION_ORDER: DimensionKey[] = [
  "safety",
  "schools",
  "convenience",
  "potential",
];

const NEAR_M = 400;
const FAR_M = 3000;
const DENSITY_RADIUS_M = 2000;
const UNRATED_CREDIT_M = 1000;

function proximityPoints(nearestM: number): number {
  if (nearestM <= NEAR_M) return 6;
  if (nearestM >= FAR_M) return 0;
  return (6 * (FAR_M - nearestM)) / (FAR_M - NEAR_M);
}

/**
 * Diminishing returns on purpose: the difference between one good school and two
 * matters to a buyer; the difference between eight and nine does not.
 */
function densityPoints(goodCount: number): number {
  if (goodCount <= 0) return 0;
  if (goodCount === 1) return 1.5;
  if (goodCount === 2) return 2.5;
  if (goodCount === 3) return 3.2;
  return 4;
}

function isGood(p: ScorablePoi): boolean {
  if (p.distanceM > DENSITY_RADIUS_M) return false;
  if (p.rating == null) return p.distanceM <= UNRATED_CREDIT_M;
  return p.rating >= 4 && (p.ratingCount ?? 0) >= 20;
}

/** Round half-up to one decimal. `toFixed` on a float can drift; this doesn't. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function scoreNeighborhood(pois: ScorablePoi[]): NeighborhoodScores {
  const dims: DimensionScore[] = DIMENSION_ORDER.map((key) => {
    const buckets = DIMENSION_BUCKETS[key];
    const label = DIMENSION_LABELS[key];

    if (buckets === null) {
      return { key, label, score: null, count: 0, reason: "no data source" };
    }

    const items = pois
      .filter((p) => buckets.includes(p.bucket) && Number.isFinite(p.distanceM))
      .sort((a, b) => a.distanceM - b.distanceM);

    if (items.length === 0) {
      return { key, label, score: null, count: 0, reason: "no POIs" };
    }

    // Destructure instead of indexing: `noUncheckedIndexedAccess` makes
    // `items[0]` possibly-undefined even right after a length check, and a `!`
    // here would be a lie the compiler can't verify.
    const [nearest, ...rest] = items;
    if (!nearest) {
      return { key, label, score: null, count: 0, reason: "no POIs" };
    }
    const nearestM = nearest.distanceM;
    const goodCount = [nearest, ...rest].filter(isGood).length;
    const raw = proximityPoints(nearestM) + densityPoints(goodCount);

    return {
      key,
      label,
      score: round1(Math.min(10, raw)),
      count: items.length,
      nearestM,
    };
  });

  const scored = dims
    .map((d) => d.score)
    .filter((s): s is number => s !== null);

  return {
    overall: scored.length
      ? round1(scored.reduce((a, b) => a + b, 0) / scored.length)
      : null,
    dims,
  };
}
