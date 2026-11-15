/**
 * More photographs for a city film.
 *
 * A community film visits a dozen places and three photos of each is plenty. A
 * city film is about the city as a whole and speaks one line per picture, so
 * it runs out fast: Suwanee's 42 pipeline photos held about ten city-scale
 * subjects, and the owner's rule (2026-11-15) is that EVERY narrated line has
 * its own matching photo. This script is where the rest come from:
 *
 *   topup          the rest of each place's Google photos (the pipeline takes 3)
 *   place          a place the research step did not name, found by text search
 *   commons-search what Wikimedia Commons holds, with the licence of each file
 *   commons        ingest named Commons files under one label
 *
 * Everything lands `pending` and untagged, exactly as pipeline photos do. Run
 * `pnpm tour <slug> --city --steps tag` afterwards so the tagger describes
 * them; the film script then names the photos it wants by id.
 *
 * Runs with the service role. CLAUDE.md §3 permits that here: this file lives
 * in scripts/admin/ and is invoked by hand.
 *
 * Usage, from apps/web (source .env.local first):
 *   pnpm city:photos suwanee-ga topup [--max 10]
 *   pnpm city:photos suwanee-ga place "Suwanee Farmers Market" [--bucket outdoor]
 *   pnpm city:photos suwanee-ga commons-search "Suwanee Georgia"
 *   pnpm city:photos suwanee-ga commons "Old Town" [--bucket civic] "File:A.jpg" "File:B.jpg"
 */
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  type CommonsFile,
  commonsLicenceOk,
  commonsSearchUrl,
  commonsTitlesUrl,
  parseCommonsPages,
} from '../../apps/web/lib/poi/commons.js';

const USER_AGENT = 'PerchoCityFilms/1.0 (https://www.percho.co)';
const PHOTO_BUCKET = 'listing-photos';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}. Source .env.local first.`);
  return v;
}

/** `--name value` or `--name=value`, removed from `argv`. */
function takeFlag(argv: string[], name: string): string | undefined {
  const inline = argv.findIndex((a) => a.startsWith(`--${name}=`));
  if (inline >= 0) return argv.splice(inline, 1)[0]?.split('=').slice(1).join('=');
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  return argv.splice(i, 2)[1];
}

async function commonsFiles(url: string): Promise<CommonsFile[]> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Commons answered ${res.status}`);
  return parseCommonsPages(await res.json());
}

