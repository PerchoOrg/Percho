/**
 * Ingest the photos on a web page into `poi_photos` for review.
 *
 * Google Places has no photos of an HOA pool or a builder's amenity centre —
 * they are not listed businesses — so the good imagery for a subdivision lives
 * on the community's own site. An admin pastes that page's URL; every image on
 * it lands in the photo table as `pending`, and the existing approve/reject
 * buttons decide what the tour may use. Nothing here auto-approves.
 *
 * The photos attach to one synthetic POI per (community, label), so a page of
 * pool photos and a page of clubhouse photos stay separable in the tour.
 */

import { createHash } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { POI_PHOTO_BUCKET } from './entity-scope';
import { imageSizeOf } from './image-size';

/** A page's own chrome — logos, spacers, share icons — is never content. */
const MIN_EDGE_PX = 400;
/** Anything smaller is an icon or a tracking pixel, whatever its dimensions. */
const MIN_BYTES = 20_000;
/**
 * One page should not be able to enqueue an unbounded fetch.
 *
 * Raised from 40 to 80 (owner 2026-08-22) once the slots held distinct
 * photographs rather than resize variants of the same one: Bellmoore Park
 * offers 79 candidates after furniture is removed, and 40 threw away half a
 * gallery. Downloads are not what this guards — all 79 fetch in 2.2s / 28 MB.
 * It guards the uploads and the two DB round trips each image costs, against
 * the route's 300s maxDuration.
 */
const MAX_IMAGES = 80;
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Paths that hold a site's furniture rather than its content.
 *
 * Size alone does not catch these: a decorative illustration is easily bigger
 * than 400px and 20 KB. Forsyth County's theme shipped
 * `/themes/…/assets/img/graphics/graphic-boat-launch.png`, a stylised drawing
 * of a dock, which passed every other filter and landed in Aberdeen's photo
 * table as an amenity (2026-08-19). A drawing is not a photograph of anywhere.
 */
const CHROME_PATH = /\/(themes?|assets|static|dist|graphics|icons?|sprites?|ui|chrome)\//i;

/**
 * A URL that is a page's furniture rather than its content, judged without
 * downloading it. Cheap enough to run over every image on the page, which is
 * the whole point: it has to happen before MAX_IMAGES, not inside it.
 */
export function isFurniture(url: string): boolean {
  const { pathname } = new URL(url);
  return CHROME_PATH.test(pathname) || /\.svg$/i.test(pathname);
}

export interface IngestResult {
  poi_id: string;
  poi_name: string;
  found: number;
  added: number;
  skipped: Array<{ url: string; reason: string }>;
}

/** The entities that actually turn up inside a URL-bearing attribute. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/**
 * An attribute value with its HTML entities resolved.
 *
 * `&amp;` is the one that matters. A resize CDN's URL is written into the
 * markup as `?width=300&amp;ois=7796e8e`, and handing that back verbatim asks
 * for a parameter literally named `amp;ois` — so the signature the CDN checks
 * goes missing. Providence's shrugs and serves a default; a stricter one would
 * answer 403 and the page would look like it had no photos on it.
 */
function decodeEntities(value: string): string {
  return value.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, ref: string) => {
    const key = ref.toLowerCase();
    if (!key.startsWith('#')) return NAMED_ENTITIES[key] ?? whole;
    const code = key.startsWith('#x') ? Number.parseInt(key.slice(2), 16) : Number(key.slice(1));
    // A malformed numeric entity is not worth throwing the whole page away for.
    if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return whole;
    return String.fromCodePoint(code);
  });
}

