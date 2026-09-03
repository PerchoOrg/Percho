/**
 * Import one Redfin listing detail page as a Percho listing.
 *
 * Written for 2090 Lake Windward Dr, Alpharetta (2026-09-03). Sibling of
 * `import-jw-listing.ts`, which does the same job for a John Wieland quick
 * move-in page; the two share nothing but the shape, because the pages have
 * nothing in common.
 *
 * Where the data comes from — Redfin server-renders its own API responses into
 * `root.__reactServerState.InitialContext`, keyed by API path. Each entry's
 * `res.text` is the raw body, prefixed with `{}&&` (Redfin's JSON-hijacking
 * guard). We read four of them:
 *   - `aboveTheFold`          → price, beds, baths, sqft, lat/lng, lot size,
 *                               year built, and the media browser's photo list
 *   - `mainHouseInfoPanelInfo`→ MLS #, listing agent + brokerage, and the
 *                               `selectedAmenities` tiles (Style, HOA Dues,
 *                               Community)
 *   - `belowTheFold`          → the full MLS amenity groups (unused today,
 *                               parsed only for the HOA fee fallback)
 *   - `photoTagsAndCaptions`  → Redfin's per-photo captions, used as alt text
 * The `<script type="application/ld+json">` block carries the marketing
 * remarks and is the only place the description is not HTML-escaped twice.
 *
 * PHOTOS — a Redfin gallery is not always one photo set. Listing agents append
 * batches over the listing's life, and each batch gets its own version letter
 * in the file name (`7754807_12_U.jpg`). For 2090 Lake Windward the leading 35
 * `_U` photos are the house; the 44 that follow are the agent's community
 * marketing shots (Windward lake, marina, golf course, Avalon). So: import the
 * leading run of photos that share the primary photo's version letter, and
 * print the rest so a human can see exactly what was left behind. On an
 * ordinary single-batch listing that rule imports everything.
 *
 * Listing shape: agent-owned (`agent_id` set, `source` NULL) — the schema's
 * `listings_agent_or_external_chk` allows one or the other. Provenance (the
 * MLS number and the listing brokerage) lives in this header and the DEVLOG,
 * not in a column; there is nowhere to put it on an agent-owned row.
 *
 * Usage (repo-root .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY):
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/import-redfin-listing.ts <url> --agent <slug>
 *   …                                                                              <url> --agent <slug> --apply
 *
 * DRY RUN BY DEFAULT. Nothing is written without --apply.
 *
 * Re-running with --apply is safe: the listing is matched by (agent, address)
 * and updated in place, and a photo is uploaded only for a gallery position
 * that has no row yet.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { pointInPolygon } from '../../apps/web/lib/geo/point-in-polygon.js';
import { imageSizeOf } from '../../apps/web/lib/poi/image-size.js';
import {
  LISTING_PHOTOS_BUCKET,
  nextPhotoStoragePath,
  photoPublicUrl,
} from '../../apps/web/lib/supabase/storage.js';
import { nextCandidate, slugify } from '../../apps/web/lib/utils/slug.js';

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith('http'));
const agentSlug = args[args.indexOf('--agent') + 1];
const APPLY = args.includes('--apply');
if (!url || !agentSlug || agentSlug.startsWith('--')) {
  console.error(
    'usage: import-redfin-listing <redfin-url> --agent <agent-slug> [--apply] [--status active|inactive]',
  );
  process.exit(1);
}
const STATUS = args.includes('--status') ? args[args.indexOf('--status') + 1] : 'inactive';
if (STATUS !== 'active' && STATUS !== 'inactive') {
  console.error(`--status must be active or inactive, got ${STATUS}`);
  process.exit(1);
}

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
// `photoPublicUrl` reads this to build cover_url; the script has no Next runtime.
process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;

// biome-ignore lint/suspicious/noExplicitAny: an admin script, not app code.
const sb: any = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&rsquo;/g, '’')
    .replace(/&mdash;/g, '—')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/** The JSON object starting at `from`, found by balancing braces. */
function jsonAt(html: string, from: number): unknown {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(html.slice(from, i + 1));
  }
  throw new Error('unbalanced JSON');
}

