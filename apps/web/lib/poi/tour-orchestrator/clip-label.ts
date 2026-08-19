/**
 * The on-screen label for one tour clip (pure).
 *
 * Owner 2026-08-19: "we should add location names to the videos so people know
 * what it is and how far it is from community if it is not inside the
 * community". A community tour visits a dozen named places in 75 seconds; with
 * no label a buyer cannot tell a county park from the community's own green
 * space, which is the single most decision-relevant thing on screen.
 *
 * Note the contrast with the LISTING tour, which carries no on-screen text at
 * all (owner 2026-08-01: a caption band is "a wall between the buyer and the
 * house"). That holds there because the subject never changes — it is one
 * house for the whole film. A community tour changes subject every few
 * seconds, so the label is answering a question rather than interrupting one.
 */

/** Below this a place is close enough that a number adds nothing. */
const WALKABLE_M = 400;

export interface ClipLabelInput {
  poiName: string;
  /** 'amenities' means the community's own facility — no distance shown. */
  bucket?: string | null;
  /** Straight-line metres from the community centroid; null when unknown. */
  distanceM?: number | null;
}

/**
 * Miles, rounded the way someone says them out loud: "0.9 mi", "2.5 mi".
 * Under a quarter mile reads as walking distance rather than a number.
 */
export function formatDistance(distanceM: number): string {
  if (distanceM <= WALKABLE_M) return 'walkable';
  const miles = distanceM / 1609.344;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

export function clipLabel(input: ClipLabelInput): string {
  const name = input.poiName.trim();
  if (!name) return '';
  // The community's own amenities are, by definition, here. A distance on the
  // clubhouse would be noise at best and wrong at worst.
  if (input.bucket === 'amenities') return name;
  if (input.distanceM == null || !Number.isFinite(input.distanceM)) return name;
  return `${name} · ${formatDistance(input.distanceM)}`;
}