async function main() {
  const argv = process.argv.slice(2);
  const max = Number(takeFlag(argv, 'max') ?? 10);
  const bucket = takeFlag(argv, 'bucket') ?? 'other';
  const [slug, command, ...rest] = argv;
  if (!slug || !command) {
    console.error(
      'Usage: pnpm city:photos <city-slug> topup | place "<query>" | commons-search "<query>" | commons "<label>" "File:…"…',
    );
    process.exit(1);
  }

  if (command === 'commons-search') {
    const files = await commonsFiles(commonsSearchUrl(rest.join(' ')));
    for (const f of files) {
      const ok = commonsLicenceOk(f.licence) ? 'ok ' : 'NO ';
      console.log(
        `${ok} ${f.licence.padEnd(14)} ${String(f.width).padStart(5)}x${String(f.height).padEnd(5)} ${f.title}  — ${f.author}`,
      );
    }
    return;
  }

  const sb = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  );
  const { data: city } = await sb
    .from('cities')
    .select('id, name, state, lat, lng')
    .eq('slug', slug)
    .maybeSingle();
  if (!city) throw new Error(`No city with slug "${slug}"`);
  const { CITY_SCOPE } = await import('../../apps/web/lib/poi/entity-scope.js');
  const { fetchPhotosForPoi } = await import('../../apps/web/lib/poi/poi-actions-core.js');

  /** Link a place to the city. 'approved': a person chose it, so the plan may use it. */
  const linkPlace = async (poiId: string, distanceM: number | null) => {
    const { error } = await sb.from('city_pois').upsert(
      {
        city_id: city.id,
        poi_id: poiId,
        intent_bucket: bucket,
        status: 'approved',
        distance_m: distanceM,
      },
      { onConflict: 'city_id,poi_id', ignoreDuplicates: true },
    );
    if (error) throw new Error(`could not link the place: ${error.message}`);
  };

  if (command === 'topup') {
    const { data: links } = await sb
      .from('city_pois')
      .select('poi_id, pois!inner(display_name, google_place_id)')
      .eq('city_id', city.id)
      .neq('status', 'rejected');
    for (const link of links ?? []) {
      const poi = link.pois as unknown as { display_name: string; google_place_id: string };
      // Synthetic places (Commons labels) have no Google photos to fetch.
      if (poi.google_place_id.startsWith('percho:')) continue;
      const r = await fetchPhotosForPoi(CITY_SCOPE, city.id, link.poi_id, {
        max,
        actor: 'service',
        topUp: true,
      });
      console.log(
        `${poi.display_name}: +${r.fetched} new, ${r.reused} held${r.skipped ? `, ${r.skipped} skipped (${(r.skippedReasons ?? []).join('; ')})` : ''}`,
      );
    }
    return;
  }

  if (command === 'place') {
    const query = rest.join(' ');
    if (!query) throw new Error('place needs a text query');
    if (city.lat == null || city.lng == null) throw new Error(`${city.name} has no lat/lng`);
    const { searchText } = await import('../../apps/web/lib/poi/google-places.js');
    const { haversineMeters } = await import('../../apps/web/lib/geo/distance.js');
    const center = { lat: Number(city.lat), lng: Number(city.lng) };
    const [place] = await searchText(`${query}, ${city.name}, ${city.state}`, {
      center,
      radiusMeters: 10_000,
    });
    if (!place) throw new Error(`Places found nothing for "${query}"`);
    const distanceM = place.location
      ? Math.round(
          haversineMeters(center, { lat: place.location.latitude, lng: place.location.longitude }),
        )
      : null;
    // The search is only BIASED to the city; a name that exists elsewhere
    // comes back from elsewhere.
    if (distanceM != null && distanceM > 15_000) {
      throw new Error(
        `"${place.displayName.text}" is ${(distanceM / 1609).toFixed(0)} mi from ${city.name} — not this city's`,
      );
    }
    const { data: poi, error } = await sb
      .from('pois')
      .upsert(
        {
          google_place_id: place.id,
          display_name: place.displayName.text,
          formatted_address: place.formattedAddress ?? null,
          primary_type: place.primaryType ?? null,
          types: place.types ?? null,
          rating: place.rating ?? null,
          user_ratings_total: place.userRatingCount ?? null,
          raw_place: JSON.parse(JSON.stringify(place)),
          location: place.location
            ? `(${place.location.longitude},${place.location.latitude})`
            : null,
          refreshed_at: new Date().toISOString(),
        },
        { onConflict: 'google_place_id' },
      )
      .select('id')
      .single();
    if (error || !poi) throw new Error(`poi upsert failed: ${error?.message}`);
    await linkPlace(poi.id, distanceM);
    const r = await fetchPhotosForPoi(CITY_SCOPE, city.id, poi.id, {
      max,
      actor: 'service',
      topUp: true,
    });
    console.log(
      `${place.displayName.text} (${place.formattedAddress ?? '?'}): ${place.photos?.length ?? 0} on Google, +${r.fetched} new, ${r.reused} held`,
    );
    return;
  }

  if (command === 'commons') {
    const [label, ...titles] = rest;
    if (!label || titles.length === 0) throw new Error('commons needs a label and file titles');
    const { imageSizeOf } = await import('../../apps/web/lib/poi/image-size.js');
    const files = await commonsFiles(commonsTitlesUrl(titles));
    const missing = titles.filter((t) => !files.some((f) => f.title === t));
    if (missing.length) throw new Error(`not on Commons: ${missing.join(', ')}`);

    const placeId = `percho:city:${city.id}:${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const { data: poi, error } = await sb
      .from('pois')
      .upsert(
        {
          google_place_id: placeId,
          display_name: label,
          formatted_address: `${city.name}, ${city.state}`,
          primary_type: 'city_view',
          types: ['city_view'],
        },
        { onConflict: 'google_place_id' },
      )
      .select('id')
      .single();
    if (error || !poi) throw new Error(`poi upsert failed: ${error?.message}`);
    await linkPlace(poi.id, 0);

    for (const f of files) {
      if (!commonsLicenceOk(f.licence)) {
        console.log(`REFUSED ${f.title} — ${f.licence || 'no licence'} is not one a film may use`);
        continue;
      }
      const res = await fetch(f.downloadUrl, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) {
        console.log(`FAILED  ${f.title} — download answered ${res.status}`);
        continue;
      }
      const bytes = Buffer.from(await res.arrayBuffer());
      const contentHash = createHash('sha256').update(bytes).digest('hex');
      const { data: held } = await sb
        .from('poi_photos')
        .select('id')
        .eq('poi_id', poi.id)
        .eq('content_hash', contentHash)
        .maybeSingle();
      let photoId = held?.id as string | undefined;
      if (!photoId) {
        const ext = /\.png$/i.test(f.title) ? '.png' : '.jpg';
        const storagePath = `poi/${poi.id}/${contentHash.slice(0, 32)}${ext}`;
        const { error: upErr } = await sb.storage.from(PHOTO_BUCKET).upload(storagePath, bytes, {
          contentType: res.headers.get('content-type') ?? 'image/jpeg',
          upsert: true,
        });
        if (upErr) {
          console.log(`FAILED  ${f.title} — upload: ${upErr.message}`);
          continue;
        }
        const size = imageSizeOf(bytes);
        const { data: row, error: rowErr } = await sb
          .from('poi_photos')
          .insert({
            poi_id: poi.id,
            source: 'wikimedia_commons',
            storage_path: storagePath,
            content_hash: contentHash,
            width_px: size?.width ?? null,
            height_px: size?.height ?? null,
            bytes: bytes.length,
            // What a CC BY credit needs: who, which licence, and the file's page.
            attribution: {
              commons_title: f.title,
              author: f.author,
              licence: f.licence,
              source_page: f.pageUrl,
            },
            status: 'pending',
            enhanced_status: 'queued',
          })
          .select('id')
          .single();
        if (rowErr || !row) {
          console.log(`FAILED  ${f.title} — insert: ${rowErr?.message}`);
          continue;
        }
        photoId = row.id as string;
      }
      await sb
        .from('city_poi_photos')
        .upsert(
          { city_id: city.id, poi_photo_id: photoId, status: 'pending' },
          { onConflict: 'city_id,poi_photo_id', ignoreDuplicates: true },
        );
      console.log(
        `${held ? 'held   ' : 'added  '} ${photoId.slice(0, 8)} ${f.title} — ${f.author}, ${f.licence}`,
      );
    }
    return;
  }

  throw new Error(`unknown command "${command}"`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