/** Street suffixes and directionals, as Redfin abbreviates them. */
const SUFFIXES: Record<string, string> = {
  Ave: 'Avenue',
  Blvd: 'Boulevard',
  Cir: 'Circle',
  Ct: 'Court',
  Dr: 'Drive',
  Ln: 'Lane',
  Pkwy: 'Parkway',
  Pl: 'Place',
  Rd: 'Road',
  Sq: 'Square',
  St: 'Street',
  Ter: 'Terrace',
  Trl: 'Trail',
};
const DIRECTIONALS: Record<string, string> = {
  N: 'North',
  S: 'South',
  E: 'East',
  W: 'West',
  NE: 'Northeast',
  NW: 'Northwest',
  SE: 'Southeast',
  SW: 'Southwest',
};

interface RedfinPhoto {
  fullScreenPhotoUrl: string;
  fileName: string;
  caption: string;
}

interface Parsed {
  address: string;
  city: string;
  state: string;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  lotSize: string | null;
  hoa: string | null;
  style: string | null;
  neighborhood: string | null;
  mlsId: string | null;
  listingAgent: string | null;
  brokerage: string | null;
  description: string[];
  photos: RedfinPhoto[];
  skipped: RedfinPhoto[];
}

// biome-ignore lint/suspicious/noExplicitAny: Redfin's payloads, not our types.
type Any = any;

