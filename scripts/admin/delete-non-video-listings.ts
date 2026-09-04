/**
 * HARD-DELETE every listing that has no playable video.
 *
 * Why (owner, 2026-09-04): the existing inventory is FMLS-sourced and "not
 * legal" for a public app. The ~dozen listings with finished walkthrough
 * videos stay as demo content; everything else goes, ahead of the App Store
 * push. This is the data half of phase166.
 *
 * KEEP criterion — exactly the feed's `videosOnly` rule
 * (`apps/web/lib/feed/browse-cards.ts` `fetchBrowseCardsVideosOnly`):
 * a `listing_videos` row with `status='ready'` and any of `cf_video_id`,
 * `cf_video_id_landscape`, `cf_video_id_square`, `external_url` non-null.
 * Every listing NOT in that set is deleted, regardless of `listings.status`.
 *
 * What one deletion touches:
 *   1. Storage, path-precise only. The `listing-photos` bucket ALSO holds POI
 *      photos (`POI_PHOTO_BUCKET` in `lib/poi/entity-scope.ts`), so nothing is
 *      removed by prefix — only `listing_photos.storage_path` and
 *      `enhanced_path` values, plus `listing_photo_clips.storage_path`
 *      (`ai-videos` for seedance, `clip-renders` for local engines).
 *   2. `leads` rows — the one child FK without `on delete cascade`.
 *   3. `listings` rows — every other child table cascades.
 *
 * NOT touched: Cloudflare Stream assets. Orphaned uids (unfinished renders,
 * `listing_intent_bucket` nearby videos) are collected into the backup file
 * and printed for a separate decision — they cost storage minutes but are
 * paid artifacts, and destroying them is not this script's call.
 *
 * A full JSON snapshot of every row about to die is written to
 * `~/Percho-backups/` before anything is deleted.
 *
 * Usage (repo-root .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY):
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/delete-non-video-listings.ts
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/delete-non-video-listings.ts --apply
 *
 * DRY RUN BY DEFAULT. Nothing is deleted without --apply.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');

function loadEnv(): { url: string; key: string } {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (envUrl && envKey) return { url: envUrl, key: envKey };
  for (const p of ['../../.env.local', '.env.local']) {
    if (!existsSync(p)) continue;
    const text = readFileSync(p, 'utf8');
    const get = (name: string) =>
      text.match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
    const url = get('NEXT_PUBLIC_SUPABASE_URL');
    const key = get('SUPABASE_SERVICE_ROLE_KEY');
    if (url && key) return { url, key };
  }
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
  process.exit(1);
}

const { url, key } = loadEnv();
const sb = createClient(url, key, { auth: { persistSession: false } });

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Paged select-in, because PostgREST caps a URL's length well below 245 uuids. */
async function selectIn<T>(table: string, cols: string, fk: string, ids: string[]): Promise<T[]> {
  const rows: T[] = [];
  for (const part of chunk(ids, 100)) {
    const { data, error } = await sb.from(table).select(cols).in(fk, part);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
  }
  return rows;
}

