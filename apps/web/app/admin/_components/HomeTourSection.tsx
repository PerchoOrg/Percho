'use client';

/**
 * HomeTourSection — page-level assembly for the Home Tour admin.
 *
 * The home tour's counterpart to CommunityTourSection, and deliberately the
 * same shape (owner 2026-08-20: "the goal is to have a similar big table for
 * home tour as well, with all the columns, buttons if needed"):
 *
 *   header          listing facts + the latest cut per surface
 *   TourStepStrip   Tag → Review → Plan → Render → Assemble
 *   PhotoTable      OPEN, full width, every photo — the workspace
 *
 * What it replaces is one button. `AdminGenerateTourButton` posted to
 * /generate-tour and polled a render_jobs row; everything between the click
 * and the finished film — which photos were tagged, which were chosen, in what
 * order, for how long, with what camera move — happened inside a single Python
 * function and was never visible.
 *
 * Every step's state is read off the ARTEFACT, not off whether the request
 * returned. Owner 2026-08-20, on the community tour and the reason this file
 * does not repeat the mistake: "I clicked rerun of assembly, the video is not
 * yet ready, the Assemble is green, that is not right."
 */

import { type StepJob, jobStepNote, jobStepState } from '@/lib/poi/listing-tour-steps/job-state';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClipStatus, PhotoRow, PlanCell } from './PhotoTable';
import { PhotoTable } from './PhotoTable';
import { SurfacePreview } from './SurfacePreview';
import {
  type StepName,
  type StepSpec,
  type StepState,
  type StripStep,
  TourStepStrip,
} from './TourStepStrip';

/**
 * The home tour's production line.
 *
 * `review` is a chip with no Run button — making the human gate a visible
 * stage is the point. It is a stage of the work, not an absence of one.
 */
const HOME_TOUR_STEPS: StepSpec[] = [
  { name: 'tag', label: 'Tag', hint: 'vision labels for every photo' },
  { name: 'review', label: 'Review', hint: 'yours — approve/reject in the table' },
  { name: 'plan', label: 'Plan', hint: 'shot list from what survived' },
  { name: 'generate', label: 'Render', hint: 'a clip for every shot' },
  { name: 'assemble', label: 'Assemble', hint: 'stitch the film' },
];

/**
 * The steps a machine may run unattended: everything up to the owner's review,
 * and nothing after it. Tagging is idempotent and re-bills nothing, so it is
 * safe to run without asking; planning is not automated because the review it
 * depends on has not happened yet.
 */
const AUTOMATABLE_STEPS: StepName[] = ['tag'];

interface Run {
  id: string;
  status: string;
  step_results: Record<string, unknown>;
}

interface ClipRow {
  photo_id: string;
  clip: ClipStatus | null;
  depthflow_clip: ClipStatus | null;
  kenburns_clip: ClipStatus | null;
}

interface AssemblyStatus {
  id: string;
  run_id: string | null;
  surface: string;
  status: string;
  cf_stream_uid: string | null;
  error: string | null;
  created_at: string;
}

interface PlanShot {
  photo_id: string;
  sort_order: number;
  duration_s: number;
  room_type: string | null;
  is_hero: boolean;
  mode: string | null;
  surfaces: Record<
    string,
    | { engine: string; move: string | null; prompt: string | null; ai_generated: boolean }
    | undefined
  >;
}

/** iOS is the surface this page manages. Web is planned but not yet rendered. */
const SURFACE = 'ios';

