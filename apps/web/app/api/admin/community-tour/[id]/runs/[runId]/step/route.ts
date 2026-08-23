/**
 * POST /api/admin/community-tour/[id]/runs/[runId]/step
 *   Execute one pipeline step, persist its output into step_results.
 *
 * Steps (owner-fixed 2026-08-15):
 *   research   — dual Gemini grounding calls (gemini_a/gemini_b). Runs
 *                INLINE on Vercel (plain HTTP to Gemini — no local CLI).
 *                ~5-10s total, under the platform function timeout.
 *   resolve    — Google Places Text Search firewall on agent candidates.
 *   photos     — 3 Places photos per POI the tour has, and the enhance queue.
 *   ingest     — photos from the community's own website and its subpages,
 *                plus any other page the owner ticked.
 *   tag        — a Gemini description for every untagged photo in scope.
 *   filter     — reject what cannot be used. STOPS at phase 'review'.
 *   ——— the owner reviews the approved AND rejected photos by hand ———
 *   plan       — the shot list, from whatever survived that review.
 *   generate   — enqueue photo→clip jobs in photo_clips (seedance worker
 *                picks them up).
 *   assemble   — ffmpeg concat per shot list (photo_clips must all be ready).
 *
 * photos/ingest/tag/filter were ONE step until 2026-08-23 (owner: "we need to
 * split the fetch & tag to 4 steps: fetch from resolved pois, fetch from
 * selected websites, tag selected photos, auto-filtering"). Four jobs sharing
 * one 300s function is why the tag loop needed a clock budget; each has the
 * whole function to itself now.
 *
 * This file is dispatch only. Each step lives in `lib/poi/tour-steps/`; the
 * steps are independent of one another and share `tour-steps/shared.ts`.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { runAssemble } from '@/lib/poi/tour-steps/assemble';
import { runFilter } from '@/lib/poi/tour-steps/filter';
import { runGenerate, runRegenerateAll } from '@/lib/poi/tour-steps/generate';
import { runIngest } from '@/lib/poi/tour-steps/ingest';
import { runPhotos, runPlan } from '@/lib/poi/tour-steps/photos';
import { runResearch } from '@/lib/poi/tour-steps/research';
import { runResolve } from '@/lib/poi/tour-steps/resolve';
import {
  type RunRow,
  type TourDb,
  bestEffortWrite,
  claimActiveStep,
  clearActiveStep,
  getRun,
  saveStep,
  setRunStatus,
} from '@/lib/poi/tour-steps/shared';
import { runTag } from '@/lib/poi/tour-steps/tag';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
// Tag loops Gemini per photo (~3s each); 50 photos = 150s+ > default 60s.
export const maxDuration = 300;

const STEP_HANDLERS: Record<
  string,
  (
    sb: TourDb,
    run: RunRow,
    photoIds?: string[],
    engine?: string,
    approve?: boolean,
  ) => Promise<unknown>
> = {
  research: runResearch,
  resolve: runResolve,
  // Wrapped, not passed directly. `runPhotos`'s third parameter is `actor`,
  // and this registry's third argument is `body.photoIds` — straight from the
  // request. Handing the function over bare would let a client choose to run
  // the step as 'service' and skip the session check. Typecheck caught it;
  // this adapter is what keeps it caught.
  photos: (sb, run) => runPhotos(sb, run),
  ingest: runIngest,
  tag: runTag,
  filter: runFilter,
  // The owner's manual photo review sits between `filter` and `plan`.
  plan: runPlan,
  generate: runGenerate,
  'regenerate-all': runRegenerateAll,
  assemble: runAssemble,
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id: communityId, runId } = await params;
  const sb = createServiceClient();

  const body = (await req.json().catch(() => ({}))) as {
    step?: string;
    photoIds?: string[];
    engine?: string;
    approve?: boolean;
  };
  const step = body.step;
  const handler = step ? STEP_HANDLERS[step] : undefined;
  if (!step || !handler) {
    return NextResponse.json(
      { error: 'invalid_step', message: `Unknown step: ${step}` },
      { status: 400 },
    );
  }

  const run = await getRun(sb, runId);
  if (!run) return NextResponse.json({ error: 'run_not_found' }, { status: 404 });
  if (run.community_id !== communityId) {
    return NextResponse.json({ error: 'run_mismatch' }, { status: 400 });
  }

  // Debug: record the raw engine the client sent (owner 2026-08-17: DA+KB
  // clicks were landing as seedance; need to see if engine reaches the route).
  await bestEffortWrite(
    'last_generate_request',
    sb
      .from('community_tour_runs')
      .update({
        step_results: {
          ...run.step_results,
          last_generate_request: {
            photoIds: body.photoIds ?? null,
            engine: body.engine ?? null,
            at: new Date().toISOString(),
          },
        },
      })
      .eq('id', run.id),
  );

  // Claim the run BEFORE the handler, so "is this working" is answered by the
  // server and not by the tab that clicked. Cleared in the `finally` below.
  const startedAt = await claimActiveStep(sb, run, step);

  try {
    // Only `generate` and `assemble` read the optional arguments; every other
    // handler ignores them, so one call shape serves the whole registry.
    const result = await handler(sb, run, body.photoIds, body.engine, body.approve);
    return NextResponse.json({ ok: true, step, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Recording the failure must not itself throw — setRunStatus and saveStep
    // both go through mustWrite, and a secondary write failure that swallowed
    // the real message is how a run ends up with no explanation anywhere.
    try {
      await setRunStatus(sb, run.id, 'failed');
      // The photos step now claims itself with phase 'running' before it
      // fetches, so a throw would otherwise leave it spinning. The strip reads
      // an `error` key on the step result as 'failed'; give it one. Re-read the
      // run first — the handler wrote step_results on its way down, and `run`
      // is the snapshot from before it ran.
      if (step === 'photos') {
        const fresh = (await getRun(sb, run.id)) ?? run;
        const prior = fresh.step_results.photos;
        const partial = prior && typeof prior === 'object' && !Array.isArray(prior) ? prior : {};
        await saveStep(sb, fresh, 'photos', { ...partial, phase: 'failed', error: message });
      }
    } catch (writeErr) {
      console.error('[community-tour] recording step failure failed:', writeErr);
    }
    return NextResponse.json({ ok: false, step, error: message }, { status: 500 });
  } finally {
    // A platform kill at `maxDuration` skips this too — which is why the claim
    // carries `started_at` and the strip ages it out instead of spinning for
    // ever.
    await clearActiveStep(sb, run.id, startedAt);
  }
}
