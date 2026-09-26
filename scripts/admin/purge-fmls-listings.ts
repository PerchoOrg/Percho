/**
 * HARD-DELETE every scraped FMLS listing (`listings.source = 'fmls'`) and
 * everything made from it — photos, clips, films, Cloudflare Stream assets.
 *
 * Why (owner, 2026-09-26): FMLS Data Services reviewed percho.co for the
 * Bridge API licence and found a card identical to FMLS #7798528, remarks
 * included. These rows came from the retired scraper, not from Bridge; the
 * licence allows only the Bridge test dataset until approval. phase166 kept
 * the video-backed ones "for demo purpose" — this removes them too. No backup
 * is written: keeping a copy of scraped data is the problem being fixed.
 *
 * What one run touches, in order:
 *   1. Cloudflare Stream: every uid on `listing_videos` (portrait, landscape,
 *      square), `generated_videos` and `listing_tour_assemblies`.
 *   2. Storage, path-precise: `listing_photos.storage_path` / `enhanced_path`
 *      and `listing_photo_clips.storage_path` (`ai-videos` + `clip-renders`,
 *      as in delete-non-video-listings.ts). Then any leftover object under
 *      `listing-photos/fmls-import/` — that prefix is the scraper's own and
 *      holds nothing else.
 *   3. `leads` (no cascade), then `listings` — every other child table
 *      cascades. `mls_listings` is only counted: it is the Bridge mirror, and
 *      a re-run after the first sync must not wipe licensed rows.
 *
 * Usage (repo-root .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_STREAM_API_TOKEN):
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/purge-fmls-listings.ts
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/purge-fmls-listings.ts --apply
 *
 * DRY RUN BY DEFAULT. Nothing is deleted without --apply.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { deleteVideo } from '../../apps/web/lib/cloudflare/stream.js';

const APPLY = process.argv.includes('--apply');
const SCRAPER_PREFIX = 'fmls-import';

// Fill missing vars from .env.local (run from apps/web, as the usage says).
for (const p of ['../../.env.local', '.env.local']) {
  if (!existsSync(p)) continue;
  for (const m of readFileSync(p, 'utf8').matchAll(/^([A-Z0-9_]+)=(.*)$/gm)) {
    const [, name, value] = m;
    if (name && value !== undefined && !process.env[name]) {
      process.env[name] = value.trim().replace(/^"|"$/g, '');
    }
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function selectIn<T>(table: string, cols: string, fk: string, ids: string[]): Promise<T[]> {
  const rows: T[] = [];
  for (const part of chunk(ids, 100)) {
    const { data, error } = await sb.from(table).select(cols).in(fk, part);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
  }
  return rows;
}

function uids(rows: Record<string, unknown>[], cols: string[]): string[] {
  return rows.flatMap((r) => cols.map((c) => r[c]).filter((u): u is string => typeof u === 'string'));
}

/** Every object under `listing-photos/<prefix>/`, recursing into folders. */
async function listPrefix(prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from('listing-photos').list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`storage list ${prefix}: ${error.message}`);
    for (const o of data ?? []) {
      // Folders come back with a null id.
      if (o.id === null) out.push(...(await listPrefix(`${prefix}/${o.name}`)));
      else out.push(`${prefix}/${o.name}`);
    }
    if ((data ?? []).length < 1000) return out;
  }
}

