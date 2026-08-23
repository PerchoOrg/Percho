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

/** The `resolved` array shape both callers have on hand. */
export interface ResolvedPlaceRef {
  place_id?: string;
}

/**
 * Map a run's resolved place_ids onto `pois.id` and union in the approved
 * links. Returns the ids the fetch / tag / review steps may act on.
 *
 * A place_id with no `pois` row yet contributes nothing — the photos step is
 * what creates those rows, so this is empty for a community that has resolved
 * but never fetched, which is correct: there is nothing to tag yet.
 */
export async function tourPoiIds(
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  sb: any,
  communityId: string,
  resolved: ResolvedPlaceRef[] | undefined,
): Promise<Set<string>> {
  const ids = new Set<string>();

  const placeIds = (resolved ?? []).map((r) => r.place_id).filter(Boolean) as string[];
  if (placeIds.length > 0) {
    const { data: pois } = (await sb.from('pois').select('id').in('google_place_id', placeIds)) as {
      data: Array<{ id: string }> | null;
    };
    for (const p of pois ?? []) ids.add(p.id);
  }

  const { data: approved } = (await sb
    .from('community_pois')
    .select('poi_id')
    .eq('community_id', communityId)
    .eq('status', 'approved')) as { data: Array<{ poi_id: string }> | null };
  for (const l of approved ?? []) ids.add(l.poi_id);

  return ids;
}
