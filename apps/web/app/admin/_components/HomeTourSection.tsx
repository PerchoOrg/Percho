'use client';

/**
 * HomeTourSection — page-level assembly for the Home Tour admin.
 *
 * The home tour's counterpart to CommunityTourSection, and deliberately the
 * same shape (owner 2026-08-20: "the goal is to have a similar big table for
 * home tour as well, with all the columns, buttons if needed"):
 *
 *   header          listing facts + the latest cut, one player
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

import { streamIframeUrl } from '@/lib/cloudflare/stream';
import { type StepJob, jobStepNote, jobStepState } from '@/lib/poi/listing-tour-steps/job-state';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PhotoRow, PlanCell, SurfaceClips } from './PhotoTable';
import { PhotoTable } from './PhotoTable';
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
  clip: SurfaceClips;
  depthflow_clip: SurfaceClips;
  kenburns_clip: SurfaceClips;
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

/**
 * The iOS canvas, for the header player's aspect ratio.
 *
 * Mirrors SURFACE_CANVAS.ios in lib/poi/listing-tour-steps/shared.ts. Kept as
 * a literal rather than imported so a client component does not pull a server
 * module in for two numbers.
 */
const IOS_CANVAS = { w: 1080, h: 1576 };

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
      const res = await fetch(`/api/admin/listings/${listingId}/clips`);
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
          // iOS decides "rendered": it is the cut the feed card plays, and a
          // web-only clip does not make the shot the plan promised exist.
          .filter((c) =>
            [c.clip, c.depthflow_clip, c.kenburns_clip].some((k) => k?.ios?.status === 'ready'),
          )
          .map((c) => c.photo_id),
      ),
    [clipRows],
  );
  const shotsRendered = plannedShots.filter((s) => readyPhotoIds.has(s.photo_id)).length;

  const latestAssembly = assemblies.find((a) => a.surface === 'ios');
  const webAssembly = assemblies.find((a) => a.surface === 'web');
  const iosAssembly = latestAssembly;
  const iframeUrl =
    iosAssembly?.status === 'ready' && iosAssembly.cf_stream_uid
      ? streamIframeUrl(iosAssembly.cf_stream_uid)
      : null;

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
      case 'assemble': {
        // Two cuts, and the chip is only green when BOTH exist. One surface
        // going green while the other is still encoding is the same lie
        // phase73.47 removed, one level up.
        const both = [latestAssembly, webAssembly];
        if (both.every((a) => !a)) return 'idle';
        if (both.some((a) => a?.status === 'failed')) return 'failed';
        if (both.every((a) => a?.status === 'ready')) return 'done';
        return 'waiting';
      }
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
    if (s === 'assemble' && (latestAssembly || webAssembly)) {
      const failed = [latestAssembly, webAssembly].find((a) => a?.status === 'failed');
      if (failed) return failed.error ?? 'failed';
      const ready = [latestAssembly, webAssembly].filter((a) => a?.status === 'ready').length;
      return ready === 2 ? 'iOS + web ready' : `${ready}/2 cuts ready`;
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
            // No surface: Render and Assemble mean the film, and a home tour
            // ships two cuts. A per-row click is the only thing that names one.
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
          result?: {
            error?: string;
            message?: string;
            notReady?: number;
            skipped?: string[];
            missing?: Array<{
              photo_id: string;
              sort_order: number;
              room_type: string | null;
              state: 'rendering' | 'failed' | 'none';
              surface: string;
            }>;
          };
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
        // Not an error: one cut shipped and the other had nothing to build
        // from. Said out loud so "Assemble finished" does not read as "both
        // films exist".
        if (step === 'assemble' && body.result?.message) {
          setStepError(body.result.message);
          return rid;
        }
        if (step === 'assemble' && body.result?.notReady) {
          // Name the shots and say what is actually true of each. The old
          // message gave a COUNT and one blanket instruction, which sent the
          // owner hunting through ten rows for a shot that turned out to be
          // mid-render — "run Render first" was not just unhelpful there, it
          // was wrong (owner 2026-08-21: "i dont know which is missing").
          const missing = body.result.missing ?? [];
          const describe = (m: (typeof missing)[number]) =>
            `${m.surface} #${m.sort_order + 1}${m.room_type ? ` ${m.room_type}` : ''}`;
          const rendering = missing.filter((m) => m.state === 'rendering');
          const failed = missing.filter((m) => m.state === 'failed');
          const none = missing.filter((m) => m.state === 'none');
          const parts: string[] = [];
          if (rendering.length) {
            parts.push(`still rendering: ${rendering.map(describe).join(', ')} — wait for it`);
          }
          if (failed.length) {
            parts.push(`failed: ${failed.map(describe).join(', ')} — regenerate on the row`);
          }
          if (none.length) {
            parts.push(`never queued: ${none.map(describe).join(', ')} — run Render`);
          }
          setStepError(
            parts.length
              ? `${body.result.notReady} shot(s) will be missing from the film. ${parts.join('; ')}.`
              : `${body.result.notReady} shot(s) have no clip yet — run Render first.`,
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
        body: JSON.stringify({ step: 'generate', photoIds: [photoId], engine, surface: 'ios' }),
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
      const clip = s.surfaces?.ios;
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
        </div>
        {/* One player, the iOS cut, exactly as the community header does it
            (owner 2026-08-21: "ios feed should look similar to community, just
            show the original video"). Two stacked SurfacePreview panels was
            most of the vertical space on this page and neither of them was the
            thing being reviewed. The web cut has its own row in the table. */}
        <div>
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold text-ink text-lg">Latest Video</div>
            {iosAssembly && (
              <span
                className={`rounded-full px-2 py-0.5 font-medium text-xs ${
                  iosAssembly.status === 'ready'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {iosAssembly.status}
              </span>
            )}
          </div>
          {iframeUrl ? (
            <>
              <div className="mt-3 overflow-hidden rounded-xl bg-black">
                <iframe
                  title="Home tour video"
                  src={iframeUrl}
                  // The render canvas, not 9:16 — a hardcoded ratio letterboxed
                  // the community player when its canvas changed shape.
                  style={{ aspectRatio: `${IOS_CANVAS.w} / ${IOS_CANVAS.h}`, height: 420 }}
                  allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <div className="mt-2 text-center text-[11px] text-ink2 tabular-nums">
                {iosAssembly ? new Date(iosAssembly.created_at).toLocaleString() : ''}
              </div>
            </>
          ) : (
            <div className="mt-3 flex h-[420px] items-center justify-center rounded-xl border border-line border-dashed px-4 text-center text-ink2 text-xs">
              {!iosAssembly
                ? 'No video yet — review the photos, then Plan, Render and Assemble.'
                : iosAssembly.status === 'failed'
                  ? (iosAssembly.error ?? 'Assembly failed.')
                  : 'Assembling… the worker is rendering it now.'}
            </div>
          )}
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