async function main() {
  // ── 1. the doomed set and everything hanging off it ─────────────────────
  const { data: doomed, error: listErr } = await sb
    .from('listings')
    .select('id, source_id, address, city, status')
    .eq('source', 'fmls')
    .order('created_at', { ascending: true });
  if (listErr) throw new Error(`listings: ${listErr.message}`);
  const ids = (doomed ?? []).map((l) => l.id as string);

  console.log(`fmls listings: ${ids.length}`);
  for (const l of doomed ?? []) console.log(`  ${l.id}  ${l.source_id}  ${l.address}, ${l.city} (${l.status})`);

  type PhotoRow = { id: string; storage_path: string; enhanced_path: string | null };
  const photos = await selectIn<PhotoRow>('listing_photos', 'id, storage_path, enhanced_path', 'listing_id', ids);
  type ClipRow = { storage_path: string | null };
  const clips = await selectIn<ClipRow>(
    'listing_photo_clips', 'storage_path', 'listing_photo_id', photos.map((p) => p.id),
  );
  const videos = await selectIn<Record<string, unknown>>('listing_videos', '*', 'listing_id', ids);
  const generated = await selectIn<Record<string, unknown>>('generated_videos', 'cf_stream_uid', 'listing_id', ids);
  const assemblies = await selectIn<Record<string, unknown>>(
    'listing_tour_assemblies', 'cf_stream_uid', 'listing_id', ids,
  );
  const leads = await selectIn<{ id: string }>('leads', 'id', 'listing_id', ids);
  const { count: mirrorCount, error: mirrorErr } = await sb
    .from('mls_listings')
    .select('listing_key', { count: 'exact', head: true });
  if (mirrorErr) throw new Error(`mls_listings: ${mirrorErr.message}`);

  const streamUids = [
    ...new Set([
      ...uids(videos, ['cf_video_id', 'cf_video_id_landscape', 'cf_video_id_square']),
      ...uids(generated, ['cf_stream_uid']),
      ...uids(assemblies, ['cf_stream_uid']),
    ]),
  ];
  const photoPaths = [
    ...photos.map((p) => p.storage_path),
    ...photos.flatMap((p) => (p.enhanced_path ? [p.enhanced_path] : [])),
  ];
  const clipPaths = clips.flatMap((c) => (c.storage_path ? [c.storage_path] : []));
  const leftover = (await listPrefix(SCRAPER_PREFIX)).filter((p) => !photoPaths.includes(p));

  console.log(
    `children: listing_photos ${photos.length} (paths ${photoPaths.length}), clips ${clips.length}, ` +
      `listing_videos ${videos.length}, generated_videos ${generated.length}, ` +
      `assemblies ${assemblies.length}, leads ${leads.length}, mls_listings ${mirrorCount ?? 0} (not touched)`,
  );
  console.log(`stream uids: ${streamUids.length}`);
  for (const u of streamUids) console.log(`  ${u}`);
  console.log(`leftover ${SCRAPER_PREFIX}/ objects not on any row: ${leftover.length}`);

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to delete.');
    return;
  }

  // ── 2. Stream ───────────────────────────────────────────────────────────
  for (const uid of streamUids) {
    const res = await deleteVideo(uid);
    if (!res.ok) throw new Error(`stream ${uid}: ${res.error}`);
  }
  console.log(`stream assets deleted: ${streamUids.length}`);

  // ── 3. storage ──────────────────────────────────────────────────────────
  let removed = 0;
  for (const [bucket, paths] of [
    ['listing-photos', [...photoPaths, ...leftover]],
    ['ai-videos', clipPaths],
    ['clip-renders', clipPaths],
  ] as const) {
    for (const part of chunk(paths, 100)) {
      const { error } = await sb.storage.from(bucket).remove(part);
      if (error) throw new Error(`storage ${bucket}: ${error.message}`);
      removed += part.length;
    }
  }
  console.log(`storage paths removed: ${removed}`);

  // ── 4. rows: leads, then listings (cascade) ─────────────────────────────
  for (const part of chunk(ids, 100)) {
    const { error } = await sb.from('leads').delete().in('listing_id', part);
    if (error) throw new Error(`leads: ${error.message}`);
  }
  for (const part of chunk(ids, 100)) {
    const { error } = await sb.from('listings').delete().in('id', part);
    if (error) throw new Error(`listings: ${error.message}`);
  }

  // ── 5. verify ───────────────────────────────────────────────────────────
  const { count } = await sb.from('listings').select('id', { count: 'exact', head: true }).eq('source', 'fmls');
  const left = await listPrefix(SCRAPER_PREFIX);
  console.log(`fmls listings remaining: ${count}; ${SCRAPER_PREFIX}/ objects remaining: ${left.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
