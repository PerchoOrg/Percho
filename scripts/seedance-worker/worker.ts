/**
 * Seedance AI-video worker — local long-running process (render-worker
 * pattern, owner 2026-08-15).
 *
 * The WEB (Vercel or localhost) only enqueues rows into `ai_tour_videos`
 * (POST) and reads status (GET). This worker owns the OPENROUTER_API_KEY
 * (read from repo-root .env.local) and does the actual generation:
 *
 *   poll ai_tour_videos WHERE status IN (pending, processing)
 *   → pending:   claim (atomic UPDATE), upload nothing (photos are public
 *                Supabase URLs), submitVideo with all frames, save polling_url
 *   → processing: pollVideo; on completed download mp4 → Supabase Storage
 *                (ai-videos bucket) → status ready
 *
 * Run: pnpm --filter @percho/web seedance-worker   (or tsx directly)
 * Install as launchd agent for always-on (see scripts/seedance-worker/README).
 */
import { config as loadEnv } from 'dotenv';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
loadEnv({ path: path.join(repoRoot, '.env.local') });

/**
 * Re-encode a Seedance mp4 into a stream-friendly one: moov at the front
 * (faststart) and a sane bitrate. Seedance ships 720p at ~15Mbps with moov
 * at the tail — fine on desktop, stutters on iOS (player waits for moov,
 * then decodes a huge stream). CRF 26 on 720p lands ~2-4Mbps.
 */
