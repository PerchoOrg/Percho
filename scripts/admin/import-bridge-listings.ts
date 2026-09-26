/**
 * Import FMLS listings from the Bridge API (RESO Web API) as Percho listings.
 *
 * Written 2026-09-26 for the FMLS licence review: until FMLS approves the
 * product, the Bridge token only sees FMLS's sandbox dataset, and the review
 * wants to see the product running on it. Owner picked the two Active test
 * rows FMLS allows on the internet (5893300 Fairmount, 5909385 Americus).
 *
 * Why not `lib/mls/sync-worker.ts` → mirror → projection (the path in
 * docs/mls-integration/go-live.md): the sandbox has no `Media` resource (404;
 * photos ride inline on Property) and no `ModificationTimestamp`, both of
 * which the sync worker depends on. For a handful of named rows this reads
 * Property directly.
 *
 * Display rules enforced here, not left to the caller:
 *   - `InternetEntireListingDisplayYN` must be true, or the row is refused.
 *   - `InternetAddressDisplayYN` must be true too — the feed has no
 *     withheld-address card, so a row that must hide its address is refused
 *     rather than shown with it.
 *   - Attribution: `external_agent_name` / `external_office` carry the listing
 *     agent and brokerage verbatim (`listings_owner_chk` requires the name).
 *   - Photos are copied as-is. `enhanced_status` is pinned to 'none' so the
 *     render worker's enhance pass never alters an MLS photo.
 *
 * Rows land as `source = 'fmls_bridge'`, `source_id = ListingKey` (distinct
 * from the retired scraper's 'fmls'), served at `/v/fmls/<ListingKey>`.
 *
 * Usage (repo-root .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * BRIDGE_SERVER_TOKEN, BRIDGE_DATASET_ID):
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/import-bridge-listings.ts <ListingId>...
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/import-bridge-listings.ts <ListingId>... --apply
 *
 * DRY RUN BY DEFAULT. Re-running with --apply updates the listing in place and
 * uploads only photos whose gallery position has no row yet.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { BridgeClient } from '../../apps/web/lib/mls/bridge-client.js';
import { imageSizeOf } from '../../apps/web/lib/poi/image-size.js';
import {
  LISTING_PHOTOS_BUCKET,
  nextPhotoStoragePath,
  photoPublicUrl,
} from '../../apps/web/lib/supabase/storage.js';
import { nextCandidate, slugify } from '../../apps/web/lib/utils/slug.js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ids = args.filter((a) => /^\d+$/.test(a));
if (ids.length === 0) {
  console.error('usage: import-bridge-listings <ListingId>... [--apply]');
  process.exit(1);
}

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
const bridge = new BridgeClient();

/** The Property fields this import reads. `ResoProperty` predates them. */
interface BridgeRow {
  ListingKey: string;
  ListingId: string;
  StandardStatus: string | null;
  InternetEntireListingDisplayYN: boolean | null;
  InternetAddressDisplayYN: boolean | null;
  UnparsedAddress: string | null;
  City: string | null;
  StateOrProvince: string | null;
  PostalCode: string | null;
  Latitude: number | null;
  Longitude: number | null;
  ListPrice: number | null;
  BedroomsTotal: number | null;
  BathroomsTotalInteger: number | null;
  BathroomsFull: number | null;
  LivingArea: number | null;
  BuildingAreaTotal: number | null;
  YearBuilt: number | null;
  LotSizeAcres: number | null;
  PublicRemarks: string | null;
  ListAgentFullName: string | null;
  ListOfficeName: string | null;
  Media: Array<{ MediaURL: string; MediaCategory: string | null; Order: number | null }> | null;
}

/** Zero is how the sandbox says "unknown" for areas; the card must not print "0 sqft". */
const positive = (n: number | null | undefined) => (n && n > 0 ? n : null);

