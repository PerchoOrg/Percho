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
import { type TourSegment, tourSegments } from '@/lib/feed/tour-segments';
import { streamManifestUrl, streamPosterUrl } from '@/lib/feed/vertical-videos';
import {
  type TypedClient,
  createServiceClient,
  createUncachedAnonClient,
  createUncachedServiceClient,
} from '@/lib/supabase/server';
import { parseCityProfile } from '@/lib/zod/city-profile';
import type { CityDetailDTO, CityFilmCredits, CityFundamentals } from '@percho/shared/city';
import { buildTourChapters } from '@percho/shared/tour-buckets';
import { fetchCityReviews } from '../communities/reviews';
import { parseCommunityProfile } from '../zod/community-profile';
import { bySection } from './chapters';
import { cityForecast } from './forecasts';
import {
  articleLinks,
  cityCrime,
  cityEveryday,
  cityHazards,
  cityLinks,
  citySchools,
  schoolSite,
} from './links';

export interface CityFilm {
  slug: string;
  videoUrl: string;
  posterUrl: string;
  /** One per place the film shows — the card's place label. */
  segments: TourSegment[];
  /** The film's chapters — the card's progress bar, when the film has them (phase345). */
  chapters: Array<{ name: string; endFraction: number }>;
  /** What the card's glance is built from (`lib/feed/glance.ts`, phase378). */
  place: {
    name: string;
    state: string | null;
    county: string | null;
    lat: number | null;
    lng: number | null;
    profile: Pick<
      CityFundamentals,
      'compare' | 'education' | 'gettingAround' | 'locationNote'
    > | null;
    /** Every scored school in and around the city — the card's schools letter. */
    schools: CityDetailDTO['allSchools'];
  };
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
      .select('id, slug, geo_unit_id, name, state, county, lat, lng, profile')
      .eq('status', 'active')
      .not('geo_unit_id', 'is', null),
    supabase
      .from('city_tour_assemblies')
      .select('city_id, cf_stream_uid, ordered_clips')
      .eq('status', 'ready')
      .not('cf_stream_uid', 'is', null)
      .order('created_at', { ascending: false }),
  ]);
  if (cities.error || assemblies.error) {
    console.warn('[city] films unavailable', cities.error ?? assemblies.error);
    return films;
  }
  const newest = new Map<string, AssemblyRow>();
  for (const row of (assemblies.data ?? []) as AssemblyRow[]) {
    if (row.cf_stream_uid && !newest.has(row.city_id)) newest.set(row.city_id, row);
  }
  for (const city of cities.data ?? []) {
    const film = newest.get(city.id);
    if (!film?.cf_stream_uid || !city.geo_unit_id) continue;
    films.set(city.geo_unit_id, {
      slug: city.slug,
      videoUrl: streamManifestUrl(film.cf_stream_uid),
      posterUrl: streamPosterUrl(film.cf_stream_uid),
      // The community card's place label reads these; a city's shots are
      // named for the place they show (`lib/cities/film.ts`).
      segments: tourSegments(film.ordered_clips).map(({ name, endFraction }) => ({
        name,
        endFraction,
      })),
      // The film's SECTIONS, in the card's own segment shape so its parser
      // reads both alike. Five at most — see `CITY_FILM_SECTIONS`.
      chapters: buildTourChapters(bySection(tourSegments(film.ordered_clips))).map((c) => ({
        name: c.label,
        endFraction: c.endFraction,
      })),
      place: {
        name: city.name,
        state: city.state,
        county: city.county,
        lat: city.lat,
        lng: city.lng,
        profile: parseCityProfile(city.profile),
        schools: citySchools(city.slug),
      },
    });
  }
  return films;
}

/**
 * The city page, or null when there is no such active city or it has no profile yet.
 *
 * Both reads are uncached (phase312's trap, again): through Next's fetch cache
 * this page kept the profile it first read, and when the profile's schema grew
 * a field the stale copy no longer parsed — the page answered 404 for a city
 * whose row was fine (2026-11-15).
 */
/**
 * A month of holding the typical home in the city, read off one of the city's
 * own community profiles rather than computed a second time.
 *
 * `profile-build.ts` prices it from the city's Zillow value and the county's
 * tax and utility figures, so every computed profile in a city carries the
 * same block, named for the city ("a month to hold the typical Cumming
 * home"). A researched profile may be drawn for a ZIP instead; those are
 * passed over by checking the block is the city's.
 */
async function cityHolding(
  anon: ReturnType<typeof createUncachedAnonClient>,
  cityName: string,
): Promise<CityDetailDTO['holding'] | undefined> {
  const { data, error } = await anon
    .from('communities')
    .select('profile')
    .eq('city', cityName)
    .eq('status', 'active')
    .not('profile', 'is', null)
    .order('id')
    .limit(8);
  if (error) throw new Error(`holding read failed: ${error.message}`);
  for (const row of data ?? []) {
    const value = parseCommunityProfile(row.profile)?.homeValue;
    if (value?.holding && value.area === cityName) return value.holding;
  }
  return undefined;
}

export async function fetchCityDetail(slug: string): Promise<CityDetailDTO | null> {
  const anon = createUncachedAnonClient();
  const { data: city, error } = await anon
    .from('cities')
    .select('id, slug, name, state, county, geo_unit_id, lat, lng, website, profile')
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
  let segments: CityDetailDTO['tourSegments'] = [];
  let credits: CityFilmCredits = { google: [], commons: [] };
  try {
    const service = createUncachedServiceClient();
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
      segments = bySection(tourSegments(row.ordered_clips)).map(
        ({ name, endFraction, bucket, bucketLabel }) => ({
          name,
          endFraction,
          ...(bucket ? { bucket } : {}),
          ...(bucketLabel ? { bucketLabel } : {}),
        }),
      );
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

  // Read with the anon client on purpose: RLS hands it approved rows only.
  const reviews = await fetchCityReviews(anon, city.id).catch((err) => {
    console.warn('[city] reviews unavailable', err);
    return null;
  });
  const holding = await cityHolding(anon, city.name).catch((err) => {
    console.warn('[city] holding cost unavailable', err);
    return undefined;
  });
  const forecast = cityForecast(city.county);
  const hazards = cityHazards(city.slug);
  const crime = cityCrime(city.slug);
  const allSchools = citySchools(city.slug);
  const everyday = cityEveryday(city.slug);
  return {
    id: city.id,
    slug: city.slug,
    name: city.name,
    state: city.state,
    ...(city.county ? { county: city.county } : {}),
    ...(city.geo_unit_id ? { geoUnitId: city.geo_unit_id } : {}),
    ...(video ?? {}),
    tourSegments: segments,
    ...shared,
    education: {
      ...shared.education,
      schools: shared.education.schools.map((s) => {
        const site = schoolSite(city.slug, s.name);
        return site ? { ...s, site } : s;
      }),
    },
    credits,
    ...(crime ? { crime } : {}),
    ...(hazards ? { hazards } : {}),
    ...(everyday ? { everyday } : {}),
    ...(reviews ? { reviews } : {}),
    ...(forecast ? { forecast } : {}),
    ...(holding ? { holding } : {}),
    ...(allSchools ? { allSchools } : {}),
    links: [
      ...cityLinks({
        name: city.name,
        county: city.county,
        lat: city.lat,
        lng: city.lng,
        website: city.website,
      }),
      ...articleLinks(shared),
    ],
  };
}
