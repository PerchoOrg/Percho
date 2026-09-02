/**
 * Import one John Wieland / Pulte "quick move-in" home page as a Percho listing.
 *
 * Written for lot 10901 at Sterling Pointe, Cumming (2026-09-01). The owner
 * wanted a listing he could run the home tour pipeline over, and the builder's
 * page is the only source — a QMI that completes in Oct/Nov 2026 is not in any
 * MLS feed yet, so `lib/mls/` has nothing to sync.
 *
 * What it reads out of the page:
 *   - the `dataLayer.push({"pageType":"qmi_view", …})` blob — address, city,
 *     beds, baths, price, discount, lat/lng, floor plan name + description.
 *     This is the builder's own analytics payload, so it is the QMI's data
 *     rather than the community's. (The visible header address belongs to the
 *     SALES CENTRE, which is a different street.)
 *   - the spec tiles (`<p class="big|regular">value</p><p class="description">
 *     label</p>`) — square feet, garage, stories, lot number, completion.
 *   - the features list, and the carousel's 14 photos.
 *
 * The photos come through Cloudinary's fetch proxy (the same one the page
 * uses) because picturepark serves the originals only to it. `c_limit` asks
 * for the native size rather than a crop: the sources are 1448–1920px wide and
 * the render worker's enhance pass upscales anything under 2400.
 *
 * Listing shape: agent-owned (`agent_id` set, `source` NULL) — the schema's
 * `listings_agent_or_external_chk` allows one or the other, and an
 * agent-owned row is what the dashboard and `/v/<agent>/<slug>` expect.
 * Provenance lives here and in the DEVLOG, not in a column.
 *
 * Usage (repo-root .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY):
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/import-jw-listing.ts <url> --agent <slug>
 *   …                                                                          <url> --agent <slug> --apply
 *
 * DRY RUN BY DEFAULT. Nothing is written without --apply.
 *
 * Re-running with --apply is safe: the listing is matched by (agent, slug) and
 * updated in place, and a photo is uploaded only for a carousel position that
 * has no row yet.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
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
    'usage: import-jw-listing <qmi-url> --agent <agent-slug> [--apply] [--status active|inactive]',
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
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&rsquo;/g, '’')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/** The JSON object starting at `from`, found by balancing braces. */
function jsonAt(html: string, from: number): unknown {
  let depth = 0;
  for (let i = from; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) return JSON.parse(html.slice(from, i + 1));
    }
  }
  throw new Error('unbalanced JSON in dataLayer blob');
}

interface Parsed {
  address: string;
  city: string;
  state: string;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  price: number | null;
  wasPrice: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  planName: string;
  planDescription: string;
  lotNumber: string | null;
  completion: string | null;
  garage: string | null;
  stories: string | null;
  highlights: string[];
  photos: Array<{ caption: string; source: string }>;
}

