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
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
loadEnv({ path: path.join(repoRoot, '.env.local') });

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
  const { error: upErr } = await sb.storage
    .from(AI_VIDEO_BUCKET)
    .upload(storagePath, mp4, { contentType: 'video/mp4', upsert: true });
  if (upErr) throw new Error(`storage upload failed: ${(upErr as { message: string }).message}`);

  await sb
    .from('ai_tour_videos')
    .update({
      status: 'ready',
      storage_path: storagePath,
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
}

log('worker starting');
setInterval(tick, POLL_DB_MS);
tick().catch((err) => log('tick error', err));
