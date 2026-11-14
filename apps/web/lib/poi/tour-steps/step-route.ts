/**
 * Dispatch for one tour step — see the community step route's header for what
 * each step does. Moved here from that route in phase318 so the city route
 * (`/api/admin/city-tour/[id]/runs/[runId]/step`) runs the same handlers.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { runAssemble } from './assemble';
import { runFilter } from './filter';
import { runGenerate, runRegenerateAll } from './generate';
import { runIngest } from './ingest';
import { runPhotos } from './photos';
import { runPlan } from './plan';
import { runResearch } from './research';
import { runResolve } from './resolve';
import type { TourScope } from './scope';
import {
  type RunRow,
  type TourDb,
  bestEffortWrite,
  claimActiveStep,
  clearActiveStep,
  getRun,
  saveStep,
  setRunStatus,
} from './shared';
import { runTag } from './tag';

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
  // `tag` runs the filter too (owner 2026-08-23: "tag and filtering can be
  // combined"), so the strip has no Filter chip. `filter` stays registered
  // because it is still a real, separately runnable step.
  tag: runTag,
  // Wrapped for the same reason `photos` is: this registry's third argument is
  // `body.photoIds`, straight from the request, and `runFilter`'s is `opts` —
  // so registering it bare would let a client post `{"photoIds": ...}` and
  // decide whether the untagged guard applies. Typecheck caught it; the
  // adapter is what keeps it caught.
  filter: (sb, run) => runFilter(sb, run),
  // The owner's manual photo review sits between tagging and `plan`.
  plan: runPlan,
  generate: runGenerate,
  'regenerate-all': runRegenerateAll,
  assemble: runAssemble,
};

/**
 * The step route's body, shared by the community and city routes (phase318):
 * the two differ only in which tables the run lives in.
 */
export async function postTourStep(
  req: Request,
  scope: TourScope,
  entityId: string,
  runId: string,
): Promise<Response> {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

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

  const run = await getRun(sb, runId, scope);
  if (!run) return NextResponse.json({ error: 'run_not_found' }, { status: 404 });
  if (run.entity_id !== entityId) {
    return NextResponse.json({ error: 'run_mismatch' }, { status: 400 });
  }

  // Debug: record the raw engine the client sent (owner 2026-08-17: DA+KB
  // clicks were landing as seedance; need to see if engine reaches the route).
  await bestEffortWrite(
    'last_generate_request',
    sb
      .from(scope.runsTable)
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
      await setRunStatus(sb, run, 'failed');
      // The photos step now claims itself with phase 'running' before it
      // fetches, so a throw would otherwise leave it spinning. The strip reads
      // an `error` key on the step result as 'failed'; give it one. Re-read the
      // run first — the handler wrote step_results on its way down, and `run`
      // is the snapshot from before it ran.
      if (step === 'photos') {
        const fresh = (await getRun(sb, run.id, scope)) ?? run;
        const prior = fresh.step_results.photos;
        const partial = prior && typeof prior === 'object' && !Array.isArray(prior) ? prior : {};
        await saveStep(sb, fresh, 'photos', { ...partial, phase: 'failed', error: message });
      }
    } catch (writeErr) {
      console.error(`${scope.logPrefix} recording step failure failed:`, writeErr);
    }
    return NextResponse.json({ ok: false, step, error: message }, { status: 500 });
  } finally {
    // A platform kill at `maxDuration` skips this too — which is why the claim
    // carries `started_at` and the strip ages it out instead of spinning for
    // ever.
    await clearActiveStep(sb, run, startedAt);
  }
}