async function importOne(listingId: string) {
  const res = await bridge.listProperties({ raw: `ListingId eq '${listingId}'` }, 1, 0);
  const row = res.value[0] as unknown as BridgeRow | undefined;
  if (!row) throw new Error(`${listingId}: not in the Bridge dataset`);
  if (row.InternetEntireListingDisplayYN !== true) {
    throw new Error(`${listingId}: InternetEntireListingDisplayYN is not true — may not be displayed`);
  }
  if (row.InternetAddressDisplayYN !== true) {
    throw new Error(`${listingId}: InternetAddressDisplayYN is not true — address must be withheld`);
  }
  if (!row.UnparsedAddress || !row.City || !row.StateOrProvince) {
    throw new Error(`${listingId}: missing address/city/state — refusing to write`);
  }

  const photos = (row.Media ?? [])
    .filter((m) => m.MediaCategory === 'Photo')
    .sort((a, b) => (a.Order ?? 0) - (b.Order ?? 0));

  const fields = {
    address: row.UnparsedAddress,
    city: row.City,
    state: row.StateOrProvince,
    zip: row.PostalCode,
    lat: row.Latitude,
    lng: row.Longitude,
    price: positive(row.ListPrice),
    beds: row.BedroomsTotal,
    baths: row.BathroomsTotalInteger ?? row.BathroomsFull,
    sqft: positive(row.LivingArea) ?? positive(row.BuildingAreaTotal),
    year_built: row.YearBuilt,
    lot_size: row.LotSizeAcres ? `${row.LotSizeAcres} acres` : null,
    description: row.PublicRemarks?.trim() ? [row.PublicRemarks.trim()] : [],
    external_agent_name: row.ListAgentFullName ?? row.ListOfficeName ?? 'FMLS',
    external_office: row.ListOfficeName,
  };

  console.log(`\n${listingId} (${row.ListingKey}) — ${row.StandardStatus}, ${photos.length} photo(s)`);
  console.log(JSON.stringify(fields, null, 2));
  if (!APPLY) return;

  const { data: existing } = await sb
    .from('listings')
    .select('id, slug')
    .eq('source', 'fmls_bridge')
    .eq('source_id', row.ListingKey)
    .maybeSingle();

  let id: string;
  if (existing) {
    const { error } = await sb.from('listings').update(fields).eq('id', existing.id);
    if (error) throw new Error(`update failed: ${error.message}`);
    id = existing.id;
    console.log(`updated ${id}`);
  } else {
    const base = slugify(fields.address, { fallback: 'listing' });
    let created: { id: string } | null = null;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      const { data, error } = await sb
        .from('listings')
        // Inactive until its photos are in — an active listing with an empty
        // gallery is a live page with nothing on it.
        .insert({
          ...fields,
          slug: nextCandidate(base, attempt),
          source: 'fmls_bridge',
          source_id: row.ListingKey,
          status: 'inactive',
        })
        .select('id')
        .single();
      if (data) created = data;
      else if (error?.code !== '23505') throw new Error(`insert failed: ${error?.message}`);
    }
    if (!created) throw new Error('slug exhaustion');
    id = created.id;
    console.log(`created ${id}`);
  }

  const { data: have } = await sb.from('listing_photos').select('sort_order').eq('listing_id', id);
  const taken = new Set((have ?? []).map((r) => r.sort_order as number));
  let firstPath: string | null = null;
  for (const [i, photo] of photos.entries()) {
    if (taken.has(i)) continue;
    const img = await fetch(photo.MediaURL);
    if (!img.ok) throw new Error(`photo ${i}: fetch ${img.status}`);
    const bytes = Buffer.from(await img.arrayBuffer());
    const size = imageSizeOf(bytes);
    if (!size) throw new Error(`photo ${i}: unreadable image header`);
    const storagePath = nextPhotoStoragePath(id, 'photo.jpg');
    const { error: upErr } = await sb.storage
      .from(LISTING_PHOTOS_BUCKET)
      .upload(storagePath, bytes, { contentType: 'image/jpeg', upsert: false });
    if (upErr) throw new Error(`photo ${i}: upload ${upErr.message}`);
    const { error: rowErr } = await sb.from('listing_photos').insert({
      listing_id: id,
      storage_path: storagePath,
      width: size.width,
      height: size.height,
      status: 'ready',
      sort_order: i,
      enhanced_status: 'none',
    });
    if (rowErr) throw new Error(`photo ${i}: row ${rowErr.message}`);
    firstPath ??= storagePath;
    console.log(`  photo ${i}: ${size.width}x${size.height}`);
  }

  const { data: cur } = await sb
    .from('listings')
    .select('cover_url, published_at')
    .eq('id', id)
    .maybeSingle();
  const update: Record<string, unknown> = { status: 'active' };
  if (firstPath && !cur?.cover_url) update.cover_url = photoPublicUrl(firstPath);
  if (!cur?.published_at) update.published_at = new Date().toISOString();
  const { error } = await sb.from('listings').update(update).eq('id', id);
  if (error) throw new Error(`activate failed: ${error.message}`);
  console.log(`active: /v/fmls/${row.ListingKey}`);
}

async function main() {
  for (const id of ids) await importOne(id);
  if (!APPLY) console.log('\nDRY RUN — re-run with --apply to write.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
