/**
 * Fill `listings.lat/lng` where they are null, from the US Census Bureau
 * geocoder (free, no key). Phase D: the six FMLS-imported listings had no
 * coordinates, and the schools block (`get_k12_nearest_schools`) and the
 * Search tab's map both need one.
 *
 * Only rows with BOTH lat and lng null are touched; nothing is overwritten.
 * A non-match is reported and skipped.
 *
 * Usage (from apps/web, with NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env):
 *   pnpm exec tsx ../../scripts/admin/geocode-listings.ts [--apply]
 * DRY RUN BY DEFAULT.
 */
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');

async function geocode(oneLine: string): Promise<{ lat: number; lng: number } | null> {
  const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
  url.searchParams.set('address', oneLine);
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('format', 'json');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`census geocoder ${res.status}`);
  const body = (await res.json()) as {
    result?: { addressMatches?: { coordinates?: { x: number; y: number } }[] };
  };
  const c = body.result?.addressMatches?.[0]?.coordinates;
  return c && Number.isFinite(c.x) && Number.isFinite(c.y) ? { lat: c.y, lng: c.x } : null;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await sb
    .from('listings')
    .select('id, address, city, state, zip')
    .is('lat', null)
    .is('lng', null);
  if (error) throw new Error(error.message);
  console.log(`${data?.length ?? 0} listings without coordinates`);

  for (const row of data ?? []) {
    const line = `${row.address}, ${row.city}, ${row.state ?? 'GA'} ${row.zip ?? ''}`.trim();
    const hit = await geocode(line);
    if (!hit) {
      console.log(`  no match: ${line}`);
      continue;
    }
    console.log(`  ${line} → ${hit.lat.toFixed(6)}, ${hit.lng.toFixed(6)}`);
    if (!APPLY) continue;
    const { error: e } = await sb.from('listings').update(hit).eq('id', row.id);
    if (e) throw new Error(`update ${row.id}: ${e.message}`);
  }
  if (!APPLY) console.log('dry run — pass --apply to write');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
