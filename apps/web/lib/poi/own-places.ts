/**
 * A community's OWN places on Google — its clubhouse, pool, golf club or HOA.
 *
 * The research step asks for what surrounds a community, so it never proposes
 * the community itself, and the amenity act was fed only by photos copied from
 * the HOA's website. Wild Timber's site had five, all small; Google had a
 * "Wild Timber Hoa Cabin Club" with eight full-size photos the run never saw
 * (owner 2026-11-21: "小区内的内容可以多一点").
 *
 * Three Text Searches per community — the bare name, "<name> clubhouse",
 * "<name> pool" — because the bare name alone often returns only the street
 * named after it (Wild Timber Road). When those find nothing, three more:
 * "<name> HOA", "<name> swim tennis", "<name> amenity center". A result counts as the community's own
 * when it carries the community's name, sits near it, has photos, and is not a
 * business that merely borrows the name (a "Windermere Publix").
 */
import { haversineMeters } from '@/lib/geo/distance';
import { ADMINISTRATIVE_TYPES, type ResolvedPoi } from './community-tour';
import { type PlaceResult, searchText } from './google-places';
import { isReligiousPlace } from './religious-content';

/** A clubhouse or pool is inside the community; 2 km covers the big ones. */
export const OWN_PLACE_MAX_M = 2000;

/** Words too common in subdivision names to identify one on their own. */
const GENERIC_WORDS = new Set([
  'the',
  'at',
  'of',
  'and',
  'on',
  'country',
  'club',
  'park',
  'estates',
  'estate',
  'village',
  'villas',
  'place',
  'commons',
  'crossing',
  'landing',
  'ridge',
  'manor',
  'farms',
  'farm',
  'lake',
  'lakes',
  'creek',
  'station',
  'plantation',
  'hoa',
  'community',
  'homes',
  'townhomes',
  'towns',
  'north',
  'south',
  'east',
  'west',
]);

/**
 * Types that mean a business using the name, not the community's own place.
 * Real-estate offices are here because "<name> Realty" is a common shopfront.
 */
const BORROWED_NAME_TYPES = new Set([
  'route',
  'street_address',
  'premise',
  'school',
  'primary_school',
  'secondary_school',
  'restaurant',
  'cafe',
  'bakery',
  'bar',
  'food',
  'store',
  'supermarket',
  'grocery_store',
  'shopping_mall',
  'department_store',
  'clothing_store',
  'pharmacy',
  'hospital',
  'doctor',
  'veterinary_care',
  'pet_store',
  'gas_station',
  'bank',
  'lodging',
  'real_estate_agency',
  'car_dealer',
  'car_repair',
]);

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

/** Does `placeName` carry the community's name? PURE. */
export function carriesCommunityName(communityName: string, placeName: string): boolean {
  const place = words(placeName);
  const all = words(communityName);
  const distinctive = all.filter((w) => !GENERIC_WORDS.has(w));
  // "Lake Lanier", "The Commons": every word is generic, so the whole name
  // has to appear, in order.
  if (distinctive.length === 0) return ` ${place.join(' ')} `.includes(` ${all.join(' ')} `);
  return distinctive.every((w) => place.includes(w));
}

/** Is this Places result the community's own place? PURE. */
export function isOwnPlace(
  communityName: string,
  center: { lat: number; lng: number },
  p: PlaceResult,
): boolean {
  if (!p.photos?.length || !p.location) return false;
  if (!carriesCommunityName(communityName, p.displayName?.text ?? '')) return false;
  const types = [p.primaryType, ...(p.types ?? [])].filter((t): t is string => !!t);
  if (types.some((t) => ADMINISTRATIVE_TYPES.has(t) || BORROWED_NAME_TYPES.has(t))) return false;
  if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') return false;
  if (
    isReligiousPlace({
      name: p.displayName?.text ?? null,
      primaryType: p.primaryType ?? null,
      types: p.types ?? null,
    })
  ) {
    return false;
  }
  const d = haversineMeters(center, { lat: p.location.latitude, lng: p.location.longitude });
  return d <= OWN_PLACE_MAX_M;
}

/** The community's own places, as resolved POIs in the `amenities` bucket. */
export async function findOwnPlaces(
  communityName: string,
  locality: string,
  center: { lat: number; lng: number },
): Promise<ResolvedPoi[]> {
  const found = new Map<string, PlaceResult>();
  // The second set runs only when the first found nothing: Hedgerows' HOA
  // place showed up for the bare name, but a community listed only as its
  // association ("<name> HOA") or its swim-and-tennis club would not.
  // A country-club community's course is its identity, and the bare name can
  // rank it out of the top five (Sugarloaf Country Club lost "TPC Sugarloaf").
  const golf = /country club|golf/i.test(communityName) ? ['golf'] : [];
  for (const suffix of ['', 'clubhouse', 'pool', ...golf, 'HOA', 'swim tennis', 'amenity center']) {
    if (['HOA', 'swim tennis', 'amenity center'].includes(suffix) && found.size > 0) break;
    const query = [[communityName, suffix].filter(Boolean).join(' '), locality]
      .filter(Boolean)
      .join(', ');
    let places: PlaceResult[];
    try {
      places = await searchText(query, { center, radiusMeters: OWN_PLACE_MAX_M });
    } catch (err) {
      console.warn('[own-places] search failed', { query, error: (err as Error).message });
      continue;
    }
    for (const p of places) {
      if (!found.has(p.id) && isOwnPlace(communityName, center, p)) found.set(p.id, p);
    }
  }
  return [...found.values()].map((p) => {
    const loc = p.location as { latitude: number; longitude: number };
    return {
      place_id: p.id,
      name: p.displayName?.text ?? communityName,
      formatted_address: p.formattedAddress ?? null,
      primary_type: p.primaryType ?? null,
      types: p.types ?? null,
      raw_place: p,
      bucket: 'amenities',
      lat: loc.latitude,
      lng: loc.longitude,
      distance_m: Math.round(haversineMeters(center, { lat: loc.latitude, lng: loc.longitude })),
      agreement: 1,
      confidence: 'high',
      source: 'google_own_place',
      why: `The community's own place on Google (${p.displayName?.text ?? ''})`,
      shot_note: '',
      photo_count: p.photos?.length ?? 0,
      rating: p.rating ?? null,
      user_ratings_total: p.userRatingCount ?? null,
      // Amenities are never ranked against the surroundings — `runPlan` keeps
      // every one of them — so the score only orders the resolve panel.
      score: 1,
    };
  });
}
