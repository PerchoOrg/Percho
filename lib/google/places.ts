/**
 * Google Places + Geocoding helpers (server-side only).
 *
 * The browser never sees `GOOGLE_PLACES_API_KEY`. Two thin wrappers:
 *
 *   - autocomplete(q, sessionToken): used by the new-listing address input.
 *   - placeDetails(placeId, sessionToken): resolves a chosen prediction into
 *     {formatted_address, city, state, zip, lat, lng, place_id}. Phase 4.1
 *     uses Place Details directly so the form has every geocoded field on
 *     submit (Phase 4.2 narrows to neighborhood + edge-case fixups).
 *
 * Session token: Google bills Autocomplete + Details as a single session if
 * the same UUID is passed to both calls within ~3 minutes. The form mints one
 * per address-search burst and discards it after submit.
 */

const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

function getKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY is not set');
  return key;
}

export type Prediction = {
  place_id: string;
  description: string;
};

export async function autocomplete(input: string, sessionToken: string): Promise<Prediction[]> {
  const url = new URL(`${PLACES_BASE}/autocomplete/json`);
  url.searchParams.set('input', input);
  url.searchParams.set('sessiontoken', sessionToken);
  url.searchParams.set('types', 'address');
  url.searchParams.set('components', 'country:us');
  url.searchParams.set('key', getKey());

  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`places_autocomplete_${res.status}`);
  const json = (await res.json()) as {
    status: string;
    predictions?: { place_id: string; description: string }[];
    error_message?: string;
  };
  if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
    throw new Error(`places_autocomplete_status_${json.status}`);
  }
  return (json.predictions ?? []).map((p) => ({
    place_id: p.place_id,
    description: p.description,
  }));
}

export type PlaceDetails = {
  place_id: string;
  formatted_address: string;
  street_address: string; // e.g. "123 Main St" — what we put in `listings.address`
  city: string;
  state: string; // 2-letter
  zip: string | null;
  neighborhood: string | null;
  lat: number;
  lng: number;
};

type AddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

function pickComponent(components: AddressComponent[], type: string, short = false): string | null {
  const c = components.find((x) => x.types.includes(type));
  if (!c) return null;
  return short ? c.short_name : c.long_name;
}

export async function placeDetails(
  placeId: string,
  sessionToken: string,
): Promise<PlaceDetails | null> {
  const url = new URL(`${PLACES_BASE}/details/json`);
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('sessiontoken', sessionToken);
  url.searchParams.set('fields', 'place_id,formatted_address,address_components,geometry/location');
  url.searchParams.set('key', getKey());

  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`place_details_${res.status}`);
  const json = (await res.json()) as {
    status: string;
    result?: {
      place_id: string;
      formatted_address: string;
      address_components: AddressComponent[];
      geometry: { location: { lat: number; lng: number } };
    };
    error_message?: string;
  };
  if (json.status === 'NOT_FOUND' || json.status === 'INVALID_REQUEST') return null;
  if (json.status !== 'OK' || !json.result) {
    throw new Error(`place_details_status_${json.status}`);
  }

  const r = json.result;
  const comps = r.address_components;
  const streetNumber = pickComponent(comps, 'street_number') ?? '';
  const route = pickComponent(comps, 'route') ?? '';
  const street_address = [streetNumber, route].filter(Boolean).join(' ').trim();

  const city =
    pickComponent(comps, 'locality') ??
    pickComponent(comps, 'sublocality') ??
    pickComponent(comps, 'administrative_area_level_3') ??
    '';
  const state = pickComponent(comps, 'administrative_area_level_1', true) ?? '';
  const zip = pickComponent(comps, 'postal_code');
  // Neighborhood: Google may return it under either 'neighborhood' (most common
  // in major US metros — e.g. Buckhead, SoMa) or 'sublocality_level_1' (NYC-style
  // boroughs / dense urban areas). Suburban / rural addresses often have neither —
  // 4.6 publish does NOT require it, so null is a normal outcome.
  const neighborhood =
    pickComponent(comps, 'neighborhood') ?? pickComponent(comps, 'sublocality_level_1');

  return {
    place_id: r.place_id,
    formatted_address: r.formatted_address,
    street_address: street_address || r.formatted_address.split(',')[0] || '',
    city,
    state,
    zip,
    neighborhood,
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
  };
}
