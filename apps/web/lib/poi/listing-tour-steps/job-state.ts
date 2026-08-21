/**
 * What a queued home-tour step is actually doing, read off its job row.
 *
 * `tag` and `plan` do not run in the web app — they are queued to the render
 * worker (owner decision 2026-08-20: the planning logic stays in Python). The
 * strip first derived their state from `step_results.<step>.queued`, which is
 * written by the ENQUEUE and never again. That is a record of the request, not
 * of the work, so a step whose job failed sat amber forever: the worker that
 * failed it never came back to correct the run (owner 2026-08-21, "the plan
 * step still shows running, it should timeout and show failure now").
 *
 * This is the same mistake phase73.47 fixed on the community tour's Assemble
 * chip, in a different disguise. Green there meant "the request returned"
 * rather than "the film exists"; amber here meant "we asked" rather than "it
 * is still being worked on". The rule both times: read the artefact.
 *
 * For a queued step there are two artefacts and they answer different
 * questions. `render_jobs.status` says whether the work is still in flight —
 * and only it can say `failed`. What the step PRODUCED (tagged photos, a shot
 * list) says whether the work succeeded. So the job decides everything except
 * `done`, and the caller supplies `produced` for that.
 */

/** The slice of a render_jobs row this needs. */
export interface StepJob {
  step: string;
  status: string;
  error: string | null;
  updated_at: string;
}

export type JobStepState = 'idle' | 'waiting' | 'done' | 'failed';

/**
 * How long a claimed-or-queued job may go without an update before it reads as
 * dead rather than busy.
 *
 * Ten minutes is deliberately generous against the slowest real step: tagging
 * runs Gemini per photo at roughly three seconds each, concurrently, so a
 * 50-photo listing is a couple of minutes. Anything past ten is not slow, it is
 * a worker that was never running, was killed mid-job, or is pinned on
 * something else — and every one of those is a thing the operator needs to see
 * rather than keep waiting on.
 *
 * The cost of being wrong here is only a label: a step marked stale that later
 * finishes still writes its result, and the chip goes green when it does.
 */
export const JOB_STALE_MS = 10 * 60 * 1000;

/**
 * @param job      the newest render_jobs row for this run+step, if any
 * @param produced whether the step's OUTPUT exists (photos tagged, shots planned)
 * @param now      injected so the staleness rule is testable
 */
export function jobStepState(
  job: StepJob | undefined,
  produced: boolean,
  now: number = Date.now(),
): JobStepState {
  // The output exists. However the job row reads, the work is done — a step
  // re-run after it already succeeded must not un-green while it re-runs the
  // parts it will skip anyway.
  if (produced) return 'done';
  if (!job) return 'idle';
  if (job.status === 'failed') return 'failed';
  if (job.status === 'done') {
    // The worker says it finished and there is nothing to show for it. That is
    // a failure with a polite exit code, and it has to read as one.
    return 'failed';
  }
  if (job.status === 'queued' || job.status === 'running') {
    const age = now - new Date(job.updated_at).getTime();
    return Number.isFinite(age) && age > JOB_STALE_MS ? 'failed' : 'waiting';
  }
  return 'idle';
}

/** The line under the chip: what went wrong, or how long it has been quiet. */
export function jobStepNote(
  job: StepJob | undefined,
  produced: boolean,
  now: number = Date.now(),
): string | undefined {
  if (produced || !job) return undefined;
  if (job.status === 'failed') return job.error ?? 'failed';
  if (job.status === 'done') return 'the worker finished but produced nothing';
  if (job.status === 'queued' || job.status === 'running') {
    const age = now - new Date(job.updated_at).getTime();
    if (Number.isFinite(age) && age > JOB_STALE_MS) {
      return `no progress for ${Math.round(age / 60000)} min — is the render worker running?`;
    }
  }
  return undefined;
}
