'use client';

/**
 * TourStepStrip — the whole pipeline as one row of chips.
 *
 * Owner 2026-08-19: "on top of the top show the progress of few steps that we
 * can manually click, which can also be automated later, so the idea is
 * instead of going to step by step section, lets use one big table to manage
 * and display everything."
 *
 * What this replaces was five stacked accordion panels, each with its own
 * result dump — about two screens of chrome above the table that is the actual
 * workspace. The steps are still individually runnable (that is the point of
 * the chips), but they are now a status bar, not the page.
 *
 * Each step's detailed output has NOT been deleted; it moved behind the single
 * "Step details" disclosure that `CommunityTourSection` renders under the
 * table. Losing the research candidates or the shot-list plan would make
 * several classes of bug invisible again.
 *
 * "Automated later" is why AUTOMATABLE_STEPS is exported as data rather than
 * being inlined into the Run button: a scheduler needs the same list, and the
 * list is exactly "everything before the review gate".
 */

import { AlertCircle, Check, Loader2, Play } from 'lucide-react';

export type StepName = 'research' | 'resolve' | 'photos' | 'plan' | 'generate' | 'assemble';

/** `review` is the human gate — it has no server step, so it never runs. */
export type StripStep = 'photos' | 'review' | 'plan' | 'generate' | 'assemble';

export interface StepSpec {
  name: StripStep;
  label: string;
  /** One line, shown under the chip. Keep it to what the step DOES. */
  hint: string;
}

/**
 * The production line, starting at the photos.
 *
 * Research and Resolve are NOT here — they moved into `TourHeader` beside the
 * community facts (owner 2026-08-19: "you can move 1) and 2) to this area…
 * then next section starts with fetch and tag, review, plan, render, and
 * assembly"). They belong there: both answer "which places does this community
 * have", and neither is touched again once it has run.
 *
 * `review` is a chip with no Run button. Making the gate a visible stage is
 * the point — it is a stage of the work, not an absence of one.
 */
export const TOUR_STEPS: StepSpec[] = [
  { name: 'photos', label: 'Fetch & Tag', hint: 'photos, enhance, initial filter' },
  { name: 'review', label: 'Review', hint: 'yours — approve/reject in the table' },
  { name: 'plan', label: 'Plan', hint: 'shot list from what survived' },
  { name: 'generate', label: 'Render', hint: 'a clip for every shot' },
  { name: 'assemble', label: 'Assemble', hint: 'stitch the film' },
];

/**
 * The steps a machine may run unattended.
 *
 * Everything up to the owner's photo review, and nothing after it — see the
 * review gate in `tour-steps/photos.ts`.
 */
export const AUTOMATABLE_STEPS: StepName[] = ['research', 'resolve', 'photos'];

export type StepState = 'idle' | 'running' | 'done' | 'failed';

export function TourStepStrip({
  steps = TOUR_STEPS,
  stateOf,
  running,
  awaitingReview,
  onRun,
  onRunAutomated,
  error,
}: {
  steps?: StepSpec[];
  stateOf: (s: StripStep) => StepState;
  running: StepName | null;
  /** True once `photos` has finished and `plan` has not run. */
  awaitingReview: boolean;
  onRun: (s: StepName) => void;
  onRunAutomated: () => void;
  error?: string | null;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-semibold text-ink text-lg">Pipeline</div>
        <button
          type="button"
          onClick={onRunAutomated}
          disabled={!!running}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg px-3 py-1.5 text-ink text-xs hover:border-ink2 disabled:cursor-not-allowed disabled:text-muted"
          title="Runs research → resolve → fetch & tag, then stops for your review"
        >
          <Play size={13} aria-hidden />
          Run automated steps
        </button>
      </div>

      <ol className="mt-3 flex flex-wrap items-stretch gap-2">
        {steps.map((s, i) => {
          const state = stateOf(s.name);
          const isRunning = running === s.name;
          // The Review chip highlights while it is the thing blocking, so the
          // stop reads as a stage of the work rather than an absence of one.
          const gated = s.name === 'review' && awaitingReview;
          const runnable = s.name !== 'review';
          return (
            <li key={s.name} className="flex items-stretch gap-2">
              {i > 0 && <span className="self-center text-ink2/40">→</span>}
              <div
                className={`min-w-[9.5rem] rounded-xl border px-3 py-2 ${
                  gated
                    ? 'border-amber-500/50 bg-amber-500/10'
                    : state === 'done'
                      ? 'border-emerald-600/30 bg-emerald-600/5'
                      : state === 'failed'
                        ? 'border-red-400/50 bg-red-50'
                        : 'border-line bg-bg'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <StateIcon state={isRunning ? 'running' : state} />
                  <span className="font-medium text-ink text-xs">{`${i + 1} · ${s.label}`}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-ink2">
                  {gated ? 'waiting on you' : s.hint}
                </div>
                {runnable ? (
                  <button
                    type="button"
                    onClick={() => onRun(s.name as StepName)}
                    disabled={!!running}
                    className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] text-ink hover:border-ink2 disabled:cursor-not-allowed disabled:text-muted"
                  >
                    <Play size={10} aria-hidden />
                    {state === 'done' ? 'Re-run' : 'Run'}
                  </button>
                ) : (
                  <div className="mt-1.5 h-[19px] text-[11px] text-ink2/70">
                    {state === 'done' ? 'done' : gated ? 'in the table below' : '—'}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {awaitingReview && (
        <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-ink text-xs">
          <span className="font-medium">Your review.</span> Go through the approved AND rejected
          photos in the table below, then run{' '}
          {/* Derived, not typed. The hardcoded "4 · Plan Shots" outlived the
              renumbering that moved Research and Resolve into the header, and
              pointed at a step that no longer exists (owner 2026-08-20). */}
          <span className="font-medium">{planStepLabel(steps)}</span>. Nothing is planned or
          rendered until you do.
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-700 text-xs">
          {error}
        </div>
      )}
    </section>
  );
}

/** "3 · Plan", from the strip itself, so the banner cannot drift from it. */
function planStepLabel(steps: StepSpec[]): string {
  const i = steps.findIndex((s) => s.name === 'plan');
  return i === -1 ? 'Plan' : `${i + 1} · ${steps[i]!.label}`;
}

function StateIcon({ state }: { state: StepState }) {
  if (state === 'running') return <Loader2 size={12} className="animate-spin text-ink2" />;
  if (state === 'done') return <Check size={12} className="text-emerald-600" />;
  if (state === 'failed') return <AlertCircle size={12} className="text-red-600" />;
  return <span className="inline-block h-3 w-3 rounded-full border border-ink2/30" />;
}
