/**
 * Measures the drive from a community to the nearest highway on-ramp and
 * writes it to `scripts/admin/data/community-highway.json`, which
 * `upsert-community-profile.ts` turns into the profile's `highway` block —
 * the third figure over a community's feed card ("6 min · to I-85").
 *
 * Why this and not the distance to Atlanta (owner 2026-11-27): the city's
 * card has already said how far out the city is, and inside one city the
 * straight-line distance is the same on every community (Suwanee: 27 / 27 /
 * 28 mi). 「不清楚这个的价值」. The minutes to the highway are what a buyer here
 * asks of a subdivision, and they differ: Suwanee's three are 6, 16 and 18.
 * He turned down the lot size (「地方面积不好再想」) and took this: 「好就写上高速
 * 时长」.
 *
 * Two free, keyless services, both OpenStreetMap's data:
 *
 *   · Overpass — where the on-ramps join. An on-ramp is a `motorway_link` way
 *     whose LAST node is on a motorway; that node is where a driver is on the
 *     highway. (A `motorway_junction` node is the opposite — where an
 *     off-ramp leaves — and to reach one you must already have joined an exit
 *     earlier: it read Sawnee Village, 0.6 mi from GA-400, as 6 minutes.)
 *     Interstates, GA-400 and GA-316 count; a short freeway stretch of a
 *     state route (GA-141) is not "the highway" to anyone.
 *   · OSRM's public demo server — the drive, one table request per community
 *     to the `CANDIDATES` nearest on-ramps by straight line, the quickest
 *     kept. Free-flow time: no traffic, and the block says so. The server is
 *     for light use; this is one request per community named, run by hand —
 *     never call it from the app.
 *
 *   pnpm --filter @percho/web community:highway edinburgh windward
 *
 * Re-running a slug replaces its entry. Then rebuild those profiles:
 *   pnpm --filter @percho/web community:profile edinburgh windward --apply
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { type HighwayFacts, milesBetween } from '../../apps/web/lib/communities/profile-build.js';

const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, 'data/community-highway.json');
const SLUGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const AGENT = 'percho-admin/1.0 (hello@percho.co)';
/** Degrees around the communities to look for on-ramps in — some 17 miles. */
const MARGIN = 0.25;
/** On-ramps routed per community: the nearest by straight line is often not the quickest. */
const CANDIDATES = 30;
const METRES_A_MILE = 1609.344;

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Stored {
  asOf: string;
  communities: Record<string, HighwayFacts>;
}

interface Way {
  nodes: number[];
  tags?: Record<string, string | undefined>;
  geometry?: Array<{ lat: number; lon: number }>;
}

interface Ramp {
  lat: number;
  lng: number;
  /** "I-85" */
  road: string;
}

/** "I 985;US 23" → "I-985"; "US 19;GA 400" → "GA-400"; a road that is neither → null. */
function roadName(ref: string): string | null {
  const interstate = /\bI (\d+)\b/.exec(ref);
  if (interstate) return `I-${interstate[1]}`;
  const state = /\bGA (400|316)\b/.exec(ref);
  return state ? `GA-${state[1]}` : null;
}

/** One Overpass request; the instances shed load, and the next one answers. */
async function overpass(query: string): Promise<Way[]> {
  let res: Response | undefined;
  for (let attempt = 0; attempt < 6 && !res?.ok; attempt++) {
    if (attempt > 0) await pause(4000 * attempt);
    res = await fetch(OVERPASS[attempt % OVERPASS.length] as string, {
      method: 'POST',
      headers: { 'User-Agent': AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: query }),
    }).catch(() => undefined);
  }
  if (!res?.ok) throw new Error(`Overpass ${res?.status ?? 'unreachable'}`);
  return ((await res.json()) as { elements: Way[] }).elements;
}

