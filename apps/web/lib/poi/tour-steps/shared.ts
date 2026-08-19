/**
 * Plumbing shared by every community-tour step.
 *
 * The step handlers used to live inline in the route file, which had grown to
 * 1,304 lines. They are independent of each other — the route only dispatches
 * through a `STEP_HANDLERS` registry — so each one is now its own module and
 * the pieces they all need live here.
 */
import type { Json } from '@/lib/supabase/database.types';
import type { createServiceClient } from '@/lib/supabase/server';

/**
 * The service-role client every step handler receives. Named so the
 * handlers do not each re-derive it — and so it is a real type rather
 * than the `any` they used before database.types.ts was generated.
 */
export type TourDb = ReturnType<typeof createServiceClient>;

/**
 * Step results are plain serialisable objects written to a JSONB column.
 * The generated schema types that column as `Json`, which TypeScript will
 * not infer from `Record<string, unknown>`; this narrows at the write
 * boundary rather than letting `any` back into the whole file.
 */
export const asJson = (value: unknown): Json => value as Json;

export interface RunRow {
  id: string;
  community_id: string;
  status: string;
  step_results: Record<string, Json>;
}

/**
 * Run a write and fail loudly. Every silent write in this route has turned out
 * to be hiding a real failure: the POI insert with no display_name, the
 * community_pois link violating its bucket CHECK, both invisible for weeks
 * because nobody read the error (2026-08-17). The POST handler catches, marks
 * the run failed and returns the message, so a broken write now reaches the
 * screen instead of looking like an empty result.
 */
export async function mustWrite(label: string, q: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await q;
  if (error) {
    throw new Error(`${label}: ${(error as { message?: string })?.message ?? 'unknown error'}`);
  }
}

/**
 * For writes whose failure costs nothing but a progress indicator. Logged, not
 * thrown — losing the spinner is not worth losing the run.
 */
export async function bestEffortWrite(
  label: string,
  q: PromiseLike<{ error: unknown }>,
): Promise<void> {
  const { error } = await q;
  if (error) {
    console.error(`[community-tour] ${label} failed:`, error);
  }
}

export async function getRun(sb: TourDb, runId: string): Promise<RunRow | null> {
  const { data } = await sb
    .from('community_tour_runs')
    .select('id, community_id, status, step_results')
    .eq('id', runId)
    .maybeSingle();
  return (data as RunRow | null) ?? null;
}

export async function setRunStatus(
  sb: TourDb,
  runId: string,
  status: string,
  extra: Record<string, unknown> = {},
) {
  await mustWrite(
    `setRunStatus(${status})`,
    sb
      .from('community_tour_runs')
      .update({ status, updated_at: new Date().toISOString(), ...extra })
      .eq('id', runId),
  );
}

/** Persist a step's output under step_results.<step> (merge, not replace). */
export async function saveStep(sb: TourDb, run: RunRow, step: string, result: unknown) {
  // Stamp when this step last produced its result. A panel renders whatever is
  // stored, so after a prompt or rule change the screen looks identical until
  // the step is re-run — with nothing on it to say so (owner 2026-08-19: "i
  // dont see agent research, resolve and merge section updated"). The
  // timestamp is what makes stale output legible as stale.
  const stamped =
    result !== null && typeof result === 'object' && !Array.isArray(result)
      ? { ...(result as Record<string, unknown>), ran_at: new Date().toISOString() }
      : result;

  // The write whose silent failure is indistinguishable from "the step did
  // nothing": the panel simply keeps rendering the previous run's numbers.
  await mustWrite(
    `saveStep(${step})`,
    sb
      .from('community_tour_runs')
      .update({
        step_results: asJson({ ...run.step_results, [step]: stamped }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', run.id),
  );
}

// ─── step: research (Gemini grounding, runs on Vercel) ─────────────────────