export function HomeTourSection({
  listingId,
  address,
  city,
  state,
  zip,
  agentName,
  storageBase,
  bucket,
  photos,
  latestVideo,
  legacyAction,
}: {
  listingId: string;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  agentName: string | null;
  storageBase: string;
  bucket: string;
  photos: PhotoRow[];
  /** The published listing_videos walkthrough, for the header preview. */
  latestVideo: { iosUid: string | null; webUid: string | null; status: string } | null;
  /**
   * The pre-pipeline one-click renderer, kept as a fallback.
   *
   * It is the whole-film `process_job()` path — the thing this page replaces —
   * and it stays reachable until a film has actually come out of the per-photo
   * path on real photos. Retiring it is a deletion, and deleting the renderer
   * that works before the replacement has been seen to work is how a listing
   * ends up with no way to make a video at all.
   */
  legacyAction?: ReactNode;
}) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [jobs, setJobs] = useState<Array<StepJob & { run_id: string }>>([]);
  const [clipRows, setClipRows] = useState<ClipRow[]>([]);
  const [assemblies, setAssemblies] = useState<AssemblyStatus[]>([]);
  const [running, setRunning] = useState<StepName | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const loadRuns = useCallback(async () => {
    const res = await fetch(`/api/admin/listings/${listingId}/runs`);
    if (!res.ok) return;
    const body = (await res.json()) as {
      runs: Run[];
      jobs: Array<StepJob & { run_id: string }>;
    };
    setRuns(body.runs);
    setJobs(body.jobs ?? []);
  }, [listingId]);

  const loadClips = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/admin/listings/${listingId}/clips?surface=${SURFACE}`);
      if (!res.ok) return;
      setClipRows(((await res.json()) as { clips: ClipRow[] }).clips);
    } catch {
      /* transient — the next tick retries */
    } finally {
      inFlight.current = false;
    }
  }, [listingId]);

  const loadAssemblies = useCallback(async () => {
    const res = await fetch(`/api/admin/listings/${listingId}/assemblies`);
    if (!res.ok) return;
    setAssemblies(((await res.json()) as { assemblies: AssemblyStatus[] }).assemblies);
  }, [listingId]);

  useEffect(() => {
    void loadRuns();
    void loadClips();
    void loadAssemblies();
  }, [loadRuns, loadClips, loadAssemblies]);

  // Tag, plan, render and assemble all finish somewhere else — the render
  // worker's loop, not this request. Without a poll every chip would sit on
  // its last known state until something happened to re-render the page.
  useEffect(() => {
    const t = setInterval(() => {
      void loadRuns();
      void loadClips();
      void loadAssemblies();
    }, 10_000);
    return () => clearInterval(t);
  }, [loadRuns, loadClips, loadAssemblies]);

  const run = runs[0];

  const tagResult = run?.step_results.tag as
    | { queued?: boolean; tagged?: number; error?: string }
    | undefined;
  const planResult = run?.step_results.plan as
    | { queued?: boolean; shots?: PlanShot[]; error?: string }
    | undefined;
  const plannedShots = useMemo(
    () => (Array.isArray(planResult?.shots) ? planResult.shots : []),
    [planResult],
  );

  /**
   * The current attempt for each queued step. The API returns jobs newest
   * first, so the first match is the live one — an older failed attempt must
   * not keep the chip red after a re-run.
   */
  const jobFor = useCallback(
    (step: 'tag' | 'plan'): StepJob | undefined =>
      jobs.find((j) => j.run_id === run?.id && j.step === step),
    [jobs, run],
  );

  const taggedCount = photos.filter((p) => p.tagged_at).length;
  const allTagged = photos.length > 0 && taggedCount === photos.length;

  /** READY, not merely present: a pending row is not a rendered clip. */
  const readyPhotoIds = useMemo(
    () =>
      new Set(
        clipRows
          .filter((c) =>
            [c.clip, c.depthflow_clip, c.kenburns_clip].some((k) => k?.status === 'ready'),
          )
          .map((c) => c.photo_id),
      ),
    [clipRows],
  );
  const shotsRendered = plannedShots.filter((s) => readyPhotoIds.has(s.photo_id)).length;

  const latestAssembly = assemblies.find((a) => a.surface === SURFACE);

  /** Tag has finished and Plan has not — the gate is what is blocking. */
  const awaitingReview = allTagged && plannedShots.length === 0;

  const stateOf = (s: StripStep): StepState => {
    if (running === s) return 'running';
    switch (s) {
      case 'tag':
        // Two artefacts, two questions: `render_jobs` says whether the work is
        // still in flight (and is the only thing that can say it failed),
        // `tagged_at` says whether it succeeded. `step_results.tag.queued` is
        // neither — it only records that we asked.
        if (photos.length === 0) return 'idle';
        if (tagResult?.error) return 'failed';
        return jobStepState(jobFor('tag'), allTagged);
      case 'review':
        return plannedShots.length > 0 ? 'done' : 'idle';
      case 'plan':
        if (planResult?.error) return 'failed';
        return jobStepState(jobFor('plan'), plannedShots.length > 0);
      case 'generate':
        if (plannedShots.length === 0) return 'idle';
        return shotsRendered < plannedShots.length ? 'waiting' : 'done';
      case 'assemble':
        if (!latestAssembly) return 'idle';
        if (latestAssembly.status === 'ready') return 'done';
        if (latestAssembly.status === 'failed') return 'failed';
        return 'waiting';
      default:
        return 'idle';
    }
  };

  const noteOf = (s: StripStep): string | undefined => {
    if (s === 'tag' || s === 'plan') {
      const produced = s === 'tag' ? allTagged : plannedShots.length > 0;
      // A failed or stalled job explains itself; a healthy one falls through
      // to the progress counter below.
      const why = jobStepNote(jobFor(s), produced);
      if (why) return why;
    }
    if (s === 'tag' && photos.length > 0 && !allTagged) {
      return `${taggedCount}/${photos.length} tagged`;
    }
    if (s === 'generate' && plannedShots.length > 0 && shotsRendered < plannedShots.length) {
      return `rendering ${shotsRendered}/${plannedShots.length} clips`;
    }
    if (s === 'assemble' && latestAssembly) {
      if (latestAssembly.status === 'ready') return 'film ready';
      if (latestAssembly.status === 'failed') return latestAssembly.error ?? 'failed';
      return `${latestAssembly.status}…`;
    }
    return undefined;
  };

  /**
   * Run one step. `runId` is threaded explicitly rather than read from state:
   * inside a chained loop `runs` is a stale closure, so every step after the
   * first would create its own run and each would see an empty predecessor.
   */
  const runStep = useCallback(
    async (step: StepName, runId?: string): Promise<string | null> => {
      setRunning(step);
      setStepError(null);
      try {
        let rid = runId ?? runs[0]?.id;
        if (!rid) {
          const created = await fetch(`/api/admin/listings/${listingId}/runs`, { method: 'POST' });
          if (!created.ok) {
            setStepError('Could not create run');
            return null;
          }
          rid = ((await created.json()) as { run: { id: string } }).run.id;
        }
        const res = await fetch(`/api/admin/listings/${listingId}/runs/${rid}/step`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            step,
            surface: SURFACE,
            // `assemble` without `approve` only stages the shot list and
            // inserts nothing — a click that does nothing visible. The shot
            // list is already on screen in the table's Plan column, so the
            // staging phase has nothing left to show.
            ...(step === 'assemble' ? { approve: true } : {}),
          }),
        });
        const body = (await res.json()) as {
          ok?: boolean;
          error?: string;
          result?: { error?: string; message?: string; notReady?: number };
        };
        if (!res.ok || !body.ok) {
          setStepError(`${step}: ${body.error ?? `HTTP ${res.status}`}`);
          return null;
        }
        // A step can succeed as a request and still refuse to do anything —
        // "every photo is rejected", "no shot list yet". That belongs on
        // screen, not swallowed as a 200.
        if (body.result?.error) {
          setStepError(`${step}: ${body.result.message ?? body.result.error}`);
          return rid;
        }
        if (step === 'assemble' && body.result?.notReady) {
          setStepError(
            `${body.result.notReady} shot(s) have no clip yet and will be missing from the film — run Render first.`,
          );
        }
        return rid;
      } finally {
        setRunning(null);
        await loadRuns();
        await loadClips();
        await loadAssemblies();
      }
    },
    [listingId, runs, loadRuns, loadClips, loadAssemblies],
  );

  const runAutomated = useCallback(async () => {
    let rid: string | undefined;
    for (const s of AUTOMATABLE_STEPS) {
      const got = await runStep(s, rid);
      if (!got) return; // a failed step stops the chain; the error is on screen
      rid = got;
    }
  }, [runStep]);

  /** Per-row Generate: one photo, one engine, on the surface being managed. */
  const generateClip = useCallback(
    async (photoId: string, engine?: string): Promise<{ ok: boolean; message?: string }> => {
      let rid = runs[0]?.id;
      if (!rid) {
        const created = await fetch(`/api/admin/listings/${listingId}/runs`, { method: 'POST' });
        if (!created.ok) return { ok: false, message: 'Could not create run' };
        rid = ((await created.json()) as { run: { id: string } }).run.id;
      }
      const res = await fetch(`/api/admin/listings/${listingId}/runs/${rid}/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'generate', photoIds: [photoId], engine, surface: SURFACE }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, message: body.error ?? `HTTP ${res.status}` };
      }
      await loadClips();
      return { ok: true };
    },
    [listingId, runs, loadClips],
  );

  /** Clip status merged onto the photo rows, keyed by photo id. */
  const enriched = useMemo(() => {
    const byId = new Map(clipRows.map((c) => [c.photo_id, c]));
    return photos.map((p) => {
      const c = byId.get(p.id);
      if (!c) return p;
      return {
        ...p,
        clip: c.clip,
        depthflow_clip: c.depthflow_clip,
        kenburns_clip: c.kenburns_clip,
      };
    });
  }, [photos, clipRows]);

  /** The shot list, keyed by photo, for the table's Plan column. */
  const planByPhoto = useMemo(() => {
    const out: Record<string, PlanCell> = {};
    for (const s of plannedShots) {
      const clip = s.surfaces?.[SURFACE];
      out[s.photo_id] = {
        sort_order: s.sort_order,
        engine: clip?.engine ?? 'kenburns',
        move: clip?.move ?? '',
        duration_s: s.duration_s,
        ai_generated: clip?.ai_generated ?? false,
        prompt: clip?.prompt ?? null,
      };
    }
    return out;
  }, [plannedShots]);

  /** Why each photo the plan considered is NOT in the cut, keyed by photo. */
  const dropReasons = useMemo(() => {
    const dropped =
      (run?.step_results.plan as { dropped?: Array<{ photo_id: string; reason: string }> })
        ?.dropped ?? [];
    return Object.fromEntries(dropped.map((d) => [d.photo_id, d.reason]));
  }, [run]);

  const where = [city, state].filter(Boolean).join(', ');

  return (
    <div className="space-y-4">
      {/* 1 · Facts left, latest cut right. */}
      <section className="grid gap-4 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2">
        <div>
          <h1 className="font-semibold text-2xl text-ink">{address}</h1>
          <p className="mt-1 text-ink2 text-sm">
            {where}
            {zip ? ` ${zip}` : ''}
            {agentName ? ` · ${agentName}` : ''}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-ink2">Photos</dt>
            <dd className="tabular-nums text-ink">{photos.length}</dd>
            <dt className="text-ink2">Tagged</dt>
            <dd className="tabular-nums text-ink">
              {taggedCount}/{photos.length}
            </dd>
            <dt className="text-ink2">Planned shots</dt>
            <dd className="tabular-nums text-ink">{plannedShots.length || '—'}</dd>
            <dt className="text-ink2">Clips ready</dt>
            <dd className="tabular-nums text-ink">
              {plannedShots.length ? `${shotsRendered}/${plannedShots.length}` : '—'}
            </dd>
            <dt className="text-ink2">Run</dt>
            <dd className="text-ink">{run ? run.status : 'none yet'}</dd>
          </dl>
          {legacyAction && (
            <details className="mt-4">
              <summary className="cursor-pointer text-[11px] text-ink2 hover:text-ink">
                Legacy whole-film render
              </summary>
              <div className="mt-2">{legacyAction}</div>
            </details>
          )}
        </div>
        <div className="grid gap-3">
          <SurfacePreview
            surface="ios"
            uid={latestVideo?.iosUid ?? null}
            status={latestVideo?.status ?? 'none'}
          />
          <SurfacePreview
            surface="web"
            uid={latestVideo?.webUid ?? null}
            status={latestVideo?.status ?? 'none'}
          />
        </div>
      </section>

      {/* 2 · The whole pipeline as one row of chips. */}
      <TourStepStrip
        steps={HOME_TOUR_STEPS}
        stateOf={stateOf}
        noteOf={noteOf}
        running={running}
        awaitingReview={awaitingReview}
        onRun={(s) => void runStep(s)}
        onRunAutomated={() => void runAutomated()}
        automatedHint="Runs tagging, then stops for your review"
        error={stepError}
      />

      {/* 3 · THE workspace. Open, full width — everything is managed here. */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <PhotoTable
          table="listing_photos"
          storageBase={storageBase}
          bucket={bucket}
          photos={enriched}
          onGenerateClip={generateClip}
          plan={planByPhoto}
          dropReasons={dropReasons}
        />
      </section>
    </div>
  );
}
