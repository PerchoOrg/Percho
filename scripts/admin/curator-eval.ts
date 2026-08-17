/**
 * Curator evaluation — scores one Curator batch call against the hand baseline.
 *
 * Spec §9 Phase 2 acceptance:
 *   - the whole batch completes in ONE call, first-parse success ≥ 90%
 *   - dominant_subject / people_prominence / has_readable_brand_signage agree
 *     with the human annotation ≥ 85% (those three drive the Guard downgrades)
 *   - exactly one opener and exactly one closer
 *
 * Reads the golden fixture's photo ids straight from poi_photos, so it scores
 * the model on the same 14 frames the hand baseline describes.
 *
 * Usage:
 *   pnpm --filter @percho/web curator-eval [runs]
 *
 * Env (repo-root .env.local): NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY.
 *
 * Costs money (Gemini Flash Lite, ~14 images per run). Not wired to anything —
 * this is an offline measurement, run by hand.
 */

import { createClient } from '@supabase/supabase-js';
import {
  CURATOR_MODEL,
  type CuratorPhoto,
  curateBatch,
} from '../../apps/web/lib/poi/tour-orchestrator/curator.js';
import {
  GOLDEN_ANNOTATIONS,
  GOLDEN_PHOTOS,
} from '../../apps/web/lib/poi/tour-orchestrator/fixtures/peachtree-corners.js';
import { guardClips } from '../../apps/web/lib/poi/tour-orchestrator/guard.js';
import { scheduleClips } from '../../apps/web/lib/poi/tour-orchestrator/scheduler.js';
import type { PhotoAnnotation } from '../../apps/web/lib/poi/tour-orchestrator/types.js';
import { loadEnv } from '../seedance-worker/loadEnv.js';

loadEnv();

const PHOTO_BUCKET = 'listing-photos';
/** The three fields the Guard's downgrades hang on. */
const SCORED_FIELDS = [
  'dominant_subject',
  'people_prominence',
  'has_readable_brand_signage',
] as const satisfies readonly (keyof PhotoAnnotation)[];

async function loadPhotos(): Promise<CuratorPhoto[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE url/service role key not set');
  const sb = createClient(url, key);

  const ids = GOLDEN_PHOTOS.map((p) => p.photo_id);
  const { data, error } = await sb.from('poi_photos').select('id, storage_path').in('id', ids);
  if (error) throw new Error(`poi_photos read failed: ${error.message}`);
  const pathById = new Map((data ?? []).map((r) => [r.id as string, r.storage_path as string]));

  const photos: CuratorPhoto[] = [];
  for (const meta of GOLDEN_PHOTOS) {
    const path = pathById.get(meta.photo_id);
    if (!path) throw new Error(`photo ${meta.photo_id} missing from poi_photos`);
    const { data: blob, error: dlErr } = await sb.storage.from(PHOTO_BUCKET).download(path);
    if (dlErr || !blob) throw new Error(`download ${path} failed: ${dlErr?.message}`);
    photos.push({
      photo_id: meta.photo_id,
      poi_name: meta.poi_name,
      bucket: meta.bucket,
      width_px: meta.width_px,
      height_px: meta.height_px,
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mime_type: 'image/jpeg',
    });
  }
  return photos;
}

function scoreAgainstBaseline(annotations: PhotoAnnotation[]): {
  perField: Record<string, { agree: number; total: number }>;
  disagreements: string[];
} {
  const baseline = new Map(GOLDEN_ANNOTATIONS.map((a) => [a.photo_id, a]));
  const perField: Record<string, { agree: number; total: number }> = {};
  for (const f of SCORED_FIELDS) perField[f] = { agree: 0, total: 0 };
  const disagreements: string[] = [];

  for (const a of annotations) {
    const truth = baseline.get(a.photo_id);
    if (!truth) continue;
    const name = GOLDEN_PHOTOS.find((p) => p.photo_id === a.photo_id)?.poi_name ?? a.photo_id;
    for (const field of SCORED_FIELDS) {
      const slot = perField[field]!;
      slot.total += 1;
      if (a[field] === truth[field]) slot.agree += 1;
      else disagreements.push(`${name} · ${field}: model=${a[field]} baseline=${truth[field]}`);
    }
  }
  return { perField, disagreements };
}

async function main(): Promise<void> {
  const runs = Number.parseInt(process.argv[2] ?? '1', 10);
  console.log(`[curator-eval] model=${CURATOR_MODEL} runs=${runs}`);
  const photos = await loadPhotos();
  const mb = photos.reduce((n, p) => n + p.bytes.byteLength, 0) / 1024 / 1024;
  console.log(`[curator-eval] ${photos.length} photos, ${mb.toFixed(1)} MB`);

  let firstParse = 0;
  const agree: Record<string, { agree: number; total: number }> = {};
  for (const f of SCORED_FIELDS) agree[f] = { agree: 0, total: 0 };

  for (let run = 1; run <= runs; run++) {
    const started = Date.now();
    const result = await curateBatch(photos);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (result.attempts === 1) firstParse += 1;

    const openers = result.annotations.filter((a) => a.narrative_role === 'opener').length;
    const closers = result.annotations.filter((a) => a.narrative_role === 'closer').length;
    const { perField, disagreements } = scoreAgainstBaseline(result.annotations);
    for (const f of SCORED_FIELDS) {
      agree[f]!.agree += perField[f]!.agree;
      agree[f]!.total += perField[f]!.total;
    }

    console.log(
      `\n[run ${run}] ${seconds}s attempts=${result.attempts} annotated=${result.annotations.length}/${photos.length}` +
        ` missing=${result.missing.length} unknown=${result.unknown.length}` +
        ` opener=${openers} closer=${closers} warnings=${result.warnings.length}`,
    );
    for (const w of result.warnings) console.log(`  warn ${w.code}: ${w.detail}`);
    for (const d of disagreements) console.log(`  diff ${d}`);

    if (run === runs) {
      const plan = scheduleClips(result.annotations, GOLDEN_PHOTOS);
      const guardResult = guardClips(plan.clips, result.annotations, GOLDEN_PHOTOS);
      console.log('\n[plan from model annotations]');
      let total = 0;
      for (const c of guardResult.clips) {
        total += c.duration_s;
        console.log(
          `  ${String(c.sort_order + 1).padStart(2, '0')} ${c.poi_name.slice(0, 26).padEnd(26)} ` +
            `${c.engine.padEnd(9)} ${c.move.padEnd(14)} ${c.duration_s.toFixed(1)}s`,
        );
      }
      console.log(`  total ${total.toFixed(1)}s`);
      for (const w of plan.warnings) console.log(`  plan-warn ${w.code}: ${w.detail}`);
      for (const v of guardResult.violations) console.log(`  violation ${v.code}: ${v.detail}`);
    }
  }

  console.log('\n[curator-eval] summary');
  console.log(`  first-parse success: ${((firstParse / runs) * 100).toFixed(0)}% (target ≥90%)`);
  for (const f of SCORED_FIELDS) {
    const { agree: a, total } = agree[f]!;
    console.log(`  ${f}: ${((a / total) * 100).toFixed(0)}% (target ≥85%)`);
  }
}

main().catch((err) => {
  console.error('[curator-eval] failed:', err);
  process.exit(1);
});
