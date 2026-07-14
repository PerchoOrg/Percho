/**
 * Google Places API (New) client — server-side only.
 *
 * Docs: https://developers.google.com/maps/documentation/places/web-service/
 *
 * v0 covers `places:searchNearby`, `places:searchText`, and photo media
 * fetching. Directions and Street View live in sibling modules so each API's
 * quota/billing surface stays isolated.
 *
 * All calls use POST + X-Goog-FieldMask to keep the response tight (Google
 * bills per field-mask category). Never call without a mask — omitting it
 * returns *every* field and jumps the cost bracket.
 */

const PLACES_BASE = "https://places.googleapis.com/v1";

/** Six default categories tuned for US suburban listings. */
export const DEFAULT_INCLUDED_TYPES = [
  "restaurant",
  "cafe",
  "grocery_store",
  "primary_school",
  "park",
  "gym",
] as const;

export type NearbySearchInput = {
  center: { lat: number; lng: number };
  /** meters, max 50000 per Google. */
  radius: number;
  includedTypes?: readonly string[];
  /** Max 20 per API call. */
  maxResultCount?: number;
};

export type PlaceResult = {
  id: string;
  displayName: { text: string; languageCode?: string };
  formattedAddress?: string;
  primaryType?: string;
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  location?: { latitude: number; longitude: number };
  photos?: Array<{
    name: string; // "places/{place_id}/photos/{photo_ref}"
    widthPx?: number;
    heightPx?: number;
    authorAttributions?: Array<{
      displayName?: string;
      uri?: string;
      photoUri?: string;
    }>;
  }>;
};

function apiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY not set");
  return key;
}

const NEARBY_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.primaryType",
  "places.types",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.location",
  "places.photos",
].join(",");

export async function searchNearby(input: NearbySearchInput): Promise<PlaceResult[]> {
  const body = {
    includedTypes: [...(input.includedTypes ?? DEFAULT_INCLUDED_TYPES)],
    maxResultCount: Math.min(input.maxResultCount ?? 20, 20),
    locationRestriction: {
      circle: {
        center: { latitude: input.center.lat, longitude: input.center.lng },
        radius: input.radius,
      },
    },
  };

  const res = await fetch(`${PLACES_BASE}/places:searchNearby`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask": NEARBY_FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Places searchNearby failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as { places?: PlaceResult[] };
  return data.places ?? [];
}

/**
 * Text-based place lookup. Used when we only have an address string and need
 * a Place ID for the listing itself (to seed the search center + build the
 * commute-anchor list).
 */
export async function searchText(query: string): Promise<PlaceResult[]> {
  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 5 }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Places searchText failed: ${res.status} ${err}`);
  }
  const data = (await res.json()) as { places?: PlaceResult[] };
  return data.places ?? [];
}

export type PhotoBlob = {
  bytes: Buffer;
  contentType: string;
};

/**
 * Fetch a single Place photo. Google returns a 302 to a signed googleusercontent
 * URL; `fetch` follows redirects by default, so we end up with the JPEG bytes.
 *
 * @param photoName e.g. "places/xxx/photos/yyy"
 * @param maxHeightPx clamp for cost (10..4800)
 */
export async function fetchPhotoBinary(
  photoName: string,
  opts: { maxHeightPx?: number; maxWidthPx?: number } = {},
): Promise<PhotoBlob> {
  const params = new URLSearchParams();
  if (opts.maxHeightPx) params.set("maxHeightPx", String(opts.maxHeightPx));
  if (opts.maxWidthPx) params.set("maxWidthPx", String(opts.maxWidthPx));
  if (!opts.maxHeightPx && !opts.maxWidthPx) params.set("maxHeightPx", "1200");

  const url = `${PLACES_BASE}/${photoName}/media?${params.toString()}`;
  const res = await fetch(url, { headers: { "X-Goog-Api-Key": apiKey() } });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Places photo fetch failed: ${res.status} ${err}`);
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  return { bytes, contentType: res.headers.get("content-type") ?? "image/jpeg" };
}

/**
 * Straight-line distance in meters (Haversine). Fast enough for the O(60) POI
 * pool per listing — no need for a spatial extension in v0.
 */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Assign an intent bucket based on straight-line distance (v0 heuristic).
 * Phase B refines with actual drive time from Directions API.
 */
export function bucketByDistance(meters: number): "walkable" | "daily_drive" | "lifestyle" {
  if (meters <= 800) return "walkable"; // ~0.5 mi
  if (meters <= 3200) return "daily_drive"; // ~2 mi
  return "lifestyle"; // up to 8 km / ~5 mi
}
