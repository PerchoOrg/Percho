/**
 * The POIs a community tour is allowed to touch — one definition, three
 * callers.
 *
 * `community_pois` is two sets wearing one table. The Nearby button
 * (`discoverPois`) writes a `candidate` row for 20 places per included type,
 * so a single click leaves a few hundred behind: Apremont - Highcroft carried
 * 228 links against 16 resolved POIs, and the photos step was fetching,
 * tagging and enhancing for all of them (owner 2026-08-23). The tour's set is
 * the other one:
 *
 *  - what `resolve` picked for this run, and
 *  - the links a PERSON approved — the amenity ingest stamps `approved`
 *    (ingest-page-photos.ts) and so does the admin panel.
 *
 * Everything else stays where it is, for `resolve` to pick from next time.
 */

/** The `resolved` array shape the callers have on hand. */
export interface ResolvedPlaceRef {
  place_id?: string;
  /**
   * What `resolve` scored this place on bucket weight, distance, confidence
   * and photo count. It only ever lived in `step_results.resolve` — see
   * `tourPoiSet`.
   */
  score?: number;
}

/**
 * The tour's POIs, and what `resolve` thought of each.
 *
 * The score comes from here rather than from `community_pois.ai_score`, which
 * NOTHING has ever written: `runPlan` read that column to rank places against
 * the film's budget, got null for every row, and fell back to 0 — so the
 * "strongest bucket first, best in bucket first" selection was ranking a field
 * of zeroes and the winner was whichever POI the database returned first.
 * Apremont - Highcroft is the proof: 124 candidates, 124 nulls, and three
 * school slots that went to the first three schools in row order while the one
 * the research agent had actually picked missed the cut (owner 2026-08-23).
 */
export interface TourPoiSet {
  ids: Set<string>;
  /** `resolve`'s score per POI. Empty for links a person approved instead. */
  scoreByPoiId: Map<string, number>;
}

/**
 * Map a run's resolved place_ids onto `pois.id` and union in the approved
 * links. Returns the ids the fetch / tag / review steps may act on.
 *
 * A place_id with no `pois` row yet contributes nothing — the photos step is
 * what creates those rows, so this is empty for a community that has resolved
 * but never fetched, which is correct: there is nothing to tag yet.
 */
export async function tourPoiSet(
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  sb: any,
  communityId: string,
  resolved: ResolvedPlaceRef[] | undefined,
): Promise<TourPoiSet> {
  const ids = new Set<string>();
  const scoreByPoiId = new Map<string, number>();

  const scoreByPlaceId = new Map<string, number>();
  for (const r of resolved ?? []) {
    if (r.place_id && typeof r.score === 'number') scoreByPlaceId.set(r.place_id, r.score);
  }

  const placeIds = (resolved ?? []).map((r) => r.place_id).filter(Boolean) as string[];
  if (placeIds.length > 0) {
    const { data: pois } = (await sb
      .from('pois')
      .select('id, google_place_id')
      .in('google_place_id', placeIds)) as {
      data: Array<{ id: string; google_place_id: string | null }> | null;
    };
    for (const p of pois ?? []) {
      ids.add(p.id);
      const score = p.google_place_id ? scoreByPlaceId.get(p.google_place_id) : undefined;
      if (score !== undefined) scoreByPoiId.set(p.id, score);
    }
  }

  const { data: approved } = (await sb
    .from('community_pois')
    .select('poi_id')
    .eq('community_id', communityId)
    .eq('status', 'approved')) as { data: Array<{ poi_id: string }> | null };
  for (const l of approved ?? []) ids.add(l.poi_id);

  return { ids, scoreByPoiId };
}

/** Just the ids, for the callers that do not rank anything. */
export async function tourPoiIds(
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  sb: any,
  communityId: string,
  resolved: ResolvedPlaceRef[] | undefined,
): Promise<Set<string>> {
  return (await tourPoiSet(sb, communityId, resolved)).ids;
}
