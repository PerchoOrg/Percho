import { createClient } from '@supabase/supabase-js';
import { runAssembleAllSurfaces } from '@/lib/poi/listing-tour-steps/assemble';
import { runGenerateAllSurfaces } from '@/lib/poi/listing-tour-steps/generate';
import { type ListingRunRow, type TourDb, getListingRun } from '@/lib/poi/listing-tour-steps/shared';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
) as unknown as TourDb;
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { data: l } = await sb
    .from('listings')
    .select('id')
    .eq('address', '2125 Melrose Trace')
    .single();
  const listingId = (l as { id: string }).id;

  const { data: runs } = await sb
    .from('listing_tour_runs')
    .select('id, listing_id, status, step_results')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })
    .limit(1);
  const run = (runs as ListingRunRow[])[0];
  if (!run) throw new Error('no run');

  // The failed row is `dead` to enqueueClips, so a plain generate requeues it.
  // Nothing else is touched: matching render_keys are reused and the paid hero
  // is left alone.
  const gen = (await runGenerateAllSurfaces(sb, run)) as {
    queued?: number;
    requeued?: number;
    reused?: number;
  };
  log(`requeued ${gen.requeued ?? 0}, queued ${gen.queued ?? 0}, reused ${gen.reused ?? 0}`);

  for (let i = 0; i < 60; i++) {
    await sleep(10_000);
    const { data } = await sb
      .from('listing_photo_clips')
      .select('status')
      .eq('surface', 'web')
      .in('status', ['pending', 'processing']);
    const busy = (data ?? []).length;
    if (busy === 0) break;
    if (i % 3 === 0) log(`  ${busy} web clip(s) still in flight`);
  }

  const latest = (await getListingRun(sb, run.id)) as ListingRunRow;
  const asm = (await runAssembleAllSurfaces(sb, latest, true)) as {
    notReady?: number;
    message?: string;
  };
  log(`re-assembled${asm.notReady ? ` — still ${asm.notReady} short` : ' — full shot list'}`);
  if (asm.message) log(`  ${asm.message}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
