'use client';

/**
 * CommunityTourSection — page-level assembly for the Community Tour admin.
 *
 * Layout, owner 2026-08-19: "on top show community information on the left,
 * and show latest generated video on the right, then show a big photo table,
 * on top of the top show the progress of few steps that we can manually
 * click… instead of going to step by step section, lets use one big table to
 * manage and display everything."
 *
 *   TourHeader      facts + Research/Resolve (left), latest cut (right)
 *   TourStepStrip   Fetch & Tag → Review → Plan → Render → Assemble
 *   PhotoSourcePanel
 *   PhotoTable      OPEN, full width, EVERY fetched photo — the workspace
 *
 * What this replaced: a full-width video, five stacked accordion step panels
 * with their result dumps, and the photo table shut behind a `<details>`. The
 * one surface an admin works in was the only thing below the fold and closed.
 *
 * The step-details disclosure is gone too (owner 2026-08-19: "we do not need
 * to keep step details as well, it is already in the big table"). Per-step
 * state now reads off the strip and per-photo state off the table, so the
 * result dumps were a third copy of the same facts.
 */

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type BgmChoiceView, NarrationPanel, type NarrationSegmentView } from './NarrationPanel';
import { PhotoSourcePanel } from './PhotoSourcePanel';
import type { ClipStatus, PhotoRow } from './PhotoTable';
import { PhotoTable } from './PhotoTable';
import { TourHeader } from './TourHeader';
import {
  AUTOMATABLE_STEPS,
  type StepName,
  type StepState,
  type StripStep,
  TourStepStrip,
} from './TourStepStrip';

interface ClipRow {
  photo_id: string;
  poi_id: string;
  photo_url: string;
  ai_tags: unknown;
  recommended: boolean;
  clip: ClipStatus | null;
  depthflow_clip: ClipStatus | null;
  kenburns_clip: ClipStatus | null;
}

interface PlanShot {
  photo_id: string;
  sort_order?: number;
  engine: string;
  move?: string | null;
  duration_s: number;
  ai_generated?: boolean;
  prompt?: string | null;
}

interface AssemblyStatus {
  id: string;
  run_id: string | null;
  status: string;
  cf_stream_uid: string | null;
  error: string | null;
  created_at: string;
}

interface Run {
  id: string;
  step_results: Record<string, unknown>;
  status: string;
}

