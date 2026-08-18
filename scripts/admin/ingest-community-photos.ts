/**
 * Ingest a community's own amenity photos into the POI pipeline.
 *
 * Google Places has no photos of an HOA pool or clubhouse — they are not
 * listed businesses — so the 'amenities' bucket is fed from the community's
 * own website instead. This script is the only way photos enter that bucket.
 *
 * It creates one synthetic POI per amenity ("Aberdeen Pool"), uploads the
 * files to the same storage bucket and path convention Google photos use,
 * writes poi_photos rows with source='community_site', links them to the
 * community with intent_bucket='amenities', and queues them for the
 * render-worker's enhance pass. Tagging is left to the tour pipeline's `tag`
 * step, which is where every other photo gets tagged.
 *
 * Usage:
 *   pnpm tsx scripts/admin/ingest-community-photos.ts <community-slug> <dir>
 *
 * <dir> holds one subdirectory per amenity; the directory name becomes the
 * POI name, so `pool/`, `clubhouse/`, `tennis-courts/` become "<Community>
 * Pool", "<Community> Clubhouse", "<Community> Tennis Courts".
 *
 * Re-running is safe: a file already ingested (same sha256 under the same POI)
 * is skipped rather than duplicated.
 */
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const PHOTO_BUCKET = 'listing-photos';
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png']);

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

/**
 * Pixel dimensions from the file header. The scheduler drops a photo that
 * would need too much upscaling (see isTooLowRes), so these must be real
 * values, not guesses — but the pipeline only ever ingests JPEG and PNG, and
 * both encode their size in a fixed place. Not worth a dependency.
 */
function imageSize(bytes: Buffer): { width: number; height: number } | null {
  // PNG: IHDR width/height are big-endian u32 at offsets 16 and 20.
  if (bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  // JPEG: walk the segment chain to the SOFn frame header, which carries the
  // dimensions. Segments before it (EXIF, quantisation tables) vary in size.
  if (bytes.length > 4 && bytes.readUInt16BE(0) === 0xffd8) {
    let off = 2;
    while (off + 9 < bytes.length) {
      if (bytes[off] !== 0xff) return null;
      const marker = bytes[off + 1]!;
      const len = bytes.readUInt16BE(off + 2);
      // SOF0..SOF15, excluding the non-frame markers DHT (c4), JPGA (c8), DAC (cc).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: bytes.readUInt16BE(off + 5), width: bytes.readUInt16BE(off + 7) };
      }
      off += 2 + len;
    }
  }
  return null;
}

function titleCase(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}. Source .env.local first.`);
  return v;
}

async function main() {
  const [slug, dir] = process.argv.slice(2);
  if (!slug || !dir) {
    console.error(
      'Usage: pnpm tsx scripts/admin/ingest-community-photos.ts <community-slug> <dir>',
    );
    process.exit(1);
  }

  const sb = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  );

  const { data: community, error: cErr } = await sb
    .from('communities')
    .select('id, name, slug, city, state')
    .eq('slug', slug)
    .single();
  if (cErr || !community) throw new Error(`No community with slug "${slug}": ${cErr?.message}`);
  console.log(`Community: ${community.name} (${community.city}, ${community.state})`);

  const entries = await readdir(dir, { withFileTypes: true });
  const amenityDirs = entries.filter((e) => e.isDirectory());
  if (amenityDirs.length === 0) throw new Error(`No amenity subdirectories in ${dir}`);

  const queuedPhotoIds: string[] = [];

  for (const amenity of amenityDirs) {
    const amenityName = `${community.name} ${titleCase(amenity.name)}`;
    // Synthetic place id: these POIs are ours, not Google's, but the column is
    // NOT NULL UNIQUE and every other consumer keys off it.
    const placeId = `percho:community:${community.id}:${amenity.name}`;

    const { data: poi, error: poiErr } = await sb
      .from('pois')
      .upsert(
        {
          google_place_id: placeId,
          display_name: amenityName,
          formatted_address: `${community.city}, ${community.state}`,
          primary_type: 'community_amenity',
          types: ['community_amenity'],
        },
        { onConflict: 'google_place_id' },
      )
      .select('id')
      .single();
    if (poiErr || !poi) throw new Error(`POI upsert failed for ${amenityName}: ${poiErr?.message}`);

    const { error: linkErr } = await sb.from('community_pois').upsert(
      {
        community_id: community.id,
        poi_id: poi.id,
        intent_bucket: 'amenities',
        // Approved on ingest: an amenity photo hand-picked from the community's
        // own site does not need the review pass Google discoveries get.
        status: 'approved',
        distance_m: 0,
      },
      { onConflict: 'community_id,poi_id' },
    );
    if (linkErr) throw new Error(`community_pois link failed: ${linkErr.message}`);

    const files = (await readdir(join(dir, amenity.name))).filter((f) =>
      IMAGE_EXTS.has(extname(f).toLowerCase()),
    );
    let added = 0;
    let skipped = 0;

    for (const file of files) {
      const path = join(dir, amenity.name, file);
      const bytes = await readFile(path);
      const contentHash = createHash('sha256').update(bytes).digest('hex');

      const { data: existing } = await sb
        .from('poi_photos')
        .select('id')
        .eq('poi_id', poi.id)
        .eq('content_hash', contentHash)
        .maybeSingle();
      if (existing) {
        skipped += 1;
        continue;
      }

      const size = imageSize(bytes);
      if (!size) {
        console.warn(`  ! ${file}: unreadable header, skipped`);
        continue;
      }
      const ext = extname(file).toLowerCase();
      const storagePath = `poi/${poi.id}/${contentHash.slice(0, 32)}${ext}`;
      const { error: upErr } = await sb.storage
        .from(PHOTO_BUCKET)
        .upload(storagePath, bytes, {
          contentType: CONTENT_TYPES[ext] ?? 'image/jpeg',
          upsert: true,
        });
      if (upErr) throw new Error(`Upload failed for ${file}: ${upErr.message}`);

      const { data: row, error: rowErr } = await sb
        .from('poi_photos')
        .insert({
          poi_id: poi.id,
          source: 'community_site',
          storage_path: storagePath,
          content_hash: contentHash,
          width_px: size.width,
          height_px: size.height,
          bytes: bytes.length,
          attribution: { source_note: `${community.name} community website`, file: basename(file) },
          status: 'approved',
          enhanced_status: 'queued',
        })
        .select('id')
        .single();
      if (rowErr || !row) throw new Error(`poi_photos insert failed for ${file}: ${rowErr?.message}`);

      queuedPhotoIds.push(row.id);
      added += 1;
    }

    console.log(`  ${amenityName}: ${added} added, ${skipped} already present`);
  }

  console.log(
    `\n${queuedPhotoIds.length} photo(s) queued for enhancement. The render-worker picks them up; ` +
      'run the tour pipeline\'s "tag" step afterwards to annotate them.',
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