function parse(html: string): Parsed {
  // The page pushes a bare `{"pageType":"qmi_view"}` marker earlier on, so take
  // the first blob that actually carries the home.
  let q: Record<string, unknown> | null = null;
  for (const m of html.matchAll(/\{"pageType":"qmi_view"/g)) {
    const blob = jsonAt(html, m.index!) as { qmi?: Record<string, unknown> };
    if (blob.qmi) {
      q = blob.qmi;
      break;
    }
  }
  if (!q) throw new Error('no qmi_view dataLayer blob — is this a quick move-in page?');

  // Spec tiles. `big` and `regular` are the same tile at two type sizes.
  const specs = new Map<string, string>();
  for (const m of html.matchAll(
    /<p class="(?:big|regular)">([\s\S]*?)<\/p>\s*<p class="description">([\s\S]*?)<\/p>/g,
  )) {
    specs.set(decode(m[2]!.replace(/<[^>]+>/g, '')), decode(m[1]!.replace(/<[^>]+>/g, '')));
  }

  const features = html.match(
    /<div class="features-list[^"]*">\s*<ul class="info">([\s\S]*?)<\/ul>/,
  );
  const highlights = features
    ? [...features[1]!.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => decode(m[1]!))
    : [];

  const photos: Array<{ caption: string; source: string }> = [];
  for (const m of html.matchAll(
    /<img[^>]*?alt="([^"]*)"[\s\S]{0,200}?data-name="(https:\/\/pultegroup\.cdn\.picturepark\.com\/v\/[^"]+)"/g,
  )) {
    photos.push({ caption: decode(m[1]!), source: m[2]! });
  }

  // Zip only appears in the header address line, which is the sales centre's
  // when it differs from the home's — same postcode either way.
  const zip = html.match(/,\s*Georgia\s+(\d{5})/)?.[1] ?? null;

  const num = (label: string): number | null => {
    const raw = specs.get(label);
    if (!raw) return null;
    const n = Number(raw.replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  return {
    address: String(q.address ?? ''),
    city: String(q.city ?? ''),
    // The blob spells the state out; the schema stores the abbreviation.
    state: q.state === 'Georgia' ? 'GA' : String(q.state ?? ''),
    zip,
    lat: typeof q.latitude === 'number' ? q.latitude : null,
    lng: typeof q.longitude === 'number' ? q.longitude : null,
    price: typeof q.finalPrice === 'number' ? Math.round(q.finalPrice) : null,
    wasPrice: typeof q.price === 'number' ? Math.round(q.price) : null,
    beds: typeof q.numberOfBeds === 'number' ? q.numberOfBeds : num('Bedrooms'),
    baths: typeof q.numberOfBaths === 'number' ? q.numberOfBaths : num('Bathrooms'),
    sqft: num('Square Feet'),
    planName: decode(String(q.floorplanName ?? '')),
    planDescription: decode(String(q.floorplanDescription ?? '')),
    lotNumber: specs.get('Lot Number') ?? null,
    completion: specs.get('Anticipated completion date') ?? null,
    garage: specs.get('Car Garage') ?? null,
    stories: specs.get('Stories') ?? null,
    highlights,
    photos,
  };
}

/** Cloudinary's fetch proxy at the source's native size. */
function photoUrl(source: string): string {
  return `https://res.cloudinary.com/dv0jqjrc3/image/fetch/c_limit,f_jpg,q_auto:best,w_2400/${source}`;
}

async function main() {
  const res = await fetch(url!, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const parsed = parse(await res.text());

  console.log(`${parsed.address}, ${parsed.city}, ${parsed.state} ${parsed.zip ?? '?'}`);
  console.log(
    `  ${parsed.planName.trim()} · ${parsed.beds} bed · ${parsed.baths} bath · ` +
      `${parsed.sqft} sqft · ${parsed.garage}-car · ${parsed.stories} stories`,
  );
  console.log(
    `  $${parsed.price?.toLocaleString()} (was $${parsed.wasPrice?.toLocaleString()}) · ` +
      `lot ${parsed.lotNumber} · completes ${parsed.completion}`,
  );
  console.log(`  ${parsed.highlights.length} highlights · ${parsed.photos.length} photos`);

  if (!parsed.address || !parsed.city || parsed.photos.length === 0) {
    throw new Error('page parsed but is missing an address or photos — refusing to write');
  }

  const { data: agent } = await sb
    .from('agents')
    .select('id, name')
    .eq('slug', agentSlug)
    .maybeSingle();
  if (!agent) throw new Error(`no agent with slug "${agentSlug}"`);

  // Completion year is the closest honest answer for a home under construction.
  const yearBuilt = Number(parsed.completion?.match(/\b(20\d{2})\b/)?.[1] ?? '') || null;
  const description = [
    parsed.planDescription,
    parsed.highlights.length ? `Highlights: ${parsed.highlights.join('; ')}.` : '',
  ].filter(Boolean);

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
    year_built: yearBuilt,
    description,
    status: STATUS,
  };

  if (!APPLY) {
    console.log('\n--- dry run, nothing written ---');
    console.log(JSON.stringify({ agent: agent.name, ...fields }, null, 2));
    for (const [i, p] of parsed.photos.entries()) console.log(`  ${i}. ${p.caption} ${p.source}`);
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
        .insert({ agent_id: agent.id, slug: candidate, ...fields })
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
      console.log(`  ${i}. ${photo.caption} — already present, skipped`);
      continue;
    }
    const img = await fetch(photoUrl(photo.source));
    if (!img.ok) {
      console.warn(`  ${i}. ${photo.caption} — fetch ${img.status}, skipped`);
      continue;
    }
    const bytes = Buffer.from(await img.arrayBuffer());
    const size = imageSizeOf(bytes);
    if (!size) {
      console.warn(`  ${i}. ${photo.caption} — unreadable header, skipped`);
      continue;
    }
    const storagePath = nextPhotoStoragePath(listingId, 'photo.jpg');
    const { error: upErr } = await sb.storage
      .from(LISTING_PHOTOS_BUCKET)
      .upload(storagePath, bytes, { contentType: 'image/jpeg', upsert: false });
    if (upErr) throw new Error(`upload failed for ${photo.caption}: ${upErr.message}`);

    const { error: rowErr } = await sb.from('listing_photos').insert({
      listing_id: listingId,
      storage_path: storagePath,
      alt_text: photo.caption,
      width: size.width,
      height: size.height,
      status: 'ready',
      sort_order: i,
      // enhanced_status defaults to 'queued' — the render worker's enhance
      // pass picks it up on its own (migration 20260821120000).
    });
    if (rowErr) throw new Error(`listing_photos insert failed: ${rowErr.message}`);
    firstPath ??= storagePath;
    console.log(`  ${i}. ${photo.caption} — ${size.width}x${size.height}, ${bytes.length} bytes`);
  }

  // Same rule as the dashboard's upload action: first asset becomes the cover,
  // and an existing pick is never overridden.
  const { data: cur } = await sb
    .from('listings')
    .select('cover_url')
    .eq('id', listingId)
    .maybeSingle();
  if (firstPath && cur && !cur.cover_url) {
    await sb
      .from('listings')
      .update({ cover_url: photoPublicUrl(firstPath) })
      .eq('id', listingId);
    console.log('cover set to the first photo');
  }

  console.log(`\ndone: /v/${agentSlug}/${slug} (status ${STATUS})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
