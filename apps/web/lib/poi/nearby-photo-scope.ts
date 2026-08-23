/**
 * Which of a community's photos belong on its review page.
 *
 * Its own module because `admin-nearby-photos.ts` is a `'use server'` file —
 * every export there has to be an async server action, and this is a pure
 * predicate the tests call directly.
 */

/**
 * Does this photo belong on the community's review page? PURE.
 *
 * `focusPoiIds` is the tour's POI set — what `resolve` picked plus the links a
 * person approved, which is exactly what the photos step now fetches and tags
 * for. Everything else in `community_pois` is Nearby-button output
 * (`discoverPois` writes a candidate row for 20 places per included type), and
 * its photos are places the film will never visit: Apremont - Highcroft listed
 * 479 photos against 16 resolved POIs (owner 2026-08-23, "only show the photos
 * from resolved poi").
 *
 * Two exceptions, so narrowing the page cannot hide work that already exists:
 * a photo the pipeline put IN the cut (`status === 'approved'` — see the
 * verdict comment in tour-steps/photos.ts) and a photo a person ruled on
 * themselves. Aberdeen has seven of the first and two of the second sitting on
 * POIs its newest run did not resolve.
 */
export function keepPhotoForTour(
  photo: { poi_id: string; status: string | null; reviewed_by: string | null },
  focusPoiIds: Set<string>,
): boolean {
  if (focusPoiIds.has(photo.poi_id)) return true;
  if (photo.status === 'approved') return true;
  return photo.reviewed_by != null;
}
