/**
 * hero-model-probe — render ONE listing's hero clip on a different Seedance
 * model / resolution, without touching the database or the tour.
 *
 * Owner 2026-08-23, on 2895 Shurburne Drive: "the outcome is not very good, i
 * want to see what i can get from a more advanced model ... just for this one
 * photo only." A probe, not a pipeline switch: nothing here writes to
 * `listing_photo_clips`, storage, or Cloudflare. The mp4 lands on disk.
 *
 * It reads the SAME inputs the seedance worker would (the clip row's stored
 * prompt, the same photo file, the same frames-mode pairing) and calls the
 * same `submitVideo`, so the only variable is the model and the resolution.
 *
 * Usage — dry run prints what it WOULD send and spends nothing:
 *
 *   pnpm tsx scripts/admin/hero-model-probe.ts <listing-id>
 *   pnpm tsx scripts/admin/hero-model-probe.ts <listing-id> \
 *     --model bytedance/seedance-2.0 --resolution 720p --run
 *
 * Options: --model, --resolution, --duration, --aspect, --prompt "...",
 *          --out <path>, --run (actually spend money).
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadEnv } from '../seedance-worker/loadEnv.js';

const PHOTO_BUCKET = 'listing-photos';
const POLL_MS = 10_000;
const MAX_POLLS = 90; // 15 minutes

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

type PhotoRow = {
  id: string;
  storage_path: string;
  enhanced_path: string | null;
  enhanced_status: string;
};

/** Same rule the seedance worker applies: approved enhanced file, else original. */
function renderPhotoPath(p: PhotoRow): string {
  return p.enhanced_status === 'approved' && p.enhanced_path ? p.enhanced_path : p.storage_path;
}

async function main(): Promise<void> {
  // Env first, then the modules that read it — hence the dynamic imports.
  loadEnv();
  const { downloadVideo, pollVideo, submitVideo, SEEDANCE_MODEL } = await import(
    '../../apps/web/lib/ai/openrouter-video.js'
  );
  const { createServiceClient } = await import('../../apps/web/lib/supabase/server.js');

  const listingId = process.argv[2];
  if (!listingId || listingId.startsWith('--')) {
    throw new Error('usage: hero-model-probe.ts <listing-id> [--model X] [--resolution 720p] [--run]');
  }
  const model = arg('model') ?? SEEDANCE_MODEL;
  const resolution = arg('resolution') ?? '480p';
  const run = process.argv.includes('--run');

  const sb = createServiceClient();

  const { data: photos, error: pErr } = await sb
    .from('listing_photos')
    .select('id, storage_path, enhanced_path, enhanced_status, sort_order')
    .eq('listing_id', listingId)
    .order('sort_order', { ascending: true });
  if (pErr) throw new Error(`listing_photos: ${pErr.message}`);
  if (!photos?.length) throw new Error(`listing ${listingId} has no photos`);
  const byId = new Map(photos.map((p) => [p.id as string, p as unknown as PhotoRow]));

  const { data: clips, error: cErr } = await sb
    .from('listing_photo_clips')
    .select('id, listing_photo_id, surface, prompt, duration_s, pair_photo_id, pair_role, status, created_at')
    .in('listing_photo_id', [...byId.keys()])
    .eq('engine', 'seedance')
    .order('created_at', { ascending: false });
  if (cErr) throw new Error(`listing_photo_clips: ${cErr.message}`);
  const clip = clips?.find((c) => c.surface === 'ios') ?? clips?.[0];
  if (!clip) throw new Error(`listing ${listingId} has no seedance clip row to copy inputs from`);

  const hero = byId.get(clip.listing_photo_id as string);
  if (!hero) throw new Error(`hero photo ${clip.listing_photo_id} not in this listing`);

  const publicBase = sb.storage
    .from(PHOTO_BUCKET)
    .getPublicUrl('__probe__')
    .data.publicUrl.replace('/__probe__', '');

  const prompt = arg('prompt') ?? (clip.prompt as string | null);
  if (!prompt) throw new Error('clip row has no prompt and none was passed with --prompt');

  const heroUrl = `${publicBase}/${renderPhotoPath(hero)}`;
  let frameUrls = [heroUrl];
  const pairId = clip.pair_photo_id as string | null;
  const pairRole = clip.pair_role as string | null;
  if (pairId && (pairRole === 'first' || pairRole === 'last')) {
    const pair = byId.get(pairId);
    if (!pair) throw new Error(`pair photo ${pairId} not in this listing`);
    const pairUrl = `${publicBase}/${renderPhotoPath(pair)}`;
    frameUrls = pairRole === 'first' ? [pairUrl, heroUrl] : [heroUrl, pairUrl];
  }

  const durationS = Number(arg('duration') ?? clip.duration_s ?? 4);
  const aspectRatio = arg('aspect') ?? '3:4';
  const out = arg('out') ?? path.resolve(`hero-probe-${model.split('/').pop()}-${resolution}.mp4`);

  console.log('listing      ', listingId);
  console.log('hero photo   ', hero.id);
  console.log('file sent    ', renderPhotoPath(hero), hero.enhanced_status === 'approved' ? '(enhanced)' : '(original)');
  console.log('pair         ', pairId ? `${pairId} (${pairRole})` : 'none');
  console.log('model        ', model);
  console.log('resolution   ', resolution);
  console.log('aspect       ', aspectRatio);
  console.log('duration     ', durationS);
  console.log('clip row     ', clip.id, `status=${clip.status}`, `created=${clip.created_at}`);
  console.log('prompt       ', prompt);
  console.log('out          ', out);

  if (!run) {
    console.log('\nDRY RUN — nothing submitted, nothing spent. Re-run with --run to generate.');
    return;
  }

  console.log('\nsubmitting…');
  const job = await submitVideo({
    prompt,
    frameImageUrls: frameUrls,
    durationS,
    aspectRatio,
    mode: 'frames',
    model,
    resolution,
  });
  console.log('job', job.id);

  for (let i = 0; i < MAX_POLLS; i += 1) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const state = await pollVideo(job.pollingUrl);
    if (state.status === 'processing') {
      process.stdout.write('.');
      continue;
    }
    if (state.status === 'failed') throw new Error(`generation failed: ${state.error}`);
    const bytes = await downloadVideo(state.videoUrl);
    await writeFile(out, Buffer.from(bytes));
    console.log(`\nready → ${out}`);
    console.log('cost  ', state.costUsd === null ? 'not reported' : `$${state.costUsd.toFixed(4)}`);
    return;
  }
  throw new Error('timed out waiting for the provider');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