/** The declared pixel width of a variant, or null if it does not claim one. */
function declaredWidth(url: URL, descriptor: number | undefined): number | null {
  if (descriptor !== undefined) return descriptor;
  const param = url.searchParams.get('width');
  if (param === null) return null;
  const parsed = Number(param);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Every image a page points at, absolute, de-duplicated, at its largest size.
 *
 * Covers three shapes because real community sites use all of them: `<img
 * src>`, `srcset` candidate lists, and — the Aberdeen photo album's shape — an
 * `<a href>` pointing straight at the full-size JPEG, where the `<img>` is
 * only a thumbnail.
 *
 * One photograph must come back as one URL. The Providence Group serves every
 * image at four widths (300 / 400 / 1000 / 1920), and counting those as four
 * images did two kinds of damage at once: Bellmoore Park's page yielded 309
 * "images" for ~100 real ones, so `MAX_IMAGES` was spent about ten photos in,
 * and the variant reached first in document order was the 300px thumbnail,
 * which then failed the size floor. Six photos survived, none of them of an
 * amenity, out of a 62-photo gallery (owner 2026-08-22).
 *
 * So variants that *declare* a width — a `w` descriptor, or a `width=` query —
 * collapse onto their path and the widest one wins. Anything that declares no
 * width keys on its full URL and is left alone: `?size=full` and `?size=thumb`
 * are not knowably the same picture, and guessing costs a photo.
 */
export function extractImageUrls(html: string, pageUrl: string): string[] {
  /** key → the widest variant seen for it so far. Insertion order is kept. */
  const best = new Map<string, { url: string; width: number }>();

  const add = (raw: string | undefined, descriptor?: number) => {
    if (!raw) return;
    const trimmed = decodeEntities(raw.trim());
    if (!trimmed || trimmed.startsWith('data:')) return;
    let parsed: URL;
    try {
      parsed = new URL(trimmed, pageUrl);
    } catch {
      /* a malformed src is not worth failing the page over */
      return;
    }
    const width = declaredWidth(parsed, descriptor);
    const key = width === null ? parsed.toString() : `${parsed.origin}${parsed.pathname}`;
    const seen = best.get(key);
    if (!seen || (width ?? 0) > seen.width) {
      best.set(key, { url: parsed.toString(), width: width ?? 0 });
    }
  };

  for (const m of html.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/\bsrcset\s*=\s*["']([^"']+)["']/gi)) {
    // "a.jpg 480w, b.jpg 960w" — URL first, then an optional size descriptor.
    for (const candidate of (m[1] ?? '').split(',')) {
      const [url, size] = candidate.trim().split(/\s+/);
      add(url, size?.endsWith('w') ? Number(size.slice(0, -1)) : undefined);
    }
  }
  for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"']+\.(?:jpe?g|png|webp))["']/gi)) {
    add(m[1]);
  }

  return [...best.values()].map((v) => v.url);
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        // Some community sites 403 an unidentified client.
        'User-Agent': 'PerchoBot/1.0 (+https://percho.com)',
        ...(init?.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A page's HTML, fetched the way this module fetches everything else.
 *
 * Exported for the ingest step's link harvest (`tour-steps/ingest.ts`), which
 * needs the same User-Agent — a community site that 403s an unidentified
 * client would otherwise appear to have no subpages rather than no access.
 * Null on any failure: a site that will not answer is a source we skip, not a
 * run we fail.
 */
export async function fetchPageHtml(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(pageUrl);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function titleCase(s: string): string {
  return s
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export async function ingestPagePhotos(
  communityId: string,
  pageUrl: string,
  label: string,
): Promise<IngestResult | { error: string; message: string }> {
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const sb: any = createServiceClient();

  const { data: community } = (await sb
    .from('communities')
    .select('id, name, city, state')
    .eq('id', communityId)
    .maybeSingle()) as {
    data: { id: string; name: string; city: string | null; state: string | null } | null;
  };
  if (!community) return { error: 'not_found', message: 'No such community.' };

  let html: string;
  try {
    const res = await fetchWithTimeout(pageUrl);
    if (!res.ok) {
      return { error: 'fetch_failed', message: `${pageUrl} returned HTTP ${res.status}.` };
    }
    html = await res.text();
  } catch (err) {
    return {
      error: 'fetch_failed',
      message: `Could not load ${pageUrl}: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }

  const urls = extractImageUrls(html, pageUrl);
  if (urls.length === 0) {
    return { error: 'no_images', message: 'No images found on that page.' };
  }

  const poiName = `${community.name} ${titleCase(label)}`;
  const placeId = `percho:community:${community.id}:${label.toLowerCase().replace(/\s+/g, '-')}`;
  const { data: poi, error: poiErr } = (await sb
    .from('pois')
    .upsert(
      {
        google_place_id: placeId,
        display_name: poiName,
        formatted_address: [community.city, community.state].filter(Boolean).join(', '),
        primary_type: 'community_amenity',
        types: ['community_amenity'],
      },
      { onConflict: 'google_place_id' },
    )
    .select('id')
    .single()) as { data: { id: string } | null; error: { message: string } | null };
  if (poiErr || !poi) {
    return { error: 'poi_failed', message: poiErr?.message ?? 'Could not create the POI.' };
  }

  await sb.from('community_pois').upsert(
    {
      community_id: community.id,
      poi_id: poi.id,
      intent_bucket: 'amenities',
      // 'approved' is the POI link, not the photos: the admin chose this page,
      // so the place belongs to the community. Each PHOTO still arrives
      // pending and is approved one by one in the table below.
      status: 'approved',
      distance_m: 0,
    },
    { onConflict: 'community_id,poi_id' },
  );

  const skipped: IngestResult['skipped'] = [];
  const queued: string[] = [];
  let added = 0;

  // Furniture is rejected on the URL alone, and — this is the point — before
  // MAX_IMAGES is applied. Deciding it inside the capped loop meant a header
  // full of icons could spend the whole budget before the first photograph:
  // thirteen of Bellmoore Park's first forty slots went to SVG chrome. An SVG
  // is furniture by definition here; `imageSizeOf` reads JPEG and PNG only, so
  // one could never have become a photo.
  const candidates: string[] = [];
  for (const url of urls) {
    if (isFurniture(url)) {
      skipped.push({ url, reason: 'site furniture, not content' });
    } else {
      candidates.push(url);
    }
  }
  // Say so when the cap bites. Silent truncation is what made this look like a
  // page with no photos on it rather than a page we stopped reading.
  for (const url of candidates.slice(MAX_IMAGES)) {
    skipped.push({ url, reason: `past the ${MAX_IMAGES}-image limit for one page` });
  }

  for (const url of candidates.slice(0, MAX_IMAGES)) {
    let bytes: Buffer;
    let contentType: string;
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        skipped.push({ url, reason: `HTTP ${res.status}` });
        continue;
      }
      contentType = res.headers.get('content-type') ?? 'image/jpeg';
      bytes = Buffer.from(await res.arrayBuffer());
    } catch {
      skipped.push({ url, reason: 'download failed' });
      continue;
    }

    if (bytes.length < MIN_BYTES) {
      skipped.push({ url, reason: `too small (${Math.round(bytes.length / 1024)} KB)` });
      continue;
    }
    const size = imageSizeOf(bytes);
    if (!size) {
      skipped.push({ url, reason: 'not a JPEG, PNG or WebP' });
      continue;
    }
    if (size.width < MIN_EDGE_PX || size.height < MIN_EDGE_PX) {
      skipped.push({ url, reason: `too small (${size.width}x${size.height})` });
      continue;
    }

    const contentHash = createHash('sha256').update(bytes).digest('hex');
    const { data: existing } = (await sb
      .from('poi_photos')
      .select('id')
      .eq('poi_id', poi.id)
      .eq('content_hash', contentHash)
      .maybeSingle()) as { data: { id: string } | null };
    if (existing) {
      skipped.push({ url, reason: 'already ingested' });
      continue;
    }

    // The stored extension has to match the bytes: the render worker and the
    // enhancer open the file by path, and a WebP saved as `.jpg` is a decode
    // error two steps later rather than here.
    const ext = contentType.includes('png')
      ? '.png'
      : contentType.includes('webp')
        ? '.webp'
        : '.jpg';
    const storagePath = `poi/${poi.id}/${contentHash.slice(0, 32)}${ext}`;
    const { error: upErr } = await sb.storage
      .from(POI_PHOTO_BUCKET)
      .upload(storagePath, bytes, { contentType, upsert: true });
    if (upErr) {
      skipped.push({ url, reason: `upload failed: ${upErr.message}` });
      continue;
    }

    const { data: row, error: rowErr } = (await sb
      .from('poi_photos')
      .insert({
        poi_id: poi.id,
        source: 'community_site',
        storage_path: storagePath,
        content_hash: contentHash,
        width_px: size.width,
        height_px: size.height,
        bytes: bytes.length,
        attribution: { source_page: pageUrl, source_image: url },
        // Pending, always. The whole point of this path is human review.
        status: 'pending',
        enhanced_status: 'queued',
      })
      .select('id')
      .single()) as { data: { id: string } | null; error: { message: string } | null };
    if (rowErr || !row) {
      skipped.push({ url, reason: `insert failed: ${rowErr?.message ?? 'unknown'}` });
      continue;
    }

    queued.push(row.id);
    added += 1;
  }

  return { poi_id: poi.id, poi_name: poiName, found: urls.length, added, skipped };
}
