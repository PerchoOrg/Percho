/**
 * Re-run the home-tour pipeline for every listing that already has a video.
 *
 * Owner 2026-08-21: "lets rerun the current home tour workflow for the ones
 * with videos." Those 15 listings were rendered by the OLD whole-film path, so
 * none of them has been through review → plan → per-photo clips → two-canvas
 * assembly. This walks them through it.
 *
 * Drives the real step functions rather than reimplementing them — a script
 * that re-derives the pipeline is a second pipeline that will drift.
 *
 * Idempotent by construction. Tagging is skipped when every photo is tagged,
 * clips are reused unless their render_key changed, and a Seedance clip is
 * NEVER re-billed: `runGenerate`'s bulk path leaves paid clips alone, and this
 * script never passes `force`.
 *
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/rerun-home-tours.ts [--dry-run]
 */
import { createClient } from '@supabase/supabase-js';
import { runAssembleAllSurfaces } from '../../apps/web/lib/poi/listing-tour-steps/assemble';
import { runGenerateAllSurfaces } from '../../apps/web/lib/poi/listing-tour-steps/generate';
import {
  type ListingRunRow,
  type TourDb,
  getListingRun,
  plannedShots,
} from '../../apps/web/lib/poi/listing-tour-steps/shared';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY)
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');

const DRY = process.argv.includes('--dry-run');
const sb = createClient(URL, KEY) as unknown as TourDb;

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Listings with a ready walkthrough, still active, that have photos to work with. */
async function targets(): Promise<Array<{ id: string; address: string; photos: number }>> {
  const { data: vids } = await sb
    .from('listing_videos')
    .select('listing_id')
    .eq('kind', 'walkthrough')
    .eq('status', 'ready');
  const ids = [...new Set((vids ?? []).map((v) => (v as { listing_id: string }).listing_id))];
  if (ids.length === 0) return [];

  const { data: rows } = await sb
    .from('listings')
    .select('id, address')
    .in('id', ids)
    .eq('status', 'active');

  const out: Array<{ id: string; address: string; photos: number }> = [];
  for (const l of (rows ?? []) as Array<{ id: string; address: string }>) {
    const { count } = await sb
      .from('listing_photos')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', l.id);
    // Two shots is the floor the assembler enforces; below that the film
    // cannot be built and queueing the work would only produce a failure.
    if ((count ?? 0) >= 3) out.push({ id: l.id, address: l.address, photos: count ?? 0 });
    else log(`SKIP ${l.address} — ${count ?? 0} photo(s), too few for a film`);
  }
  return out;
}

async function freshRun(listingId: string): Promise<ListingRunRow> {
  const { data, error } = await sb
    .from('listing_tour_runs')
    .insert({ listing_id: listingId, status: 'planning' })
    .select('id, listing_id, status, step_results')
    .single();
  if (error) throw new Error(`run insert: ${(error as { message: string }).message}`);
  return data as ListingRunRow;
}

/** Queue the Python-side plan step and wait for the worker to write it back. */
async function planAndWait(run: ListingRunRow, timeoutMs = 15 * 60_000): Promise<number> {
  await sb.from('render_jobs').insert({
    listing_id: run.listing_id,
    run_id: run.id,
    step: 'plan',
    status: 'queued',
    video_row_id: null,
  });
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    await sleep(10_000);
    const fresh = await getListingRun(sb, run.id);
    if (!fresh) throw new Error('run vanished');
    const shots = plannedShots(fresh);
    if (shots.length > 0) return shots.length;
    const plan = fresh.step_results.plan as { error?: string } | undefined;
    if (plan?.error) throw new Error(`plan failed: ${plan.error}`);
  }
  throw new Error('plan timed out');
}

/** Wait until every planned shot has a ready clip on both canvases. */
async function clipsReady(run: ListingRunRow, timeoutMs = 90 * 60_000): Promise<void> {
  const fresh = await getListingRun(sb, run.id);
  const ids = [...new Set(plannedShots(fresh as ListingRunRow).map((s) => s.photo_id))];
  const until = Date.now() + timeoutMs;
  let lastReady = -1;
  while (Date.now() < until) {
    const { data } = await sb
      .from('listing_photo_clips')
      .select('listing_photo_id, surface, status')
      .in('listing_photo_id', ids);
    const rows = (data ?? []) as Array<{
      listing_photo_id: string;
      surface: string;
      status: string;
    }>;
    const ready = new Set(
      rows.filter((r) => r.status === 'ready').map((r) => `${r.listing_photo_id}:${r.surface}`),
    );
    const want = ids.length * 2;
    if (ready.size >= want) return;
    // A clip that failed will never become ready; waiting the full timeout for
    // it wastes an hour and tells nobody anything.
    const dead = rows.filter((r) => r.status === 'failed').length;
    if (ready.size !== lastReady) {
      log(`    clips ${ready.size}/${want}${dead ? ` (${dead} failed)` : ''}`);
      lastReady = ready.size;
    }
    const pending = rows.filter((r) => r.status === 'pending' || r.status === 'processing').length;
    if (pending === 0) {
      log(`    no clips in flight; proceeding with ${ready.size}/${want}`);
      return;
    }
    await sleep(20_000);
  }
  log('    clip wait timed out; assembling with what is ready');
}

async function main() {
  const list = await targets();
  log(`${list.length} listing(s) to re-run${DRY ? ' (dry run)' : ''}`);
  for (const t of list) log(`  ${t.address} — ${t.photos} photos`);
  if (DRY) return;

  const done: string[] = [];
  const failed: Array<{ address: string; why: string }> = [];

  for (const [i, t] of list.entries()) {
    log(`\n[${i + 1}/${list.length}] ${t.address}`);
    try {
      const run = await freshRun(t.id);
      const shots = await planAndWait(run);
      log(`    planned ${shots} shots`);

      const fresh = (await getListingRun(sb, run.id)) as ListingRunRow;
      const gen = (await runGenerateAllSurfaces(sb, fresh)) as {
        queued?: number;
        reused?: number;
        error?: string;
        message?: string;
      };
      if (gen.error) throw new Error(gen.message ?? gen.error);
      log(`    queued ${gen.queued ?? 0} clips, reused ${gen.reused ?? 0}`);

      await clipsReady(fresh);

      const latest = (await getListingRun(sb, run.id)) as ListingRunRow;
      const asm = (await runAssembleAllSurfaces(sb, latest, true)) as {
        error?: string;
        message?: string;
        notReady?: number;
      };
      if (asm.error) throw new Error(asm.message ?? asm.error);
      log(`    assembling both cuts${asm.notReady ? ` (${asm.notReady} shot(s) short)` : ''}`);
      done.push(t.address);
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      log(`    FAILED: ${why}`);
      failed.push({ address: t.address, why });
    }
  }

  log(`\ndone: ${done.length}, failed: ${failed.length}`);
  for (const f of failed) log(`  ${f.address}: ${f.why}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