export function CommunityTourSection({
  communityId,
  communityName,
  city,
  state,
  zip,
  lat,
  lng,
  kind,
  poiCount,
  storageBase,
  bucket,
  photos,
}: {
  communityId: string;
  communityName: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  kind: string | null;
  poiCount: number;
  storageBase: string;
  bucket: string;
  photos: PhotoRow[];
}) {
  const [clipRows, setClipRows] = useState<ClipRow[]>([]);
  const inFlight = useRef(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [running, setRunning] = useState<StepName | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [assemblies, setAssemblies] = useState<AssemblyStatus[]>([]);
  const router = useRouter();

  const loadRuns = useCallback(async () => {
    const res = await fetch(`/api/admin/community-tour/${communityId}/runs`);
    if (!res.ok) return;
    const body = (await res.json()) as { runs: Run[] };
    setRuns(body.runs);
  }, [communityId]);

  useEffect(() => {
    void loadRuns();
    // Polled, because the run is where step status now lives (see `active`
    // below). Without this a reload shows the state at mount and never moves,
    // which is the same blindness the client-only spinner had.
    const t = setInterval(() => void loadRuns(), 10_000);
    return () => clearInterval(t);
  }, [loadRuns]);

  // Assemblies, because "did the step return" and "does the film exist" are
  // different questions and the strip was answering the first one.
  const loadAssemblies = useCallback(async () => {
    const res = await fetch(`/api/admin/community-tour/${communityId}/assemblies`);
    if (!res.ok) return;
    setAssemblies(((await res.json()) as { assemblies: AssemblyStatus[] }).assemblies);
  }, [communityId]);

  useEffect(() => {
    void loadAssemblies();
    // The worker takes a minute or two; without a poll the chip would sit amber
    // until something else happened to re-render the page.
    const t = setInterval(() => void loadAssemblies(), 10_000);
    return () => clearInterval(t);
  }, [loadAssemblies]);

  const run = runs[0];

  // `research` writes under `agent_research`; every other step uses its name.
  const resultKey = (s: StepName) => (s === 'research' ? 'agent_research' : s);
  const photosResult = run?.step_results.photos as { phase?: string } | undefined;
  // The gate belongs to `filter` now — it is the last automated step and the
  // one that writes phase 'review' (tour-steps/filter.ts). It used to belong
  // to `photos`, back when photos WAS fetch + ingest + tag + filter.
  const filterResult = run?.step_results.filter as { phase?: string } | undefined;

  /** Clips the current plan needs, and how many are actually rendered. */
  const plannedShots = ((run?.step_results.photos as { shots?: PlanShot[] } | undefined)?.shots ??
    []) as PlanShot[];
  // READY, not merely present: the clips endpoint returns pending and failed
  // rows too, and counting those as rendered would turn Render green the
  // instant the queue was written — the same mistake as Assemble.
  const readyPhotoIds = new Set(
    clipRows
      .filter((c) => [c.clip, c.depthflow_clip, c.kenburns_clip].some((k) => k?.status === 'ready'))
      .map((c) => c.photo_id),
  );
  const shotsRendered = plannedShots.filter((sh) => readyPhotoIds.has(sh.photo_id)).length;

  /**
   * Filtering is finished and nothing has been planned over it yet.
   *
   * Planning is the only thing that can follow the review, so a shot list
   * existing IS the review having happened — which is also why `plan` no
   * longer reads a phase. `plan` writes its output back into the `photos`
   * result (it was the second half of that step once), so a phase there
   * cannot distinguish "fetched" from "planned".
   */
  const awaitingReview = filterResult?.phase === 'review' && plannedShots.length === 0;

  /** The newest assembly for the run on screen. */
  const latestAssembly = assemblies.find((a) => a.run_id === run?.id) ?? assemblies[0];

  /**
   * The step the SERVER says is running — written by the step route before it
   * calls the handler (`claimActiveStep`), cleared when the handler returns.
   *
   * `running` above is this tab's own in-flight fetch and is gone the moment
   * the page reloads; the plan step runs for minutes, so a reload mid-plan came
   * back showing the previous run's green tick (owner 2026-08-23: "the status
   * should not be gone after page refreshing, it should reflect the backend job
   * status").
   *
   * Aged out rather than trusted forever: Vercel kills a function at its
   * `maxDuration` without running the route's `finally`, so a claim can outlive
   * the work that made it. Past the cap plus a margin, the honest reading is
   * "nothing came back", not "still going".
   */
  const active = run?.step_results.active as { step?: string; started_at?: string } | null;
  const activeAgeMs =
    active?.started_at != null ? Date.now() - Date.parse(active.started_at) : null;
  const activeStale = activeAgeMs != null && activeAgeMs > ACTIVE_STALE_MS;

  const stateOf = (s: StripStep | StepName): StepState => {
    if (running === s) return 'running';
    if (active?.step === s) return activeStale ? 'failed' : 'running';

    // Both of these hand work to the render worker and return straight away,
    // so their state is the state of what the worker produced — not of the
    // request. Owner 2026-08-20: "just pulling the status and show it".
    if (s === 'assemble') {
      if (!latestAssembly) return 'idle';
      if (latestAssembly.status === 'ready') return 'done';
      if (latestAssembly.status === 'failed') return 'failed';
      return 'waiting';
    }
    if (s === 'generate') {
      if (plannedShots.length === 0) return 'idle';
      if (shotsRendered < plannedShots.length) return 'waiting';
      return 'done';
    }
    // `review` has no server step, and `plan` writes back into the photos
    // result rather than a key of its own. Both are "done" once a shot list
    // exists — planning is the only thing that can follow the review.
    if (s === 'review' || s === 'plan') {
      return plannedShots.length > 0 ? 'done' : 'idle';
    }
    // The photos step claims itself with phase 'running' before it fetches
    // anything. A result exists, so the generic branch below would call it
    // done — green for a step that is still working, or dead.
    if (s === 'photos' && photosResult?.phase === 'running') return 'waiting';
    // Both of these stop on a clock and ask to be clicked again, so a result
    // is not the same as a finished job. Amber until the step says 'done';
    // green for a half-tagged pile is the exact lie that let a review happen
    // over photos nothing had looked at (owner 2026-08-23).
    if (s === 'ingest' || s === 'tag') {
      const r = run?.step_results[s] as { phase?: string; error?: string } | undefined;
      if (!r) return 'idle';
      if (r.error) return 'failed';
      return r.phase === 'done' ? 'done' : 'waiting';
    }
    const r = run?.step_results[resultKey(s as StepName)] as { error?: string } | undefined;
    if (!r) return 'idle';
    return r.error ? 'failed' : 'done';
  };

  // Compact one-liners for the two sourcing steps now living in the header.
  type ResearchPoi = {
    name: string;
    bucket?: string;
    why?: string;
    approx_miles?: number;
    source?: string;
  };
  const researchRaw = run?.step_results.agent_research as
    | {
        agents?: Record<
          string,
          { parsed?: { pois?: ResearchPoi[]; community_site?: string } | null }
        >;
        prompt?: string;
      }
    | undefined;
  // Both agents propose, and they overlap — dedupe by name so the panel shows
  // the candidate list rather than the same place twice.
  const researchPois = [
    ...new Map(
      Object.values(researchRaw?.agents ?? {})
        .flatMap((a) => a?.parsed?.pois ?? [])
        .map((poi) => [poi.name, poi]),
    ).values(),
  ];
  const resolveRaw = run?.step_results.resolve as
    | {
        resolved?: Array<{
          name?: string;
          bucket?: string;
          distance_m?: number | null;
          is_new?: boolean;
          in_film?: boolean;
        }>;
        dropped?: Array<{ name?: string; reason?: string }>;
      }
    | undefined;

  /**
   * Run one step. `runId` is threaded explicitly rather than read from state:
   * inside a chained loop, `runs` is a stale closure, so every step after the
   * first would create its own run and each would see an empty predecessor.
   */
  const runStep = useCallback(
    async (step: StepName, runId?: string): Promise<string | null> => {
      setRunning(step);
      setStepError(null);
      try {
        // Research is expensive and cached per-run, so it always starts a fresh
        // run — otherwise the button looks inert (owner 2026-08-16).
        let rid = runId ?? (step === 'research' ? undefined : runs[0]?.id);
        if (!rid) {
          const created = await fetch(`/api/admin/community-tour/${communityId}/runs`, {
            method: 'POST',
          });
          if (!created.ok) {
            setStepError('Could not create run');
            return null;
          }
          rid = ((await created.json()) as { run: { id: string } }).run.id;
        }
        const res = await fetch(`/api/admin/community-tour/${communityId}/runs/${rid}/step`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // `assemble` is two-phase server-side: without `approve` it only
          // stages the shot list and inserts nothing. The old accordion had a
          // preview panel to justify that; this UI shows the shot list in the
          // table's Plan column instead, so the staging phase is a click that
          // does nothing visible — and that is exactly what it did (owner
          // 2026-08-20: "clicked assemble, no response").
          body: JSON.stringify({ step, ...(step === 'assemble' ? { approve: true } : {}) }),
        });
        const body = (await res.json()) as {
          ok?: boolean;
          error?: string;
          message?: string;
          notReady?: number;
          result?: { error?: string; message?: string };
        };
        if (!res.ok || !body.ok) {
          setStepError(`${step}: ${body.message ?? body.error ?? `HTTP ${res.status}`}`);
          return null;
        }
        // A REFUSAL, not a failure: every handler returns `{ error, message }`
        // when its inputs are not ready ("run resolve first", "N photos are
        // still untagged"), and the route wraps that in a perfectly successful
        // HTTP 200. Nothing read it, so a refusal looked exactly like a step
        // that had run and done nothing — and `filter` now refuses on purpose,
        // to keep a half-tagged pile from reaching the review gate.
        if (body.result?.error) {
          setStepError(`${step}: ${body.result.message ?? body.result.error}`);
          return null;
        }
        if (step === 'assemble' && body.notReady) {
          // Not an error — the film still renders, just without these. Said
          // out loud because the worker skips them silently.
          setStepError(
            `${body.notReady} shot(s) have no clip in any engine and will be missing from the film — run Render first.`,
          );
        }
        return rid;
      } finally {
        setRunning(null);
        await loadRuns();
      }
    },
    [communityId, runs, loadRuns],
  );

  /** The automated half only — it stops at the review gate, by construction. */
  const runAutomated = useCallback(async () => {
    let rid: string | undefined;
    for (const s of AUTOMATABLE_STEPS) {
      const got = await runStep(s, rid);
      if (!got) return; // a failed step stops the chain; the error is on screen
      rid = got;
    }
  }, [runStep]);

  const loadClips = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/admin/community-tour/${communityId}/clips`);
      if (!res.ok) return;
      const body = (await res.json()) as { clips: ClipRow[] };
      setClipRows(body.clips);
    } catch {
      /* transient — next tick retries */
    } finally {
      inFlight.current = false;
    }
  }, [communityId]);

  useEffect(() => {
    void loadClips();
  }, [loadClips]);

  // Merge clip status into photo rows (keyed by photo id).
  const clipById = new Map(clipRows.map((c) => [c.photo_id, c]));
  const enriched = photos.map((p) => {
    const c = clipById.get(p.id);
    if (!c) return p;
    return {
      ...p,
      recommended: c.recommended,
      clip: c.clip,
      depthflow_clip: c.depthflow_clip,
      kenburns_clip: c.kenburns_clip,
    };
  });

  /**
   * EVERY fetched photo, in the three review sections.
   *
   * A filter to the run's `resolved_poi_ids` used to hide anything belonging to
   * a POI that missed the film's 10-place budget. Once incumbency landed, the
   * three POIs this run discovered lost the budget on score — and the pipeline
   * had already fetched and tagged nine photos for them, which the table then
   * silently hid. Paying to fetch a photo and then not showing it is the one
   * thing the review gate exists to prevent (owner 2026-08-20: "just show all
   * fetched and tagged photos in 3 categories").
   *
   * The grouping does the work the filter was trying to do: approved is the
   * current cut, rejected is out, and everything else is the pile to draw from.
   */
  const visible = enriched;

  /**
   * The shot list, keyed by photo, for the table's Plan column.
   *
   * PhotoTable has always taken a `plan` prop and this surface has never
   * passed one, so the column read "—" for every row. It went unnoticed while
   * the shot list was also rendered in TourPipeline's step panel; deleting that
   * panel left the plan with nowhere to appear at all, and running Plan looked
   * like it had done nothing (owner 2026-08-20: "nothing showing in plan
   * column").
   */
  const planByPhoto = Object.fromEntries(
    ((run?.step_results.photos as { shots?: PlanShot[] } | undefined)?.shots ?? []).map((sh) => [
      sh.photo_id,
      {
        sort_order: sh.sort_order ?? 0,
        engine: sh.engine,
        move: sh.move ?? '',
        duration_s: sh.duration_s,
        ai_generated: sh.ai_generated ?? false,
        prompt: sh.prompt ?? null,
      },
    ]),
  );

  /** The script and the music `plan` chose, for review before either is heard. */
  const soundtrack = run?.step_results.photos as
    | {
        narration?: { voice?: string; error?: string; segments?: NarrationSegmentView[] };
        bgm?: BgmChoiceView | null;
      }
    | undefined;
  const narration = soundtrack?.narration;
  const bgm = soundtrack?.bgm ?? undefined;
  // The `bgm` bucket is public, so the admin can stream the exact file the
  // render will use rather than a re-pick. `storageBase` is the project root
  // (see the page that passes it), so the full Storage path goes on here.
  const bgmUrl = bgm
    ? `${storageBase.replace(/\/$/, '')}/storage/v1/object/public/bgm/${bgm.path
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`
    : undefined;

  /** Why each photo the plan considered is NOT in the cut, keyed by photo. */
  const dropReasons = Object.fromEntries(
    (
      (run?.step_results.photos as { dropped?: Array<{ photo_id: string; reason: string }> })
        ?.dropped ?? []
    ).map((d) => [d.photo_id, d.reason]),
  );

  /** What a step is actually doing, when the chip alone would not say. */
  const noteOf = (s: StripStep): string | undefined => {
    if (active?.step === s) {
      return activeStale
        ? `no response for ${formatAge(activeAgeMs ?? 0)} — re-run`
        : `running… ${formatAge(activeAgeMs ?? 0)}`;
    }
    if (s === 'ingest') {
      const r = run?.step_results.ingest as
        | {
            note?: string;
            pages_done?: number;
            pages_total?: number;
            pages_left?: number;
            added?: number;
          }
        | undefined;
      if (!r) return undefined;
      if (r.note) return r.note;
      const done = r.pages_done ?? 0;
      // The batch stopped on its clock. Saying which page it reached is the
      // difference between "click again" and "it did nothing".
      if ((r.pages_left ?? 0) > 0) {
        return `${done}/${r.pages_total ?? 0} pages · ${r.added ?? 0} photos — click again`;
      }
      return `${done} page${done === 1 ? '' : 's'} · ${r.added ?? 0} photos`;
    }
    if (s === 'tag') {
      const r = run?.step_results.tag as
        | { tagged?: number; total?: number; remaining?: number }
        | undefined;
      if (!r) return undefined;
      if ((r.remaining ?? 0) > 0) {
        return `${r.tagged ?? 0}/${r.total ?? 0} tagged — click again`;
      }
      return r.total ? `${r.total} tagged` : 'nothing left to tag';
    }
    if (s === 'filter') {
      const r = run?.step_results.filter as { rejected?: number; kept?: number } | undefined;
      if (!r) return undefined;
      return `${r.rejected ?? 0} dropped · ${r.kept ?? 0} kept`;
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

  async function generateClip(
    photoId: string,
    engine?: string,
  ): Promise<{ ok: boolean; message?: string }> {
    // Reuse the latest run (or create one) and run the generate step for one
    // photo. The step route creates a photo_clips row (engine/duration from
    // the shot list); the seedance worker picks it up.
    const runsRes = await fetch(`/api/admin/community-tour/${communityId}/runs`);
    if (!runsRes.ok) return { ok: false, message: 'Could not load runs' };
    const runsBody = (await runsRes.json()) as {
      runs: Array<{ id: string; step_results: Record<string, unknown> }>;
    };
    let runId = runsBody.runs[0]?.id;
    if (!runId) {
      const createRes = await fetch(`/api/admin/community-tour/${communityId}/runs`, {
        method: 'POST',
      });
      if (!createRes.ok) return { ok: false, message: 'Could not create run' };
      const createBody = (await createRes.json()) as { run: { id: string } };
      runId = createBody.run.id;
    }
    const res = await fetch(`/api/admin/community-tour/${communityId}/runs/${runId}/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'generate', photoIds: [photoId], engine }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      return { ok: false, message: body.message ?? body.error ?? `HTTP ${res.status}` };
    }
    await loadClips();
    return { ok: true };
  }

  return (
    <div className="space-y-4">
      {/* 1 · Facts left, latest cut right. */}
      <TourHeader
        communityId={communityId}
        communityName={communityName}
        city={city}
        state={state}
        zip={zip}
        lat={lat}
        lng={lng}
        kind={kind}
        photoCount={photos.length}
        poiCount={poiCount}
        researchState={stateOf('research')}
        resolveState={stateOf('resolve')}
        researchSummary={researchPois.length > 0 ? `${researchPois.length} candidates` : null}
        resolveSummary={
          resolveRaw
            ? `${resolveRaw.resolved?.length ?? 0} resolved · ${resolveRaw.dropped?.length ?? 0} dropped`
            : null
        }
        researchPrompt={researchRaw?.prompt ?? null}
        researchPois={researchPois}
        resolvedPlaces={resolveRaw?.resolved ?? []}
        droppedPlaces={resolveRaw?.dropped ?? []}
        busy={!!running || (!!active?.step && !activeStale)}
        onRun={(s) => void runStep(s)}
      />

      {/* 2 · The whole pipeline as one row of chips. */}
      <TourStepStrip
        stateOf={stateOf}
        noteOf={noteOf}
        running={running}
        awaitingReview={awaitingReview}
        onRun={(s) => void runStep(s)}
        onRunAutomated={() => void runAutomated()}
        error={stepError}
      />

      {/* 3 · What the film will say. Written by plan, spoken at assembly —
           reviewable in between. Absent until plan has run. */}
      <NarrationPanel
        voice={narration?.voice}
        segments={narration?.segments ?? []}
        bgm={bgm}
        bgmUrl={bgmUrl}
        error={narration?.error}
      />

      {/* 4 · The ingest step's input: which pages it may read. Sits directly
           above the table those photos land in. The list it shows is built by
           the step itself (`sourcesFromResearch` plus the community site's own
           subpages) — this surface no longer derives it from the run blob. */}
      <PhotoSourcePanel communityId={communityId} onIngested={() => router.refresh()} />

      {/* 5 · THE workspace. Open, full width — everything is managed here
           (owner 2026-08-19: "one big table to manage and display
           everything"). It used to be shut behind a <details>. */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        {/* No heading here: PhotoTable owns the "All Photos" title. Two
            headings stacked on one table read as two tables (owner
            2026-08-19: "the format doesnt look right"). */}
        <PhotoTable
          table="poi_photos"
          storageBase={storageBase}
          bucket={bucket}
          photos={visible}
          onGenerateClip={generateClip}
          plan={planByPhoto}
          dropReasons={dropReasons}
        />
      </section>
    </div>
  );
}

/**
 * How long a server-side claim may stand before it reads as a corpse.
 *
 * The step route is `maxDuration = 300` on Vercel; past that the function is
 * gone whether or not it finished, so 330s is the platform's own answer plus a
 * margin for the clock.
 */
const ACTIVE_STALE_MS = 330_000;

/** "42s" / "3m 05s" — long enough runs need the minutes. */
function formatAge(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
}
