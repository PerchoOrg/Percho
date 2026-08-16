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
  const frameUrls: string[] = [];
  for (const id of row.input_photo_ids ?? []) {
    const photo = photoMap.get(id)!;
    const path =
      photo.enhanced_status === 'approved' && photo.enhanced_path
        ? photo.enhanced_path
        : photo.storage_path;
    frameUrls.push(`${publicBase}/${path}`);
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

  // ── photo_clips (per-photo cache, single-photo jobs) ──
  if (done >= MAX_JOBS_PER_TICK) return;
  await processPhotoClips();
  log('tick done', Date.now() - tickStart, 'ms', done, 'jobs');
}

type PhotoClipRow = {
  id: string;
  photo_id: string;
  engine: string;
  duration_s: number;
  status: string;
  polling_url: string | null;
  storage_path: string | null;
  updated_at: string;
};

async function processPhotoClips(): Promise<void> {
  const { data } = (await sb
    .from('photo_clips')
    .select('*')
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: true })
    .limit(20)) as { data: PhotoClipRow[] | null };

  let done = 0;
  for (const row of data ?? []) {
    if (done >= MAX_JOBS_PER_TICK) break;
    try {
      if (row.status === 'pending') {
        // Atomic claim
        const { data: claimed } = (await sb
          .from('photo_clips')
          .update({ status: 'submitting', updated_at: new Date().toISOString() })
          .eq('id', row.id)
          .eq('status', 'pending')
          .select('id')) as { data: Array<{ id: string }> | null };
        if ((claimed ?? []).length === 0) continue;

        const { data: photo } = (await sb
          .from('poi_photos')
          .select('id, storage_path, enhanced_path, enhanced_status')
          .eq('id', row.photo_id)
          .maybeSingle()) as {
          data: {
            id: string;
            storage_path: string;
            enhanced_path: string | null;
            enhanced_status: string;
          } | null;
        };
        if (!photo) throw new Error(`photo ${row.photo_id} not found`);

        const path =
          photo.enhanced_status === 'approved' && photo.enhanced_path
            ? photo.enhanced_path
            : photo.storage_path;
        const publicBase = sb.storage.from(PHOTO_BUCKET).getPublicUrl('__probe__').data.publicUrl.replace(
          '/__probe__',
          '',
        );

        // Single photo → first-frame control (no inter-frame geometry risk).
        const job = await submitVideo({
          prompt: 'A slow, cinematic push-in on this scene. Warm natural light. No text, no people in close-up.',
          frameImageUrls: [`${publicBase}/${path}`],
          durationS: Math.min(Math.max(Math.round(row.duration_s ?? 4), 4), 15),
          aspectRatio: AI_VIDEO_ASPECT,
          mode: 'frames',
        });

        await sb
          .from('photo_clips')
          .update({
            status: 'processing',
            provider_job_id: job.id,
            polling_url: job.pollingUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        log('photo-clip submitted', row.id, 'job', job.id);
      } else {
        if (!row.polling_url) {
          const ageMs = Date.now() - new Date(row.updated_at).getTime();
          if (ageMs > STALE_PROCESSING_MS) {
            await sb
              .from('photo_clips')
              .update({ status: 'pending', updated_at: new Date().toISOString() })
              .eq('id', row.id);
            log('reset stale photo-clip -> pending', row.id);
          }
          continue;
        }
        const state = await pollVideo(row.polling_url);
        if (state.status === 'processing') continue;
        if (state.status === 'failed') {
          await sb
            .from('photo_clips')
            .update({ status: 'failed', error: state.error.slice(0, 500), updated_at: new Date().toISOString() })
            .eq('id', row.id);
          log('photo-clip failed', row.id, state.error.slice(0, 200));
          continue;
        }
        const mp4 = await downloadVideo(state.videoUrl);
        const storagePath = `clips/${row.photo_id}.mp4`;
        const transcode = await transcodeForStreaming(mp4);
        const { error: upErr } = await sb.storage
          .from(AI_VIDEO_BUCKET)
          .upload(storagePath, transcode, { contentType: 'video/mp4', upsert: true });
        if (upErr) throw new Error(`storage upload failed: ${(upErr as { message: string }).message}`);
        await sb
          .from('photo_clips')
          .update({
            status: 'ready',
            storage_path: storagePath,
            cost_usd: state.costUsd,
            error: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        log('photo-clip ready', row.id, storagePath);
      }
      done += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log('photo-clip error', row.id, message.slice(0, 300));
      await sb
        .from('photo_clips')
        .update({ status: 'failed', error: message.slice(0, 500), updated_at: new Date().toISOString() })
        .eq('id', row.id);
    }
  }
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
