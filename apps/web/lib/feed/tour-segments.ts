/**
 * Where each PLACE begins and ends inside an assembled community tour.
 *
 * The phone's community card draws its progress as one dash per place rather
 * than one continuous bar (owner 2026-08-22: "make it dotted line and each
 * represents a specific content"), so it needs the film's structure, not just
 * its URL. `tour_assemblies.ordered_clips` already carries it — every clip
 * records the `poi_id`/`poi_name` it was cut from, and its `duration_s`.
 *
 * ── The 0.5s crossfade, and how much it is actually worth ───────────────────
 *
 * Clips are joined with a 0.5s ffmpeg `xfade`, so a place does not begin at the
 * sum of the durations before it — each transition overlaps the outgoing clip
 * and pulls everything after it earlier.
 *
 * That sounds larger than it is, and the first draft of this comment claimed it
 * was: 6.5 seconds of overlap on a 14-clip tour is 14% of the runtime, but the
 * dashes are laid out as FRACTIONS and the overlap shrinks the total by the
 * same 6.5 seconds, so most of it cancels. Measured worst-case boundary error
 * from ignoring it: 3.8% of the bar at 3 clips, 1.2% at 14. A test asserting it
 * would be "visibly wrong" failed, which is how this paragraph got corrected.
 *
 * So the xfade is here because it is four lines and it is what the renderer
 * actually did — not because the bar would be broken without it.
 *
 * The formula is `scripts/ken-burns/xfade.py`'s, and that file's header is a
 * warning about copying it — a hand-copy in the render worker once produced a
 * 16.6s cut of a 45.5s tour. This is a second implementation and there is no
 * way around that (one is Python on the Mac mini, one is TypeScript on Vercel),
 * so `tour-segments.test.ts` pins these numbers against the Python module's own
 * worked example. If the render worker's xfade changes, that test should fail.
 *
 * What this CANNOT see: the 3s end card (`END_CARD_S`, minus a 0.6s fade) that
 * `worker.py` appends when it manages to render one. Nothing on the row records
 * whether it did, so the last place's dash absorbs it — the bar still completes
 * exactly at the end of the film, and the last ~5% of it belongs to a title
 * card rather than to that place. Not worth a schema column.
 */

/** Must match `xfade` in `worker.py`'s tour-assembly step. See above. */
export const TOUR_XFADE_S = 0.5;

export interface TourSegment {
  /** The place this stretch of the film is about. */
  name: string;
  /** Where the stretch ENDS, as a fraction (0..1] of the finished film. */
  endFraction: number;
  /**
   * How far the place is from the community — "0 mi" for the community's own
   * amenities, absent when it is genuinely unknown.
   *
   * Formatted server-side by `tour-orchestrator/clip-label.ts` and stored on
   * the clip as `label_distance`; this only carries it through. It is the
   * second half of the label the render worker used to BURN into the film
   * (phase174 moved that label onto the card), so it has to travel with the
   * name that was burned beside it.
   */
  distance?: string;
  /** `community_pois.poi_id`, so a caller can resolve the place's category. */
  poiId?: string;
  /**
   * `community_pois.intent_bucket` — the place's CATEGORY, which is what the
   * community page's jump strip groups by (owner 2026-09-05: "dont say the poi
   * name, just group them by tag or category, it is too long to show all of
   * them"). Filled by `fetchVerticalVideos` from the join, or from the clip's
   * own `bucket` when the assembly recorded one. Absent when neither knows.
   */
  bucket?: string;
}

interface ParsedClip {
  /** Groups consecutive clips of the same place into one dash. */
  key: string;
  name: string;
  seconds: number;
  distance: string;
  poiId: string;
  /**
   * The assembly's own category for the clip. Ken Burns assemblies write it;
   * Seedance ones do not, which is why the `community_pois` join exists.
   */
  bucket: string;
}

function parseClips(orderedClips: unknown): ParsedClip[] {
  if (!Array.isArray(orderedClips)) return [];
  const out: ParsedClip[] = [];
  for (const raw of orderedClips) {
    if (typeof raw !== 'object' || raw === null) return [];
    const c = raw as Record<string, unknown>;
    const seconds = typeof c.duration_s === 'number' ? c.duration_s : Number.NaN;
    // One unusable clip makes every boundary after it wrong, so the whole
    // film falls back to a plain bar rather than to a misleading dashed one.
    if (!Number.isFinite(seconds) || seconds <= 0) return [];
    const name = typeof c.poi_name === 'string' ? c.poi_name : '';
    const id = typeof c.poi_id === 'string' ? c.poi_id : '';
    const distance = typeof c.label_distance === 'string' ? c.label_distance : '';
    // `poi_id` groups; the name is only what we would show. A tour with
    // neither cannot be grouped, so each clip stands alone.
    const bucket = typeof c.bucket === 'string' ? c.bucket : '';
    out.push({
      key: id || name || `clip-${out.length}`,
      name,
      seconds,
      distance,
      poiId: id,
      bucket,
    });
  }
  return out;
}

/**
 * One segment per PLACE, in play order.
 *
 * Returns `[]` for anything it cannot read — the card falls back to a plain
 * continuous bar, which is always correct because it needs no structure.
 */
export function tourSegments(orderedClips: unknown, xfade = TOUR_XFADE_S): TourSegment[] {
  const clips = parseClips(orderedClips);
  if (clips.length === 0) return [];

  const total = clips.reduce((a, c) => a + c.seconds, 0) - xfade * (clips.length - 1);
  // A tour of clips shorter than the transitions between them is not a
  // timeline this can describe.
  if (total <= 0) return [];

  /** `starts[k]` — when clip k begins on the finished timeline. */
  const starts: number[] = [];
  let acc = 0;
  for (let k = 0; k < clips.length; k++) {
    // biome-ignore lint/style/noNonNullAssertion: k is bounded by clips.length
    const seconds = clips[k]!.seconds;
    starts.push(k === 0 ? 0 : acc - (k - 1) * xfade);
    acc += seconds;
  }

  const segments: TourSegment[] = [];
  for (let k = 0; k < clips.length; k++) {
    // biome-ignore lint/style/noNonNullAssertion: k is bounded by clips.length
    const clip = clips[k]!;
    const next = clips[k + 1];
    if (next && next.key === clip.key) continue; // same place, keep accumulating
    // The place ends where the next one starts; the last runs to the end.
    const end = k + 1 < clips.length ? (starts[k + 1] ?? total) : total;
    segments.push({
      name: clip.name,
      endFraction: Math.min(end / total, 1),
      // Omitted rather than sent empty: the card decides whether to draw the
      // distance at all, and `''` would have it draw a divider with nothing
      // after it. Consecutive clips of one place carry the same distance, so
      // taking the last of the group is taking the place's.
      ...(clip.distance ? { distance: clip.distance } : {}),
      ...(clip.poiId ? { poiId: clip.poiId } : {}),
      ...(clip.bucket ? { bucket: clip.bucket } : {}),
    });
  }

  // Float drift must not leave the bar a hair short of full.
  const last = segments[segments.length - 1];
  if (last) last.endFraction = 1;
  return segments;
}
