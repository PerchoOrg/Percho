/**
 * The chip must never say "running" about work that is not running.
 *
 * The first case below is the one that shipped broken: on 2026-08-21 a `plan`
 * job failed, nothing came back to correct `step_results`, and the chip sat
 * amber indefinitely while the render_jobs row said `failed` the whole time.
 */
import { describe, expect, it } from 'vitest';
import { JOB_STALE_MS, type StepJob, jobStepNote, jobStepState } from './job-state';

const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const job = (over: Partial<StepJob> = {}): StepJob => ({
  step: 'plan',
  status: 'queued',
  error: null,
  updated_at: at(0),
  ...over,
});

describe('jobStepState', () => {
  it('reports a failed job as failed, not as still running', () => {
    const failed = job({ status: 'failed', error: '400 Bad Request' });
    expect(jobStepState(failed, false)).toBe('failed');
    expect(jobStepNote(failed, false)).toBe('400 Bad Request');
  });

  it('reports a job the worker finished with nothing to show as failed', () => {
    // A polite exit code and no shot list is still a failure; letting it read
    // as idle would invite a re-click that does the same nothing.
    expect(jobStepState(job({ status: 'done' }), false)).toBe('failed');
  });

  it('is waiting while a fresh job is queued or running', () => {
    expect(jobStepState(job({ status: 'queued' }), false)).toBe('waiting');
    expect(jobStepState(job({ status: 'running' }), false)).toBe('waiting');
    expect(jobStepNote(job({ status: 'running' }), false)).toBeUndefined();
  });

  it('times out a job nothing has touched, and names the likely cause', () => {
    const stale = job({ status: 'running', updated_at: at(JOB_STALE_MS + 60_000) });
    expect(jobStepState(stale, false)).toBe('failed');
    expect(jobStepNote(stale, false)).toMatch(/render worker/);
  });

  it('does not time out a job that is merely slow', () => {
    expect(
      jobStepState(job({ status: 'running', updated_at: at(JOB_STALE_MS - 1000) }), false),
    ).toBe('waiting');
  });

  it('is idle when no job has ever been queued', () => {
    expect(jobStepState(undefined, false)).toBe('idle');
    expect(jobStepNote(undefined, false)).toBeUndefined();
  });

  it('lets the artefact win over any job row', () => {
    // Re-running a step that already succeeded must not un-green the chip, and
    // a stale job row from a previous attempt must not outrank a real result.
    expect(jobStepState(job({ status: 'failed' }), true)).toBe('done');
    expect(jobStepState(job({ status: 'running', updated_at: at(0) }), true)).toBe('done');
    expect(jobStepNote(job({ status: 'failed', error: 'old' }), true)).toBeUndefined();
  });

  it('survives an unparseable timestamp instead of timing out on NaN', () => {
    const bad = job({ status: 'running', updated_at: 'not-a-date' });
    expect(jobStepState(bad, false)).toBe('waiting');
  });
});
