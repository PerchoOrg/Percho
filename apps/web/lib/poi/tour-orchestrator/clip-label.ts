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

export interface ClipLabelInput {
  poiName: string;
  /** 'amenities' means the community's own facility — distance is "0 mi". */
  bucket?: string | null;
  /** Straight-line metres from the community centroid; null when unknown. */
  distanceM?: number | null;
}

/**
 * Name and distance as SEPARATE lines. The overlay stacks them right-aligned in
 * a pinned card, so it needs the parts, not a pre-joined "Name · 0.9 mi".
 */
export interface ClipLabel {
  name: string;
  /** Empty only when the distance is genuinely unknown. */
  distance: string;
}

/**
 * Miles, rounded the way someone says them out loud: "0.9 mi", "2.5 mi".
 *
 * No "walkable" special case any more. It put a word where every other clip had
 * a number, so the second line changed shape as the film ran — visible now that
 * the card is pinned rather than redrawn per clip. A small number is still
 * honest; it just reads as "basically here".
 */
export function formatDistance(distanceM: number): string {
  const miles = distanceM / 1609.344;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

export function clipLabel(input: ClipLabelInput): ClipLabel {
  const name = input.poiName.trim();
  if (!name) return { name: '', distance: '' };
  // The community's own amenities are, by definition, here. Owner 2026-08-19:
  // "if inside the community, just say 0 mile" — an explicit zero reads as
  // "this one is yours", where the blank line it replaced looked like missing
  // data on an otherwise uniform card.
  if (input.bucket === 'amenities') return { name, distance: '0 mi' };
  if (input.distanceM == null || !Number.isFinite(input.distanceM)) {
    return { name, distance: '' };
  }
  return { name, distance: formatDistance(input.distanceM) };
}