function parse(html: string): Parsed {
  const marker = 'reactServerState.InitialContext = ';
  const at = html.indexOf(marker);
  if (at < 0) throw new Error('no InitialContext blob — is this a Redfin home detail page?');
  const cache = (jsonAt(html, at + marker.length) as Any)['ReactServerAgent.cache'].dataCache;

  /** One cached API response, by exact path or by prefix. */
  const api = (path: string): Any => {
    const key = Object.keys(cache).find((k) => k === path || k.startsWith(path));
    const text: string | undefined = key ? cache[key]?.res?.text : undefined;
    if (!text) throw new Error(`InitialContext has no response for ${path}`);
    // Redfin prefixes every body with `{}&&` as a JSON-hijacking guard.
    return JSON.parse(text.slice(text.indexOf('&&') + 2)).payload;
  };

  const atf = api('/stingray/api/home/details/aboveTheFold');
  const main = api('/stingray/api/home/details/mainHouseInfoPanelInfo').mainHouseInfo;
  const captions = api('/stingray/api/photoTagsAndCaptions/').tagsByPhotoId as Record<string, Any>;
  const addr = atf.addressSectionInfo;
  const street = addr.streetAddress;

  const tile = (header: string): string | null =>
    (main.selectedAmenities as Any[]).find((a) => a.header === header)?.content ?? null;

  // The ld+json block is the only copy of the remarks that is escaped once.
  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
    .map((m) => {
      try {
        return JSON.parse(m[1]!) as Any;
      } catch {
        return null;
      }
    })
    .find((d) => d && !Array.isArray(d) && d['@type']?.includes?.('RealEstateListing'));
  const description = decode(String(ld?.description ?? ''))
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const address = [
    street.streetNumber,
    DIRECTIONALS[street.directionalPrefix] ?? street.directionalPrefix,
    street.streetName,
    SUFFIXES[street.streetType] ?? street.streetType,
    DIRECTIONALS[street.directionalSuffix] ?? street.directionalSuffix,
    street.unitValue ? `#${street.unitValue}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Gallery batches: keep the leading run sharing the primary's version letter.
  const all: Any[] = atf.mediaBrowserInfo?.photos ?? [];
  const version = (fileName: string): string =>
    fileName
      .replace(/\.[a-z]+$/i, '')
      .split('_')
      .pop()!;
  const primary = all[0] ? version(all[0].fileName) : '';
  const cut = all.findIndex((p) => version(p.fileName) !== primary);
  const toPhoto = (p: Any): RedfinPhoto => ({
    fullScreenPhotoUrl: p.photoUrls.fullScreenPhotoUrl,
    fileName: p.fileName,
    caption: decode(String(captions[String(p.photoId)]?.shortCaption ?? '')),
  });

  const acres = typeof addr.lotSize === 'number' ? addr.lotSize / 43_560 : null;

  return {
    address,
    city: String(addr.city ?? ''),
    state: String(addr.state ?? ''),
    zip: addr.zip ? String(addr.zip) : null,
    lat: addr.latLong?.latitude ?? null,
    lng: addr.latLong?.longitude ?? null,
    price: addr.priceInfo?.amount ?? null,
    beds: addr.beds ?? null,
    baths: addr.baths ?? null,
    sqft: addr.sqFt?.value ?? null,
    yearBuilt: addr.yearBuilt ?? null,
    lotSize: acres ? `${acres.toFixed(2)} acres` : null,
    // Redfin renders the fee per month; the schema stores the string as shown.
    hoa: tile('HOA Dues')?.replace(/\/mo$/, '/month') ?? null,
    style: tile('Style'),
    // The MLS subdivision, shouted: "WINDWARD".
    neighborhood:
      tile('Community')?.replace(/\S+/g, (w) => w[0] + w.slice(1).toLowerCase()) ?? null,
    mlsId: main.mlsId ? String(main.mlsId) : null,
    listingAgent: main.listingAgents?.[0]?.agentInfo?.agentName ?? null,
    brokerage: main.listingAgents?.[0]?.brokerName ?? null,
    description,
    photos: (cut === -1 ? all : all.slice(0, cut)).map(toPhoto),
    skipped: (cut === -1 ? [] : all.slice(cut)).map(toPhoto),
  };
}

/**
 * The community whose boundary contains the point — the same rule
 * `lib/geo/find-community.ts` applies in the app, run here over the
 * boundaries in the listing's city.
 */
async function findCommunity(
  lat: number,
  lng: number,
  city: string,
): Promise<{ id: string; name: string } | null> {
  const { data } = await sb
    .from('communities')
    .select('id, name, boundary')
    .not('boundary', 'is', null)
    .eq('city', city);
  for (const c of data ?? []) {
    if (pointInPolygon(lng, lat, c.boundary)) return { id: c.id, name: c.name };
  }
  return null;
}

async function main() {
  const res = await fetch(url!, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const parsed = parse(await res.text());

  console.log(`${parsed.address}, ${parsed.city}, ${parsed.state} ${parsed.zip ?? '?'}`);
  console.log(
    `  ${parsed.beds} bed · ${parsed.baths} bath · ${parsed.sqft} sqft · ` +
      `${parsed.style ?? '?'} · built ${parsed.yearBuilt} · ${parsed.lotSize ?? '?'}`,
  );
  console.log(
    `  $${parsed.price?.toLocaleString()} · HOA ${parsed.hoa ?? 'none'} · ` +
      `MLS #${parsed.mlsId} · ${parsed.listingAgent}, ${parsed.brokerage}`,
  );
  console.log(
    `  ${parsed.photos.length} photos of the home, ${parsed.skipped.length} later batches skipped`,
  );

  if (!parsed.address || !parsed.city || parsed.photos.length === 0) {
    throw new Error('page parsed but is missing an address or photos — refusing to write');
  }

  const { data: agent } = await sb
    .from('agents')
    .select('id, name')
    .eq('slug', agentSlug)
    .maybeSingle();
  if (!agent) throw new Error(`no agent with slug "${agentSlug}"`);

  const community =
    parsed.lat && parsed.lng ? await findCommunity(parsed.lat, parsed.lng, parsed.city) : null;
  console.log(`  community: ${community ? community.name : 'no boundary match'}`);

  const fields = {
    address: parsed.address,
    city: parsed.city,
    state: parsed.state,
    zip: parsed.zip,
    lat: parsed.lat,
    lng: parsed.lng,
    price: parsed.price,
    beds: parsed.beds,
    baths: parsed.baths,
    sqft: parsed.sqft,
    year_built: parsed.yearBuilt,
    lot_size: parsed.lotSize,
    hoa: parsed.hoa,
    style: parsed.style,
    neighborhood: parsed.neighborhood,
    community_id: community?.id ?? null,
    description: parsed.description,
  };

  if (!APPLY) {
    console.log('\n--- dry run, nothing written ---');
    console.log(JSON.stringify({ agent: agent.name, status: STATUS, ...fields }, null, 2));
    for (const [i, p] of parsed.photos.entries())
      console.log(`  ${i}. ${p.fileName} — ${p.caption}`);
    for (const p of parsed.skipped) console.log(`  skip ${p.fileName} — ${p.caption}`);
    return;
  }

  const baseSlug = slugify(parsed.address, { fallback: 'listing' });
  const { data: existing } = await sb
    .from('listings')
    .select('id, slug')
    .eq('agent_id', agent.id)
    .eq('address', parsed.address)
    .maybeSingle();

  let listingId: string;
  let slug: string;
  if (existing) {
    await sb.from('listings').update(fields).eq('id', existing.id);
    listingId = existing.id;
    slug = existing.slug;
    console.log(`\nupdated existing listing ${listingId} (${slug})`);
  } else {
    let created: { id: string; slug: string } | null = null;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      const candidate = nextCandidate(baseSlug, attempt);
      const { data, error } = await sb
        .from('listings')
        // Inserted inactive whatever --status says: an active listing with no
        // photos yet is a live page with an empty gallery. Activated below.
        .insert({ agent_id: agent.id, slug: candidate, status: 'inactive', ...fields })
        .select('id, slug')
        .single();
      if (data) created = data;
      else if (error?.code !== '23505') throw new Error(`insert failed: ${error?.message}`);
    }
    if (!created) throw new Error('slug exhaustion');
    listingId = created.id;
    slug = created.slug;
    console.log(`\ncreated listing ${listingId} (${slug})`);
  }

  const { data: have } = await sb
    .from('listing_photos')
    .select('sort_order')
    .eq('listing_id', listingId);
  const taken = new Set<number>((have ?? []).map((r: { sort_order: number }) => r.sort_order));

  let firstPath: string | null = null;
  for (const [i, photo] of parsed.photos.entries()) {
    if (taken.has(i)) {
      console.log(`  ${i}. ${photo.fileName} — already present, skipped`);
      continue;
    }
    const img = await fetch(photo.fullScreenPhotoUrl, { headers: { 'user-agent': UA } });
    if (!img.ok) {
      console.warn(`  ${i}. ${photo.fileName} — fetch ${img.status}, skipped`);
      continue;
    }
    const bytes = Buffer.from(await img.arrayBuffer());
    const size = imageSizeOf(bytes);
    if (!size) {
      console.warn(`  ${i}. ${photo.fileName} — unreadable header, skipped`);
      continue;
    }
    // Storage starts answering "Too many connections issued to the database"
    // around the 30th upload of a run; a short pause clears it every time.
    const storagePath = nextPhotoStoragePath(listingId, 'photo.jpg');
    let upErr: { message: string } | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * attempt));
      ({ error: upErr } = await sb.storage
        .from(LISTING_PHOTOS_BUCKET)
        .upload(storagePath, bytes, { contentType: 'image/jpeg', upsert: false }));
      if (!upErr) break;
      console.warn(`  ${i}. ${photo.fileName} — upload ${upErr.message}, retrying`);
    }
    if (upErr) throw new Error(`upload failed for ${photo.fileName}: ${upErr.message}`);

    const { error: rowErr } = await sb.from('listing_photos').insert({
      listing_id: listingId,
      storage_path: storagePath,
      alt_text: photo.caption || null,
      width: size.width,
      height: size.height,
      status: 'ready',
      sort_order: i,
      // enhanced_status defaults to 'queued' — the render worker's enhance
      // pass picks it up on its own (migration 20260821120000).
    });
    if (rowErr) throw new Error(`listing_photos insert failed: ${rowErr.message}`);
    firstPath ??= storagePath;
    console.log(`  ${i}. ${photo.fileName} — ${size.width}x${size.height}, ${bytes.length} bytes`);
  }

  // Same rule as the dashboard's upload action: first asset becomes the cover,
  // and an existing pick is never overridden.
  const { data: cur } = await sb
    .from('listings')
    .select('cover_url, published_at')
    .eq('id', listingId)
    .maybeSingle();
  if (firstPath && cur && !cur.cover_url) {
    await sb
      .from('listings')
      .update({ cover_url: photoPublicUrl(firstPath) })
      .eq('id', listingId);
    console.log('cover set to the first photo');
  }

  if (STATUS === 'active') {
    // Mirrors publish-actions.ts: published_at is stamped on first activation
    // only, and preserved across later toggles.
    const update: Record<string, unknown> = { status: 'active' };
    if (!cur?.published_at) update.published_at = new Date().toISOString();
    const { error } = await sb.from('listings').update(update).eq('id', listingId);
    if (error) throw new Error(`activate failed: ${error.message}`);
  }

  console.log(`\ndone: /v/${agentSlug}/${slug} (status ${STATUS})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
