/**
 * Re-run community matching over every listing that has a lat/lng.
 *
 * Until phase189 the matcher only ran when an agent saved an address in the
 * dashboard, and it only saw the first 1,000 of 8,679 communities — so most
 * listings never got a community_id. This calls `match_community(lat, lng)`
 * (containing polygon, subdivision first; else nearest) for each listing and
 * writes community_id + community_match + community_distance_m.
 *
 * Listings whose community_match is 'manual' (the agent picked from the
 * dropdown) are reported but never overwritten.
 *
 * Run it again whenever communities change shape — a subdivision import, a
 * merge — so listings move to the more specific polygon.
 *
 * Usage (repo-root .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY):
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/relink-listings.ts
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/relink-listings.ts --apply
 *
 * DRY RUN BY DEFAULT. Nothing is written without --apply.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');

function envPath(): string {
  const explicit = process.env.PERCHO_ENV_FILE;
  if (explicit) return explicit;
  for (const c of [
    new URL('../../.env.local', import.meta.url).pathname,
    `${process.env.HOME}/Workspace/Percho/.env.local`,
  ]) {
    if (existsSync(c)) return c;
  }
  throw new Error('no .env.local found; set PERCHO_ENV_FILE');
}

const env = Object.fromEntries(
  readFileSync(envPath(), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [
        l.slice(0, i).trim(),
        l
          .slice(i + 1)
          .trim()
          .replace(/^["']|["']$/g, ''),
      ];
    }),
);

// biome-ignore lint/suspicious/noExplicitAny: an admin script, not app code.
const sb: any = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

type Listing = {
  id: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  community_id: string | null;
  community_match: string | null;
};

async function main() {
  const { data: listings, error } = await sb
    .from('listings')
    .select('id, address, city, lat, lng, community_id, community_match')
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .order('city')
    .range(0, 9999);
  if (error) throw new Error(error.message);

  const names = new Map<string, string>();
  const nameOf = async (id: string | null) => {
    if (!id) return '—';
    if (!names.has(id)) {
      const { data } = await sb.from('communities').select('slug').eq('id', id).maybeSingle();
      names.set(id, data?.slug ?? id);
    }
    return names.get(id)!;
  };

  let changed = 0;
  let manual = 0;
  let nearest = 0;
  for (const l of listings as Listing[]) {
    const { data, error } = await sb.rpc('match_community', { p_lat: l.lat, p_lng: l.lng });
    if (error) throw new Error(`match_community: ${error.message}`);
    const m = data?.[0];
    const before = await nameOf(l.community_id);
    const label = `${l.address}, ${l.city}`.padEnd(48);
    if (!m) {
      console.log(`${label} ${before} → (no community at all)`);
      continue;
    }
    const after = `${m.slug} [${m.match}${m.match === 'nearest' ? ` ${m.distance_m} m` : ''}]`;
    if (m.match === 'nearest') nearest++;
    if (l.community_match === 'manual') {
      manual++;
      console.log(`${label} ${before} (manual, kept) — matcher says ${after}`);
      continue;
    }
    const same = l.community_id === m.community_id && l.community_match === m.match;
    console.log(`${label} ${before} → ${after}${same ? ' (unchanged)' : ''}`);
    if (same) continue;
    changed++;
    if (!APPLY) continue;
    const { error: upErr } = await sb
      .from('listings')
      .update({
        community_id: m.community_id,
        community_match: m.match,
        community_distance_m: m.distance_m,
      })
      .eq('id', l.id);
    if (upErr) throw new Error(`update ${l.id}: ${upErr.message}`);
  }

  console.log(
    `\n${listings.length} listings with coordinates · ${changed} ${APPLY ? 'updated' : 'would change'} · ` +
      `${nearest} on the nearest-community fallback · ${manual} manual picks kept`,
  );
  if (!APPLY) console.log('--- dry run, nothing written ---');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
