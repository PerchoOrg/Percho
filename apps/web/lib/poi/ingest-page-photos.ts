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
/** One page should not be able to enqueue an unbounded fetch. */
const MAX_IMAGES = 40;
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

export interface IngestResult {
  poi_id: string;
  poi_name: string;
  found: number;
  added: number;
  skipped: Array<{ url: string; reason: string }>;
}

/**
 * Every image URL a page points at, absolute and de-duplicated.
 *
 * Covers three shapes because real community sites use all of them: `<img
 * src>`, `srcset` candidate lists, and — the Aberdeen photo album's shape — an
 * `<a href>` pointing straight at the full-size JPEG, where the `<img>` is
 * only a thumbnail.
 */
export function extractImageUrls(html: string, pageUrl: string): string[] {
  const out = new Set<string>();
  const add = (raw: string | undefined) => {
    if (!raw) return;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('data:')) return;
    try {
      out.add(new URL(trimmed, pageUrl).toString());
    } catch {
      /* a malformed src is not worth failing the page over */
    }
  };

  for (const m of html.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/\bsrcset\s*=\s*["']([^"']+)["']/gi)) {
    // "a.jpg 480w, b.jpg 960w" — the URL is the first token of each candidate.
    for (const candidate of (m[1] ?? '').split(',')) add(candidate.trim().split(/\s+/)[0]);
  }
  for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"']+\.(?:jpe?g|png))["']/gi)) {
    add(m[1]);
  }

  return [...out];
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

  for (const url of urls.slice(0, MAX_IMAGES)) {
    if (CHROME_PATH.test(new URL(url).pathname)) {
      skipped.push({ url, reason: 'site furniture, not content' });
      continue;
    }
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
      skipped.push({ url, reason: 'not a JPEG or PNG' });
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

    const ext = contentType.includes('png') ? '.png' : '.jpg';
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
