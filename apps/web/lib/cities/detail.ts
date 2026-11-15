/**
 * A city for the apps (phase327): which film each city card plays, and the
 * city page's content.
 *
 * Two readers. The mobile feed asks `fetchCityFilms` which geo units have a
 * film, and gives those units their `videoUrl` — a city card with no film is
 * not shown on the phone, whose deck is films only. The city page asks
 * `fetchCityDetail` for the fundamentals in `cities.profile` plus the film and
 * the credits for the photographs it is cut from.
 *
 * A city's film is its newest `ready` assembly, the rule communities follow
 * (`lib/feed/vertical-videos.ts`).
 *
 * Service role for the assemblies and the photo attributions, as in
 * `vertical-videos.ts` and `film-credits.ts`: RLS lets only admins read
 * `city_tour_assemblies` and only agents read `poi_photos`. What leaves this
 * module is a stream uid turned into a URL, and the photographers' public
 * names. The `cities` row itself is public and is read as anon.
 *
 * The film SCRIPT (`profile.film`) never leaves: it is photo ids and editing
 * notes, of no use to a reader.
 */

import { clipPhotoIds, googleAuthorNames } from '@/lib/communities/film-credits';
import { streamManifestUrl, streamPosterUrl } from '@/lib/feed/vertical-videos';
import { type TypedClient, createAnonClient, createServiceClient } from '@/lib/supabase/server';
import { parseCityProfile } from '@/lib/zod/city-profile';
import type { CityDetailDTO, CityFilmCredits, CityFundamentals } from '@percho/shared/city';

export interface CityFilm {
  slug: string;
  videoUrl: string;
  posterUrl: string;
}

interface PhotoRow {
  id: string;
  source: string;
  attribution: unknown;
}

/**
 * Credits for the photographs a film shows, in film order, without repeats.
 *
 * Google's Places policy asks for the author's name wherever a photo is
 * displayed. A Commons file under CC BY asks for the author, the licence and a
 * link to the file; public-domain and CC0 files ask for nothing, and are
 * credited the same way because a reader cannot tell which is which.
 */
export function cityFilmCredits(
  rows: readonly PhotoRow[],
  ids: readonly string[],
): CityFilmCredits {
  const at = (id: string) => {
    const i = ids.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const commons: CityFilmCredits['commons'] = [];
  const seen = new Set<string>();
  for (const row of [...rows].sort((a, b) => at(a.id) - at(b.id))) {
    if (row.source !== 'wikimedia_commons') continue;
    const a = row.attribution as {
      author?: unknown;
      licence?: unknown;
      source_page?: unknown;
    } | null;
    const url = typeof a?.source_page === 'string' ? a.source_page : '';
    if (!url || seen.has(url)) continue;
    seen.add(url);
    commons.push({
      author: typeof a?.author === 'string' && a.author.trim() ? a.author.trim() : 'Unknown author',
      licence: typeof a?.licence === 'string' ? a.licence : '',
      url,
    });
  }
  return { google: googleAuthorNames(rows, ids), commons };
}

type AssemblyRow = { city_id: string; cf_stream_uid: string | null; ordered_clips?: unknown };

/** Geo-unit id → the film of the city that unit is. Never throws: a film is an enhancement. */
export async function fetchCityFilms(
  /** Route handlers pass an uncached client, so a re-cut film reaches the phone (phase312). */
  supabase: TypedClient = createServiceClient(),
): Promise<Map<string, CityFilm>> {
  const films = new Map<string, CityFilm>();
  const [cities, assemblies] = await Promise.all([
    supabase
      .from('cities')
      .select('id, slug, geo_unit_id')
      .eq('status', 'active')
      .not('geo_unit_id', 'is', null),
    supabase
      .from('city_tour_assemblies')
      .select('city_id, cf_stream_uid')
      .eq('status', 'ready')
      .not('cf_stream_uid', 'is', null)
      .order('created_at', { ascending: false }),
  ]);
  if (cities.error || assemblies.error) {
    console.warn('[city] films unavailable', cities.error ?? assemblies.error);
    return films;
  }
  const newest = new Map<string, string>();
  for (const row of (assemblies.data ?? []) as AssemblyRow[]) {
    if (row.cf_stream_uid && !newest.has(row.city_id)) newest.set(row.city_id, row.cf_stream_uid);
  }
  for (const city of cities.data ?? []) {
    const uid = newest.get(city.id);
    if (!uid || !city.geo_unit_id) continue;
    films.set(city.geo_unit_id, {
      slug: city.slug,
      videoUrl: streamManifestUrl(uid),
      posterUrl: streamPosterUrl(uid),
    });
  }
  return films;
}

/** The city page, or null when there is no such active city or it has no profile yet. */
export async function fetchCityDetail(slug: string): Promise<CityDetailDTO | null> {
  const anon = await createAnonClient();
  const { data: city, error } = await anon
    .from('cities')
    .select('id, slug, name, state, county, geo_unit_id, profile')
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw new Error(`city read failed: ${error.message}`);
  const profile = parseCityProfile(city?.profile);
  if (!city || !profile) return null;

  // Everything but the script. Typed as the shared shape, so a profile field
  // the apps do not know about fails here rather than on a phone.
  const { film: _film, ...fundamentals } = profile;
  const shared: CityFundamentals = fundamentals;

  let video: { videoUrl: string; posterUrl: string } | undefined;
  let credits: CityFilmCredits = { google: [], commons: [] };
  try {
    const service = createServiceClient();
    const { data: assembly } = await service
      .from('city_tour_assemblies')
      .select('city_id, cf_stream_uid, ordered_clips')
      .eq('city_id', city.id)
      .eq('status', 'ready')
      .not('cf_stream_uid', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = assembly as AssemblyRow | null;
    if (row?.cf_stream_uid) {
      video = {
        videoUrl: streamManifestUrl(row.cf_stream_uid),
        posterUrl: streamPosterUrl(row.cf_stream_uid),
      };
      const ids = clipPhotoIds(row.ordered_clips);
      if (ids.length > 0) {
        const { data: photos } = await service
          .from('poi_photos')
          .select('id, source, attribution')
          .in('id', ids);
        credits = cityFilmCredits((photos ?? []) as PhotoRow[], ids);
      }
    }
  } catch (err) {
    // The page is worth showing without its film; a credit line must not take it down.
    console.warn('[city] film unavailable', err);
  }

  return {
    slug: city.slug,
    name: city.name,
    state: city.state,
    ...(city.county ? { county: city.county } : {}),
    ...(city.geo_unit_id ? { geoUnitId: city.geo_unit_id } : {}),
    ...(video ?? {}),
    ...shared,
    credits,
  };
}