/** Every point in the box where an on-ramp joins a highway. */
async function onRamps(box: { s: number; w: number; n: number; e: number }): Promise<Ramp[]> {
  const at = `(${box.s},${box.w},${box.n},${box.e})`;
  const ways = await overpass(
    `[out:json][timeout:120];way["highway"="motorway"]["ref"]${at};out body;way["highway"="motorway_link"]${at};out geom;`,
  );
  const roadOf = new Map<number, string>();
  for (const w of ways) {
    if (w.tags?.highway !== 'motorway') continue;
    const road = roadName(w.tags.ref ?? '');
    if (road) for (const n of w.nodes) roadOf.set(n, road);
  }
  const ramps: Ramp[] = [];
  for (const w of ways) {
    if (w.tags?.highway !== 'motorway_link') continue;
    const road = roadOf.get(w.nodes[w.nodes.length - 1] ?? -1);
    const end = w.geometry?.[w.geometry.length - 1];
    if (road && end) ramps.push({ lat: end.lat, lng: end.lon, road });
  }
  return ramps;
}

/** Minutes and miles of driving from a point to each ramp, as OSRM routes them. */
async function drives(
  from: { lat: number; lng: number },
  ramps: readonly Ramp[],
): Promise<Array<{ minutes: number; miles: number }>> {
  const points = [from, ...ramps].map((p) => `${p.lng},${p.lat}`).join(';');
  const res = await fetch(
    `https://router.project-osrm.org/table/v1/driving/${points}?sources=0&annotations=duration,distance`,
    { headers: { 'User-Agent': AGENT } },
  );
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const body = (await res.json()) as {
    durations?: Array<Array<number | null>>;
    distances?: Array<Array<number | null>>;
  };
  const seconds = body.durations?.[0] ?? [];
  const metres = body.distances?.[0] ?? [];
  // Column 0 is the community itself.
  return ramps.map((_, i) => ({
    minutes: (seconds[i + 1] ?? Number.POSITIVE_INFINITY) / 60,
    miles: (metres[i + 1] ?? Number.POSITIVE_INFINITY) / METRES_A_MILE,
  }));
}

async function main() {
  if (SLUGS.length === 0) {
    console.error('Usage: community:highway <slug> [<slug> …]');
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
  const { data, error } = await sb.from('communities').select('slug, lat, lng').in('slug', SLUGS);
  if (error) throw new Error(`read failed: ${JSON.stringify(error)}`);

  const found = SLUGS.flatMap((slug) => {
    const c = data?.find((r) => r.slug === slug);
    if (!c || typeof c.lat !== 'number' || typeof c.lng !== 'number') {
      console.warn(`  ${slug}: no such community, or it has no point — skipped`);
      return [];
    }
    return [{ slug, lat: c.lat as number, lng: c.lng as number }];
  });
  if (found.length === 0) return;

  const ramps = await onRamps({
    s: Math.min(...found.map((c) => c.lat)) - MARGIN,
    w: Math.min(...found.map((c) => c.lng)) - MARGIN,
    n: Math.max(...found.map((c) => c.lat)) + MARGIN,
    e: Math.max(...found.map((c) => c.lng)) + MARGIN,
  });
  console.log(`${ramps.length} on-ramps around ${found.length} communities`);

  const stored: Stored = existsSync(FILE)
    ? (JSON.parse(readFileSync(FILE, 'utf8')) as Stored)
    : { asOf: '', communities: {} };

  for (const c of found) {
    const near = ramps
      .map((r) => ({ ramp: r, straight: milesBetween(c.lat, c.lng, r.lat, r.lng) }))
      .sort((a, b) => a.straight - b.straight)
      .slice(0, CANDIDATES)
      .map((n) => n.ramp);
    const routed = await drives(c, near);
    let best = -1;
    routed.forEach((d, i) => {
      if (d.minutes < (routed[best]?.minutes ?? Number.POSITIVE_INFINITY)) best = i;
    });
    const drive = routed[best];
    const ramp = near[best];
    delete stored.communities[c.slug];
    if (!drive || !ramp) {
      console.warn(`  ${c.slug}: no on-ramp could be routed to — left out`);
      continue;
    }
    const facts: HighwayFacts = {
      road: ramp.road,
      minutes: Math.round(drive.minutes * 10) / 10,
      miles: Math.round(drive.miles * 10) / 10,
    };
    stored.communities[c.slug] = facts;
    console.log(`  ${c.slug}: ${facts.minutes} min, ${facts.miles} mi to ${facts.road}`);
    await pause(1100);
  }

  stored.asOf = new Date().toISOString().slice(0, 10);
  stored.communities = Object.fromEntries(
    Object.entries(stored.communities).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(FILE, `${JSON.stringify(stored, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(stored.communities).length} communities to ${FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
