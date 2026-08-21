/**
 * Plumbing shared by every home-tour step.
 *
 * Deliberately a sibling of `tour-steps/` rather than a rewrite of it: the two
 * pipelines run different steps (a community is researched and resolved, a
 * home already knows its photos) but persist them the same way, so the admin
 * surface can render either from `step_results`.
 *
 * The genuinely generic helpers — `mustWrite`, `bestEffortWrite`, `asJson`,
 * `TourDb` — are imported from `tour-steps/shared` rather than copied. They
 * live under a community-named module only because that pipeline needed them
 * first; nothing in them knows what a community is.
 */
import type { Json } from '@/lib/supabase/database.types';
import { type TourDb, asJson, mustWrite } from '../tour-steps/shared';

export type { TourDb };
export { asJson, mustWrite };

/** The two canvases a home tour ships. A clip's pixels depend on which. */
export type Surface = 'ios' | 'web';

/**
 * iOS renders the SAME canvas as the community tour (1080x1576), which is the
 * feed card's measured aspect since the 2026-08-17 card unification. Web is the
 * 16:9 player. Kept here rather than imported from the community scheduler so
 * that changing one pipeline's canvas cannot silently move the other's.
 */
export const SURFACE_CANVAS: Record<Surface, { w: number; h: number }> = {
  ios: { w: 1080, h: 1576 },
  web: { w: 1920, h: 1080 },
};

export interface ListingRunRow {
  id: string;
  listing_id: string;
  status: string;
  step_results: Record<string, Json>;
}

/** One clip as the plan step decided it, for one surface. */
export interface PlannedClip {
  engine: 'kenburns' | 'depthflow' | 'seedance';
  move: string | null;
  /** Seedance only — the prompt the clip is generated from. */
  prompt: string | null;
  ai_generated: boolean;
}

/** One shot in the cut. Order and duration are shared; engine is per surface. */
export interface ListingShot {
  photo_id: string;
  sort_order: number;
  duration_s: number;
  room_type: string | null;
  is_hero: boolean;
  /** Ken Burns mode from `photo_selector.build_plan` — the camera INTENT. */
  mode: string | null;
  /** How that intent is realised on each canvas. */
  surfaces: Partial<Record<Surface, PlannedClip>>;
}

export interface PlanResult {
  shots?: ListingShot[];
  dropped?: Array<{ photo_id: string; reason: string }>;
  style?: string;
  error?: string;
}

export async function getListingRun(sb: TourDb, runId: string): Promise<ListingRunRow | null> {
  const { data } = await sb
    .from('listing_tour_runs')
    .select('id, listing_id, status, step_results')
    .eq('id', runId)
    .maybeSingle();
  return (data as ListingRunRow | null) ?? null;
}

export async function setListingRunStatus(sb: TourDb, runId: string, status: string) {
  await mustWrite(
    `setListingRunStatus(${status})`,
    sb
      .from('listing_tour_runs')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', runId),
  );
}

/**
 * Persist a step's output under step_results.<step> (merge, not replace).
 *
 * `ran_at` for the same reason the community tour stamps it: a panel renders
 * whatever is stored, so after a rule change the screen looks identical until
 * the step is re-run, with nothing on it to say so.
 */
export async function saveListingStep(
  sb: TourDb,
  run: ListingRunRow,
  step: string,
  result: unknown,
) {
  const stamped =
    result !== null && typeof result === 'object' && !Array.isArray(result)
      ? { ...(result as Record<string, unknown>), ran_at: new Date().toISOString() }
      : result;

  await mustWrite(
    `saveListingStep(${step})`,
    sb
      .from('listing_tour_runs')
      .update({
        step_results: asJson({ ...run.step_results, [step]: stamped }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', run.id),
  );
}

/** The shot list the plan step wrote, or [] when it has not run. */
export function plannedShots(run: ListingRunRow): ListingShot[] {
  const plan = run.step_results.plan as PlanResult | undefined;
  return Array.isArray(plan?.shots) ? plan.shots : [];
}

/**
 * Hand a step to the render worker.
 *
 * `tag` and `plan` are Python (`photo_tagger.py`, `photo_selector.build_plan`)
 * and stay that way by owner decision (2026-08-20), so the web app cannot run
 * them inline the way the community tour runs research and resolve. It queues
 * a `render_jobs` row and the worker dispatches on `step`; the chip goes amber
 * until the step writes its result back.
 *
 * Idempotent per (run, step): a second click while one is still queued returns
 * the job already in flight instead of stacking a duplicate.
 */
export async function enqueueWorkerStep(
  sb: TourDb,
  run: ListingRunRow,
  step: 'tag' | 'plan',
): Promise<{ jobId: string; alreadyQueued: boolean }> {
  const { data: existing } = await sb
    .from('render_jobs')
    .select('id')
    .eq('run_id', run.id)
    .eq('step', step)
    .in('status', ['queued', 'running'])
    .maybeSingle();
  if (existing) return { jobId: (existing as { id: string }).id, alreadyQueued: true };

  const { data, error } = await sb
    .from('render_jobs')
    .insert({
      listing_id: run.listing_id,
      run_id: run.id,
      step,
      status: 'queued',
      // Null on purpose: tag and plan produce no video. The column stopped
      // being NOT NULL in 20260821060000 for exactly this.
      video_row_id: null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`enqueue ${step}: ${(error as { message: string }).message}`);
  return { jobId: (data as { id: string }).id, alreadyQueued: false };
}
