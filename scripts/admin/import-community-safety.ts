/**
 * Looks up the facts behind a community page's safety block and writes them to
 * `scripts/admin/data/community-safety.json`, which
 * `upsert-community-profile.ts` reads.
 *
 * Facts about the PLACE, and nothing else (owner 2026-11-22; the rule is in
 * `packages/shared/src/community-profile.ts`):
 *
 *   · the closest hospital that takes emergencies and the closest fire
 *     station OpenStreetMap knows of, straight-line from the community's
 *     point;
 *   · FEMA's flood zone at that point, from the National Flood Hazard Layer.
 *
 * No crime source is read here and none should be added.
 *
 * Both services are free and keyless: one OpenStreetMap request for the whole
 * batch, one FEMA request per community. This is for the communities named on
 * the command line (the ones with a film), not a crawl of all 22,730.
 *
 *   pnpm --filter @percho/web community:safety sawnee-village windward
 *
 * Re-running a slug replaces its entry. Then rebuild those profiles:
 *   pnpm --filter @percho/web community:profile sawnee-village windward --apply
 *
 * `--cities` does the same for every active city (phase371) and writes
 * `apps/web/lib/cities/city-safety.json`, which the city page reads directly:
 * the hospital and the fire station closest to the city's centre, each named
 * with its distance, as a community's are (it counted the stations within
 * five miles until the owner asked for the row to read like the others,
 * 2026-11-22). No flood zone — FEMA's is read at a point, and one
 * point says nothing about a city.
 *   pnpm --filter @percho/web community:safety --cities
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { type SafetyFacts, milesBetween } from '../../apps/web/lib/communities/profile-build.js';

const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, 'data/community-safety.json');
const CITY_FILE = join(here, '../../apps/web/lib/cities/city-safety.json');
const CITIES = process.argv.includes('--cities');
const SLUGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const AGENT = 'percho-admin/1.0 (hello@percho.co)';
/** Metres. A hospital further than this is not this community's hospital. */
const HOSPITAL_M = 30_000;
const FIRE_M = 15_000;

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Stored {
  asOf: string;
  communities: Record<string, SafetyFacts>;
}

async function flood(lat: number, lng: number): Promise<SafetyFacts['flood']> {
  const url = new URL(
    'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query',
  );
  url.search = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'FLD_ZONE,ZONE_SUBTY,SFHA_TF',
    returnGeometry: 'false',
    f: 'json',
  }).toString();
  // FEMA's server drops a connection now and then; the same request a few
  // seconds later goes through.
  let res: Response | undefined;
  for (let attempt = 0; attempt < 5 && !res?.ok; attempt++) {
    if (attempt > 0) await pause(3000 * attempt);
    res = await fetch(url, { headers: { 'User-Agent': AGENT } }).catch(() => undefined);
  }
  if (!res?.ok) throw new Error(`FEMA ${res?.status ?? 'unreachable'}`);
  const body = (await res.json()) as {
    features?: Array<{ attributes: { FLD_ZONE?: string; ZONE_SUBTY?: string; SFHA_TF?: string } }>;
  };
  const a = body.features?.[0]?.attributes;
  if (!a?.FLD_ZONE) return undefined;
  return { zone: a.FLD_ZONE, subtype: a.ZONE_SUBTY ?? '', sfha: a.SFHA_TF === 'T' };
}

interface Place {
  name: string;
  lat: number;
  lng: number;
}

/**
 * A hospital an ambulance would go to. OSM marks an emergency room with
 * `emergency=yes`, but not on every hospital that has one — Northside Hospital
 * Duluth carries no such tag — so an untagged general hospital counts too, and
 * a rehabilitation, psychiatric or day-surgery place does not.
 */
function takesEmergencies(tags: Record<string, string | undefined>): boolean {
  if (tags.emergency === 'yes') return true;
  if (tags.emergency !== undefined) return false;
  return (
    tags.healthcare === 'hospital' &&
    tags['healthcare:speciality'] === undefined &&
    !/surgery cent|rehab|behaviou?ral|psychiatr|treatment/i.test(tags.name ?? '')
  );
}

/**
 * Every hospital and fire station around the communities asked for, in ONE
 * request. The public Overpass instances throttle hard — a request per
 * community took three minutes each — and the answer for a metro is small.
 */