async function transcodeForStreaming(src: ArrayBuffer): Promise<ArrayBuffer> {
  const dir = await mkdtemp(path.join(tmpdir(), 'seedance-'));
  const inPath = path.join(dir, 'in.mp4');
  const outPath = path.join(dir, 'out.mp4');
  try {
    await writeFile(inPath, Buffer.from(src));
    await execFileP('ffmpeg', [
      '-y',
      '-i', inPath,
      '-c:v', 'libx264',
      '-crf', '26',
      '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outPath,
    ], { timeout: 120_000, maxBuffer: 64 * 1024 * 1024 });
    const out = await readFile(outPath);
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

import {
  SEEDANCE_MODEL,
  downloadVideo,
  pollVideo,
  submitVideo,
} from '../../apps/web/lib/ai/openrouter-video.js';
import { createServiceClient } from '../../apps/web/lib/supabase/server.js';
import { AI_VIDEO_ASPECT, AI_VIDEO_BUCKET } from '../../apps/web/lib/poi/ai-tour-video.js';

const PHOTO_BUCKET = 'listing-photos';
const POLL_DB_MS = 10_000; // how often we scan for work
const MAX_JOBS_PER_TICK = 1; // one at a time — generation is minutes long
const STALE_PROCESSING_MS = 30 * 60 * 1000; // a job stuck processing this long = retry

type Row = {
  id: string;
  community_id: string;
  input_photo_ids: string[];
  prompt: string;
  duration_s: number;
  aspect_ratio: string;
  status: string;
  polling_url: string | null;
  storage_path: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

// biome-ignore lint/suspicious/noExplicitAny: stub generated types
const sb = createServiceClient() as any;

function log(...args: unknown[]) {
  console.log(`[seedance-worker ${new Date().toISOString()}]`, ...args);
}

/** Atomic pending → submitting. False = another worker got it first. */
// biome-ignore lint/suspicious/noExplicitAny: stub generated types
async function claim(id: string): Promise<boolean> {
  const { data } = (await sb
    .from('ai_tour_videos')
    .update({ status: 'submitting', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')) as { data: Array<{ id: string }> | null };
  return (data ?? []).length > 0;
}

// biome-ignore lint/suspicious/noExplicitAny: stub generated types
async function fail(id: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  log('fail', id, message.slice(0, 300));
  await sb
    .from('ai_tour_videos')
    .update({ status: 'failed', error: message.slice(0, 500), updated_at: new Date().toISOString() })
    .eq('id', id);
}

// biome-ignore lint/suspicious/noExplicitAny: stub generated types
async function submitClip(row: Row): Promise<void> {
  const { data: photos } = (await sb
    .from('poi_photos')
    .select('id, storage_path, enhanced_path, enhanced_status')
    .in('id', row.input_photo_ids ?? [])) as {
    data: Array<{
      id: string;
      storage_path: string;
      enhanced_path: string | null;
      enhanced_status: string;
    }> | null;
  };
  const photoMap = new Map((photos ?? []).map((p) => [p.id, p]));
  const missing = (row.input_photo_ids ?? []).filter((id) => !photoMap.has(id));
  if (missing.length > 0) throw new Error(`source photo(s) no longer exist: ${missing.join(', ')}`);

  // Photos are publicly readable in Supabase Storage — pass URLs directly.
  const publicBase = sb.storage.from(PHOTO_BUCKET).getPublicUrl('__probe__').data.publicUrl.replace(
    '/__probe__',
    '',
  );
  // Owner 2026-08-17: seedance AI clips always use the ORIGINAL photo —
  // the enhanced file is for local renders (DA+KB) and the final tour,
  // not for the AI model input.
  const frameUrls: string[] = [];
  for (const id of row.input_photo_ids ?? []) {
    const photo = photoMap.get(id)!;
    frameUrls.push(`${publicBase}/${photo.storage_path}`);
  }

  const job = await submitVideo({
    prompt: row.prompt,
    frameImageUrls: frameUrls,
    durationS: row.duration_s,
    aspectRatio: row.aspect_ratio ?? AI_VIDEO_ASPECT,
  });

  await sb
    .from('ai_tour_videos')
    .update({
      status: 'processing',
      provider_job_id: job.id,
      polling_url: job.pollingUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id);
  log('submitted', row.id, 'job', job.id, `${frameUrls.length} frames`);
}

// biome-ignore lint/suspicious/noExplicitAny: stub generated types
async function finalizeClip(row: Row): Promise<boolean> {
  if (!row.polling_url) throw new Error('processing row has no polling_url');

  const state = await pollVideo(row.polling_url);
  if (state.status === 'processing') return false;
  if (state.status === 'failed') {
    await fail(row.id, state.error);
    return false;
  }

  const mp4 = await downloadVideo(state.videoUrl);
  const storagePath = `${row.community_id}/${row.id}.mp4`;
  // Transcode to a stream-friendly mp4: Seedance output is 15Mbps with moov
  // at the tail — iOS stalls (no faststart + huge bitrate). CRF 26 keeps a
  // 720p clip crisp at ~2-4Mbps; faststart moves moov to the front so the
  // player can start immediately.
  const transcode = await transcodeForStreaming(mp4);
  const { error: upErr } = await sb.storage
    .from(AI_VIDEO_BUCKET)
    .upload(storagePath, transcode, { contentType: 'video/mp4', upsert: true });
  if (upErr) throw new Error(`storage upload failed: ${(upErr as { message: string }).message}`);

  await sb
    .from('ai_tour_videos')
    .update({
      status: 'ready',
      storage_path: storagePath,
      cost_usd: state.costUsd,
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id);
  log('ready', row.id, storagePath);
  return true;
}

async function tick(): Promise<void> {
  if (!process.env.OPENROUTER_API_KEY) {
    log('OPENROUTER_API_KEY not set — idle');
    return;
  }
  const tickStart = Date.now();

  // ── ai_tour_videos (existing multi-photo path) ──
  const { data } = (await sb
    .from('ai_tour_videos')
    .select('*')
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: true })
    .limit(20)) as { data: Row[] | null };

  let done = 0;
  for (const row of data ?? []) {
    if (done >= MAX_JOBS_PER_TICK) break;
    try {
      if (row.status === 'pending') {
        if (await claim(row.id)) {
          await submitClip(row);
          done += 1;
        }
      } else {
        // processing: only finalize if the job isn't stale (or if it has a
        // polling_url). A stale processing row with no polling_url (crashed
        // mid-submit) gets reset to pending so the next tick re-submits.
        if (!row.polling_url) {
          const ageMs = Date.now() - new Date(row.updated_at).getTime();
          if (ageMs > STALE_PROCESSING_MS) {
            await sb
              .from('ai_tour_videos')
              .update({ status: 'pending', updated_at: new Date().toISOString() })
              .eq('id', row.id);
            log('reset stale processing -> pending', row.id);
          }
          continue;
        }
        if (await finalizeClip(row)) done += 1;
      }
    } catch (err) {
      await fail(row.id, err);
    }
  }

  // ── per-photo clip caches, community then home ──
  //
  // Community first, and the budget is SHARED: these are paid OpenRouter jobs
  // and the per-tick cap exists to stop the worker running several minutes-long
  // generations at once. Giving the home queue its own cap would quietly double
  // the spend rate.
  if (done >= MAX_JOBS_PER_TICK) return;
  done += await processClipQueue(COMMUNITY_CLIPS, MAX_JOBS_PER_TICK - done);
  done += await processClipQueue(HOME_CLIPS, MAX_JOBS_PER_TICK - done);
  log('tick done', Date.now() - tickStart, 'ms', done, 'jobs');
}

/**
 * A row from either clip table.
 *
 * The two carry the same job under different column names — `photo_clips`
 * keys on `photo_id` into `poi_photos`, `listing_photo_clips` on
 * `listing_photo_id` into `listing_photos` — so the fields that differ are
 * optional here and normalised at the top of the loop rather than forking it.
 */
type PhotoClipRow = {
  id: string;
  photo_id?: string;
  listing_photo_id?: string;
  /** Home-tour clips only: which canvas the clip is for. */
  surface?: string;
  engine: string;
  duration_s: number;
  status: string;
  polling_url: string | null;
  storage_path: string | null;
  updated_at: string;
  /** Built by the tour Guard, mandatory clauses included. Null on old rows. */
  prompt: string | null;
  /** Birdview hero only: the REAL aerial photo anchoring the clip's other end. */
  pair_photo_id?: string | null;
  /** Where the pair sits: 'first' (descend opens on it) or 'last' (rise closes on it). */
  pair_role?: string | null;
};

/**
 * Used only when a row predates the orchestrator (2026-08-17) and carries no
 * prompt of its own. It says nothing about who is in the frame because nothing
 * here knows: with no annotation, the safe assumption is that no person may be
 * generated. It also avoids fast / cinematic / epic / dramatic / dynamic —
 * those bind tightly to a dolly-in and are why every clip used to zoom in.
 */
const FALLBACK_CLIP_PROMPT =
  'The scene animates only where it naturally moves; everything else stays completely still. ' +
  'Camera drifts forward very slowly and smoothly. ' +
  'No people appear in the frame. Storefront signage stays unchanged.';

/**
 * What differs between the two per-photo clip queues.
 *
 * Same idea as `apps/web/lib/poi/entity-scope.ts`: the pipeline is written
 * once and parameterised by entity, because the alternative is two copies of a
 * 130-line loop that bills real money and will drift.
 */
interface ClipScope {
  /** Log prefix, so a line in the worker log says which queue it came from. */
  readonly label: string;
  readonly clipTable: 'photo_clips' | 'listing_photo_clips';
  readonly photoTable: 'poi_photos' | 'listing_photos';
  /** Where the finished mp4 lands in the AI_VIDEO_BUCKET. */
  storagePathFor(photoId: string, row: PhotoClipRow): string;
}

const COMMUNITY_CLIPS: ClipScope = {
  label: 'photo-clip',
  clipTable: 'photo_clips',
  photoTable: 'poi_photos',
  storagePathFor: (photoId) => `clips/${photoId}.mp4`,
};

const HOME_CLIPS: ClipScope = {
  label: 'home-clip',
  clipTable: 'listing_photo_clips',
  photoTable: 'listing_photos',
  // Surface is in the path because the same photo has a different clip per
  // canvas, and the two must not overwrite each other.
  storagePathFor: (photoId, row) => `listing-clips/${photoId}-${row.surface ?? 'ios'}.mp4`,
};

/**
 * Drain one per-photo clip queue.
 *
 * `listing_photo_clips` was added on 2026-08-21 with `engine='seedance'` in its
 * CHECK and a Generate button wired to it, but nothing polling it — a home-tour
 * hero clip sat pending forever. Found by the Worker hub, which listed the
 * queue precisely so an undrained one would show up as stalled rather than as
 * a clip that never appears.
 *
 * Returns how many jobs it advanced, so the paid budget is shared across both
 * queues rather than doubled.
 */
async function processClipQueue(scope: ClipScope, budget: number): Promise<number> {
  if (budget <= 0) return 0;
  // MONEY GUARD (owner 2026-08-17): both clip tables carry depthflow/kenburns
  // rows too, consumed locally by render-worker. This worker must ONLY claim
  // seedance rows — submitting a depthflow/kenburns row here would bill a paid
  // OpenRouter job for something the local render service does free.
  const { data } = (await sb
    .from(scope.clipTable)
    .select('*')
    .in('status', ['pending', 'processing'])
    .eq('engine', 'seedance')
    .order('created_at', { ascending: true })
    .limit(20)) as { data: PhotoClipRow[] | null };

  let done = 0;
  for (const row of data ?? []) {
    if (done >= budget) break;
    // The two tables name the same reference differently — `photo_id` into
    // poi_photos, `listing_photo_id` into listing_photos. Normalised once here
    // rather than forking the loop.
    const photoId = row.photo_id ?? row.listing_photo_id;
    if (!photoId) {
      log(scope.label, 'row', row.id, 'has no photo reference — skipping');
      continue;
    }
    try {
      if (row.status === 'pending') {
        // Atomic claim. Status MUST be in the clip table's CHECK set —
        // ('pending','processing','ready','failed') — 'submitting' is NOT
        // allowed and the constraint violation silently returns 0 rows,
        // leaving the row pending forever (owner 2026-08-16).
        const { data: claimed } = (await sb
          .from(scope.clipTable)
          .update({ status: 'processing', updated_at: new Date().toISOString() })
          .eq('id', row.id)
          .eq('status', 'pending')
          .select('id')) as { data: Array<{ id: string }> | null };
        if ((claimed ?? []).length === 0) continue;

        const { data: photo } = (await sb
          .from(scope.photoTable)
          .select('id, storage_path, enhanced_path, enhanced_status')
          .eq('id', photoId)
          .maybeSingle()) as {
          data: {
            id: string;
            storage_path: string;
            enhanced_path: string | null;
            enhanced_status: string;
          } | null;
        };
        if (!photo) throw new Error(`photo ${photoId} not found`);

        // Original photo for seedance input (owner 2026-08-17) — enhanced
        // files feed DA+KB local renders, not the AI model.
        const publicBase = sb.storage.from(PHOTO_BUCKET).getPublicUrl('__probe__').data.publicUrl.replace(
          '/__probe__',
          '',
        );

        // A birdview hero carries a second REAL photo (the aerial); the pair's
        // role says which end of the clip it anchors. The provider rejects a
        // lone last_frame, so the pair always travels WITH the ground shot.
        const heroUrl = `${publicBase}/${photo.storage_path}`;
        let frameUrls = [heroUrl];
        if (row.pair_photo_id && (row.pair_role === 'first' || row.pair_role === 'last')) {
          const { data: pair } = (await sb
            .from(scope.photoTable)
            .select('storage_path')
            .eq('id', row.pair_photo_id)
            .maybeSingle()) as { data: { storage_path: string } | null };
          if (!pair) throw new Error(`pair photo ${row.pair_photo_id} not found`);
          const pairUrl = `${publicBase}/${pair.storage_path}`;
          frameUrls = row.pair_role === 'first' ? [pairUrl, heroUrl] : [heroUrl, pairUrl];
        }

        // frames mode: first-frame control, plus last-frame when a pair rides along.
        const job = await submitVideo({
          // The prompt is built by the tour Guard (four fixed parts, verbatim
          // mandatory clauses) — this worker never composes or edits one.
          prompt: row.prompt?.trim() || FALLBACK_CLIP_PROMPT,
          frameImageUrls: frameUrls,
          durationS: Math.min(Math.max(Math.round(row.duration_s ?? 4), 4), 15),
          // The generation has to come back in the shape of the canvas it will
          // be cut into. Every clip before 2026-08-21 was for a portrait canvas
          // so the constant was right by accident; a 16:9 home-tour cut asking
          // for 9:16 would be centre-cropped to a sliver at assembly.
          aspectRatio: row.surface === 'web' ? '16:9' : AI_VIDEO_ASPECT,
          mode: 'frames',
        });

        await sb
          .from(scope.clipTable)
          .update({
            status: 'processing',
            provider_job_id: job.id,
            polling_url: job.pollingUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        log(scope.label, 'submitted', row.id, 'job', job.id);
      } else {
        if (!row.polling_url) {
          const ageMs = Date.now() - new Date(row.updated_at).getTime();
          if (ageMs > STALE_PROCESSING_MS) {
            await sb
              .from(scope.clipTable)
              .update({ status: 'pending', updated_at: new Date().toISOString() })
              .eq('id', row.id);
            log('reset stale', scope.label, '-> pending', row.id);
          }
          continue;
        }
        const state = await pollVideo(row.polling_url);
        if (state.status === 'processing') continue;
        if (state.status === 'failed') {
          await sb
            .from(scope.clipTable)
            .update({ status: 'failed', error: state.error.slice(0, 500), updated_at: new Date().toISOString() })
            .eq('id', row.id);
          log(scope.label, 'failed', row.id, state.error.slice(0, 200));
          continue;
        }
        const mp4 = await downloadVideo(state.videoUrl);
        const storagePath = scope.storagePathFor(photoId, row);
        const transcode = await transcodeForStreaming(mp4);
        const { error: upErr } = await sb.storage
          .from(AI_VIDEO_BUCKET)
          .upload(storagePath, transcode, { contentType: 'video/mp4', upsert: true });
        if (upErr) throw new Error(`storage upload failed: ${(upErr as { message: string }).message}`);
        await sb
          .from(scope.clipTable)
          .update({
            status: 'ready',
            storage_path: storagePath,
            cost_usd: state.costUsd,
            error: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        log(scope.label, 'ready', row.id, storagePath);
      }
      done += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(scope.label, 'error', row.id, message.slice(0, 300));
      await sb
        .from(scope.clipTable)
        .update({ status: 'failed', error: message.slice(0, 500), updated_at: new Date().toISOString() })
        .eq('id', row.id);
    }
  }
  return done;
}

log('worker starting');
let ticking = false;
setInterval(async () => {
  if (ticking) return;
  ticking = true;
  try {
    await tick();
  } catch (err) {
    log('tick error', err instanceof Error ? err.message : String(err));
  } finally {
    ticking = false;
  }
}, POLL_DB_MS);
void tick().catch((err) => log('tick error', err));