async function main() {
  // ── 1. keep / delete sets ────────────────────────────────────────────────
  const { data: vidRows, error: vidErr } = await sb
    .from('listing_videos')
    .select('listing_id')
    .eq('status', 'ready')
    .or(
      'cf_video_id.not.is.null,cf_video_id_landscape.not.is.null,cf_video_id_square.not.is.null,external_url.not.is.null',
    );
  if (vidErr) throw new Error(`listing_videos: ${vidErr.message}`);
  const keep = new Set((vidRows ?? []).map((r) => r.listing_id as string));

  const { data: allListings, error: listErr } = await sb
    .from('listings')
    .select('id, slug, address, city, state, price, status, source, community_id')
    .order('created_at', { ascending: true })
    .limit(10000);
  if (listErr) throw new Error(`listings: ${listErr.message}`);
  const doomed = (allListings ?? []).filter((l) => !keep.has(l.id as string));
  const doomedIds = doomed.map((l) => l.id as string);
  const kept = (allListings ?? []).filter((l) => keep.has(l.id as string));

  console.log(`listings total: ${allListings?.length}  keep: ${kept.length}  delete: ${doomed.length}`);
  for (const l of kept) console.log(`  KEEP  ${l.id}  ${l.address}, ${l.city} (${l.status})`);
  if (doomedIds.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  // ── 2. gather children that need explicit handling, and the backup ──────
  type PhotoRow = { id: string; listing_id: string; storage_path: string; enhanced_path: string | null };
  const photos = await selectIn<PhotoRow>(
    'listing_photos', 'id, listing_id, storage_path, enhanced_path', 'listing_id', doomedIds,
  );
  const photoIds = photos.map((p) => p.id);

  type ClipRow = { listing_photo_id: string; engine: string; storage_path: string | null };
  const clips: ClipRow[] = photoIds.length
    ? await selectIn<ClipRow>('listing_photo_clips', 'listing_photo_id, engine, storage_path', 'listing_photo_id', photoIds)
    : [];

  const legacyPhotos = await selectIn<{ listing_id: string; storage_url: string }>(
    'photos', 'listing_id, storage_url', 'listing_id', doomedIds,
  );
  const leads = await selectIn<Record<string, unknown>>('leads', '*', 'listing_id', doomedIds);
  const videos = await selectIn<Record<string, unknown>>('listing_videos', '*', 'listing_id', doomedIds);
  const generated = await selectIn<Record<string, unknown>>(
    'generated_videos', 'id, listing_id, scope, status, cf_stream_uid', 'listing_id', doomedIds,
  );

  const photoPaths = [
    ...photos.map((p) => p.storage_path),
    ...photos.flatMap((p) => (p.enhanced_path ? [p.enhanced_path] : [])),
  ];
  // The column comment says `ai-videos`; the clips route serves local engines
  // from `clip-renders`. Removing a path from a bucket it isn't in is a no-op,
  // so try every clip path against both.
  const clipPaths = clips.filter((c) => c.storage_path).map((c) => c.storage_path as string);
  const orphanCfUids = [
    ...videos.flatMap((v) =>
      [v.cf_video_id, v.cf_video_id_landscape, v.cf_video_id_square].filter((u): u is string => typeof u === 'string'),
    ),
    ...generated.flatMap((g) => (typeof g.cf_stream_uid === 'string' ? [g.cf_stream_uid] : [])),
  ];

  console.log(
    `children: listing_photos ${photos.length} (storage paths ${photoPaths.length}), ` +
      `clips ${clips.length}, legacy photos ${legacyPhotos.length}, leads ${leads.length}, ` +
      `listing_videos ${videos.length}, generated_videos ${generated.length}`,
  );
  console.log(`orphaned CF Stream uids (NOT deleted, reported only): ${orphanCfUids.length}`);

  const backupDir = join(homedir(), 'Percho-backups');
  mkdirSync(backupDir, { recursive: true });
  const backupPath = join(backupDir, `delete-non-video-listings-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(
    backupPath,
    JSON.stringify({ doomed, photos, clips, legacyPhotos, leads, videos, generated, orphanCfUids }, null, 1),
  );
  console.log(`backup written: ${backupPath}`);

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to delete.');
    return;
  }

  // ── 3. delete: storage first, then leads, then listings (cascade) ───────
  let removed = 0;
  for (const [bucket, paths] of [
    ['listing-photos', photoPaths],
    ['ai-videos', clipPaths],
    ['clip-renders', clipPaths],
  ] as const) {
    for (const part of chunk(paths, 100)) {
      const { error } = await sb.storage.from(bucket).remove(part);
      if (error) throw new Error(`storage ${bucket}: ${error.message}`);
      removed += part.length;
    }
  }
  console.log(`storage objects removed: ${removed}`);

  for (const part of chunk(doomedIds, 100)) {
    const { error } = await sb.from('leads').delete().in('listing_id', part);
    if (error) throw new Error(`leads: ${error.message}`);
  }
  console.log(`leads deleted: ${leads.length}`);

  for (const part of chunk(doomedIds, 100)) {
    const { error } = await sb.from('listings').delete().in('id', part);
    if (error) throw new Error(`listings: ${error.message}`);
  }

  // ── 4. verify ────────────────────────────────────────────────────────────
  const { count } = await sb.from('listings').select('id', { count: 'exact', head: true });
  console.log(`listings remaining: ${count} (expected ${kept.length})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