async function places(
  points: ReadonlyArray<{ lat: number; lng: number }>,
): Promise<{ hospitals: Place[]; fire: Place[] }> {
  // The box around every point, widened by the furthest a hospital may be.
  const dLat = HOSPITAL_M / 111_000;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const dLng = dLat / Math.cos((Math.max(...lats) * Math.PI) / 180);
  const box = [
    Math.min(...lats) - dLat,
    Math.min(...lngs) - dLng,
    Math.max(...lats) + dLat,
    Math.max(...lngs) + dLng,
  ]
    .map((n) => n.toFixed(4))
    .join(',');
  const query = `[out:json][timeout:90];(nwr["amenity"="hospital"](${box});nwr["amenity"="fire_station"](${box}););out center tags;`;
  // The instances shed load with a 429 / 502 / 504; the next one, or the same
  // one a few seconds later, answers.
  let res: Response | undefined;
  for (let attempt = 0; attempt < 6 && !res?.ok; attempt++) {
    if (attempt > 0) await pause(4000 * attempt);
    res = await fetch(`${OVERPASS[attempt % OVERPASS.length]}?data=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': AGENT },
    }).catch(() => undefined);
  }
  if (!res?.ok) throw new Error(`Overpass ${res?.status ?? 'unreachable'}`);
  const body = (await res.json()) as {
    elements: Array<{
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string | undefined>;
    }>;
  };
  const out: { hospitals: Place[]; fire: Place[] } = { hospitals: [], fire: [] };
  for (const e of body.elements) {
    const at =
      e.center ?? (e.lat !== undefined && e.lon !== undefined ? { lat: e.lat, lon: e.lon } : null);
    const name = e.tags?.name?.trim();
    if (!at || !name || !e.tags) continue;
    const place = { name, lat: at.lat, lng: at.lon };
    if (e.tags.amenity === 'fire_station') out.fire.push(place);
    else if (takesEmergencies(e.tags)) out.hospitals.push(place);
  }
  return out;
}

function closest(
  lat: number,
  lng: number,
  among: readonly Place[],
  withinM: number,
): { name: string; miles: number } | undefined {
  let best: { name: string; miles: number } | undefined;
  for (const p of among) {
    const miles = milesBetween(lat, lng, p.lat, p.lng);
    if (miles * 1609.34 > withinM) continue;
    if (!best || miles < best.miles) best = { name: p.name, miles: Math.round(miles * 10) / 10 };
  }
  return best;
}

/** Written after every community, so a run that dies keeps what it found. */
function save(stored: Stored) {
  stored.asOf = new Date().toISOString().slice(0, 10);
  // Slugs in order, so a re-run's diff is the entries that changed.
  stored.communities = Object.fromEntries(
    Object.entries(stored.communities).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(FILE, `${JSON.stringify(stored, null, 2)}\n`);
}

async function main() {
  if (SLUGS.length === 0 && !CITIES) {
    console.error('Usage: community:safety <slug> [<slug> …] | --cities');
    process.exit(1);
  }
  const envPath = new URL('../../.env.local', import.meta.url);
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m?.[1] && m[2] !== undefined && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.');
    process.exit(1);
  }
  const sb = createClient(url, serviceKey);
  if (CITIES) {
    const { data: rows, error: cityError } = await sb
      .from('cities')
      .select('slug, lat, lng')
      .eq('status', 'active');
    if (cityError) throw new Error(`read failed: ${JSON.stringify(cityError)}`);
    const cities = (rows ?? []).flatMap((c) =>
      typeof c.lat === 'number' && typeof c.lng === 'number'
        ? [{ slug: c.slug as string, lat: c.lat, lng: c.lng }]
        : [],
    );
    const around = await places(cities);
    const out: Record<
      string,
      { hospital?: { name: string; miles: number }; fire?: { name: string; miles: number } }
    > = {};
    for (const c of cities.sort((a, b) => a.slug.localeCompare(b.slug))) {
      const hospital = closest(c.lat, c.lng, around.hospitals, HOSPITAL_M);
      const fire = closest(c.lat, c.lng, around.fire, FIRE_M);
      out[c.slug] = { ...(hospital ? { hospital } : {}), ...(fire ? { fire } : {}) };
      console.log(
        `  ${c.slug}: ${hospital ? `${hospital.name} ${hospital.miles} mi` : 'no hospital'} · ${fire ? `${fire.name} ${fire.miles} mi` : 'no fire station'}`,
      );
    }
    writeFileSync(
      CITY_FILE,
      `${JSON.stringify({ asOf: new Date().toISOString().slice(0, 10), cities: out }, null, 2)}\n`,
    );
    console.log(`Wrote ${Object.keys(out).length} cities to ${CITY_FILE}`);
    return;
  }
  const { data, error } = await sb.from('communities').select('slug, lat, lng').in('slug', SLUGS);
  if (error) throw new Error(`read failed: ${JSON.stringify(error)}`);

  const stored: Stored = existsSync(FILE)
    ? (JSON.parse(readFileSync(FILE, 'utf8')) as Stored)
    : { asOf: '', communities: {} };
  const found = SLUGS.flatMap((slug) => {
    const c = data?.find((r) => r.slug === slug);
    if (!c || typeof c.lat !== 'number' || typeof c.lng !== 'number') {
      console.warn(`  ${slug}: no such community, or it has no point — skipped`);
      return [];
    }
    return [{ slug, lat: c.lat as number, lng: c.lng as number }];
  });
  if (found.length === 0) return;
  const around = await places(found);
  console.log(
    `  ${around.hospitals.length} hospitals, ${around.fire.length} fire stations in reach`,
  );
  for (const c of found) {
    const zone = await flood(c.lat, c.lng);
    const hospital = closest(c.lat, c.lng, around.hospitals, HOSPITAL_M);
    const fire = closest(c.lat, c.lng, around.fire, FIRE_M);
    const facts: SafetyFacts = {
      ...(hospital ? { hospital } : {}),
      ...(fire ? { fire } : {}),
      ...(zone ? { flood: zone } : {}),
    };
    stored.communities[c.slug] = facts;
    console.log(
      `  ${c.slug}: ${hospital ? `${hospital.name} ${hospital.miles} mi` : 'no hospital'} · ${fire ? `${fire.name} ${fire.miles} mi` : 'no fire station'} · ${zone ? `zone ${zone.zone} (${zone.subtype || '—'})` : 'no flood zone'}`,
    );
    save(stored);
    await pause(500);
  }
  console.log(`Wrote ${Object.keys(stored.communities).length} communities to ${FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
