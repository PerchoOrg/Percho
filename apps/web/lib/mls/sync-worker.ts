/**
 * MLS sync worker. CLI-runnable:
 *
 *   npx tsx lib/mls/sync-worker.ts --mode=full
 *   npx tsx lib/mls/sync-worker.ts --mode=incremental
 *   npx tsx lib/mls/sync-worker.ts --mode=full --dry-run
 *
 * Wire into package.json (owner will do this once creds arrive):
 *   "mls:sync-full":        "tsx lib/mls/sync-worker.ts --mode=full"
 *   "mls:sync-incremental": "tsx lib/mls/sync-worker.ts --mode=incremental"
 *
 * DEPLOYMENT: run this on Fly.io / Railway (or a GitHub Actions cron),
 * NOT on Vercel. Vercel serverless functions cap at 60s (300s on Pro
 * for background) which is not enough for a first full-sync pass over
 * FMLS's ~30k active listings.
 *
 * Watermark: last successful ModificationTimestamp is stored in the
 * `mls_sync_state` table (source_system PK). On failure we do NOT
 * advance it, so the next run reprocesses the same window.
 *
 * Note: this file imports the service-role Supabase client because it
 * runs in a trusted server context (no browser). It is intentionally
 * kept out of the Next.js request path.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { BridgeClient } from './bridge-client';
import type { ODataFilter, ResoMedia, ResoProperty } from './reso-types';

const SOURCE_SYSTEM = 'fmls_bridge';
const PAGE_SIZE = 500;
const ACTIVE_STATUSES = "StandardStatus eq 'Active' or StandardStatus eq 'Pending'";

interface CliArgs {
  mode: 'full' | 'incremental';
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let mode: 'full' | 'incremental' | null = null;
  let dryRun = false;
  for (const a of argv) {
    if (a === '--mode=full') mode = 'full';
    else if (a === '--mode=incremental') mode = 'incremental';
    else if (a === '--dry-run') dryRun = true;
  }
  if (!mode) {
    throw new Error('Usage: sync-worker --mode=<full|incremental> [--dry-run]');
  }
  return { mode, dryRun };
}

// biome-ignore lint/suspicious/noExplicitAny: generated types don't include mls_* tables yet
type SB = any;

async function loadWatermark(sb: SB): Promise<string | null> {
  const { data, error } = await sb
    .from('mls_sync_state')
    .select('last_modification_timestamp')
    .eq('source_system', SOURCE_SYSTEM)
    .maybeSingle();
  if (error) throw error;
  return (data?.last_modification_timestamp as string | null) ?? null;
}

async function saveWatermark(sb: SB, ts: string): Promise<void> {
  const { error } = await sb
    .from('mls_sync_state')
    .upsert({ source_system: SOURCE_SYSTEM, last_modification_timestamp: ts });
  if (error) throw error;
}

function propertyRow(p: ResoProperty) {
  return {
    source_system: SOURCE_SYSTEM,
    listing_key: p.ListingKey,
    list_price: p.ListPrice,
    standard_status: p.StandardStatus,
    property_type: p.PropertyType,
    property_sub_type: p.PropertySubType,
    street_number: p.StreetNumber,
    street_name: p.StreetName,
    street_suffix: p.StreetSuffix,
    city: p.City,
    state_or_province: p.StateOrProvince,
    postal_code: p.PostalCode,
    latitude: p.Latitude,
    longitude: p.Longitude,
    bedrooms_total: p.BedroomsTotal,
    bathrooms_total_integer: p.BathroomsTotalInteger,
    living_area: p.LivingArea,
    lot_size_acres: p.LotSizeAcres,
    year_built: p.YearBuilt,
    public_remarks: p.PublicRemarks,
    list_office_name: p.ListOfficeName,
    list_agent_full_name: p.ListAgentFullName,
    list_agent_mls_id: p.ListAgentMlsId,
    days_on_market: p.DaysOnMarket,
    modification_timestamp: p.ModificationTimestamp,
    internet_entire_listing_display_yn: p.InternetEntireListingDisplayYN,
    mirrored_at: new Date().toISOString(),
  };
}

function mediaRow(m: ResoMedia) {
  return {
    source_system: SOURCE_SYSTEM,
    media_key: m.MediaKey,
    listing_key: m.ResourceRecordKey,
    media_url: m.MediaURL,
    display_order: m.Order,
    media_category: m.MediaCategory,
    short_description: m.ShortDescription,
    modification_timestamp: m.ModificationTimestamp,
    mirrored_at: new Date().toISOString(),
  };
}

async function upsertProperties(sb: SB, rows: ReturnType<typeof propertyRow>[]) {
  if (rows.length === 0) return;
  const { error } = await sb
    .from('mls_listings')
    .upsert(rows, { onConflict: 'source_system,listing_key' });
  if (error) throw error;
}

async function upsertMedia(sb: SB, rows: ReturnType<typeof mediaRow>[]) {
  if (rows.length === 0) return;
  const { error } = await sb
    .from('mls_media')
    .upsert(rows, { onConflict: 'source_system,media_key' });
  if (error) throw error;
}

async function runSync(args: CliArgs): Promise<void> {
  const client = new BridgeClient();
  await client.authenticate();

  // biome-ignore lint/suspicious/noExplicitAny: see SB type note
  const sb: SB = args.dryRun ? null : createServiceClient();

  let filterRaw = `(${ACTIVE_STATUSES})`;
  if (args.mode === 'incremental' && sb) {
    const watermark = await loadWatermark(sb);
    if (watermark) filterRaw = `${filterRaw} and ModificationTimestamp gt ${watermark}`;
  }

  const filter: ODataFilter = { raw: filterRaw };
  console.error(`[sync] mode=${args.mode} dryRun=${args.dryRun} filter=${filter.raw}`);

  let skip = 0;
  let seen = 0;
  let maxTs: string | null = null;

  while (true) {
    const page = await client.listProperties(filter, PAGE_SIZE, skip);
    if (page.value.length === 0) break;
    seen += page.value.length;

    for (const p of page.value) {
      if (p.ModificationTimestamp && (!maxTs || p.ModificationTimestamp > maxTs)) {
        maxTs = p.ModificationTimestamp;
      }
    }

    if (args.dryRun) {
      console.error(`[sync] DRY page skip=${skip} count=${page.value.length}`);
    } else {
      // biome-ignore lint/style/noNonNullAssertion: sb is non-null when !dryRun
      await upsertProperties(sb!, page.value.map(propertyRow));
      // Fetch media per listing. Serial to respect rate limits.
      for (const p of page.value) {
        const media = await client.getMedia(p.ListingKey);
        // biome-ignore lint/style/noNonNullAssertion: sb is non-null when !dryRun
        await upsertMedia(sb!, media.map(mediaRow));
      }
    }

    if (page.value.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  if (!args.dryRun && maxTs && sb) {
    await saveWatermark(sb, maxTs);
  }

  console.error(`[sync] done seen=${seen} maxTs=${maxTs ?? 'none'}`);
}

// CLI entrypoint. `import.meta.url` check keeps it importable in tests.
const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url === `file://${process.argv[1]}`;

if (isDirectRun) {
  runSync(parseArgs(process.argv.slice(2))).catch((err) => {
    console.error('[sync] fatal', err);
    process.exit(1);
  });
}

export { runSync, parseArgs };
