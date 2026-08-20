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
 *   PhotoTable      OPEN, full width, SELECTED photos — the workspace
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
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const router = useRouter();

  const loadRuns = useCallback(async () => {
    const res = await fetch(`/api/admin/community-tour/${communityId}/runs`);
    if (!res.ok) return;
    const body = (await res.json()) as { runs: Run[] };
    setRuns(body.runs);
  }, [communityId]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const run = runs[0];

  // `research` writes under `agent_research`; every other step uses its name.
  const resultKey = (s: StepName) => (s === 'research' ? 'agent_research' : s);
  // `plan` writes back into the `photos` result — it is the second half of what
  // used to be one step — so its doneness is that result reaching phase 'done'.
  const photosResult = run?.step_results.photos as { phase?: string } | undefined;
  const awaitingReview = photosResult?.phase === 'review';

  const stateOf = (s: StripStep | StepName): StepState => {
    if (running === s) return 'running';
    // `review` has no server step, and `plan` writes back into the photos
    // result rather than a key of its own. Both are "done" once planning has
    // happened — planning is the only thing that can follow the review.
    if (s === 'review' || s === 'plan') {
      return photosResult?.phase === 'done' ? 'done' : 'idle';
    }
    const r = run?.step_results[resultKey(s as StepName)] as { error?: string } | undefined;
    if (!r) return 'idle';
    return r.error ? 'failed' : 'done';
  };

  // Compact one-liners for the two sourcing steps now living in the header.
  type ResearchPoi = { name: string; bucket?: string; why?: string; approx_miles?: number };
  const researchRaw = run?.step_results.agent_research as
    | { agents?: Record<string, { parsed?: { pois?: ResearchPoi[] } | null }>; prompt?: string }
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
          body: JSON.stringify({ step }),
        });
        const body = (await res.json()) as { ok?: boolean; error?: string; message?: string };
        if (!res.ok || !body.ok) {
          setStepError(`${step}: ${body.message ?? body.error ?? `HTTP ${res.status}`}`);
          return null;
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
   * The table shows the SELECTED photos, not everything ever fetched.
   *
   * Owner 2026-08-19: "we should not use all photos, only the selected ones."
   * Aberdeen has 103 photos across 31 POIs, but only the POIs that survived
   * selection reach the film — most of those rows are for places the tour will
   * never visit, and they buried the ones under review.
   *
   * "Selected" is the run's `resolved_poi_ids`: the POIs the pipeline kept.
   * Rejected photos of those POIs stay visible on purpose — the review is of
   * the approved AND the rejected.
   *
   * The escape hatch is deliberate. Before the photos step has run there is no
   * selection to filter by, and an admin chasing a specific frame needs a way
   * back to the full set.
   */
  const selectedPoiIds = new Set(
    (run?.step_results.photos as { resolved_poi_ids?: string[] } | undefined)?.resolved_poi_ids ??
      [],
  );
  const selected =
    selectedPoiIds.size > 0
      ? enriched.filter((p) => !!p.poi_id && selectedPoiIds.has(p.poi_id))
      : enriched;
  const visible = showAllPhotos ? enriched : selected;
  const hiddenCount = enriched.length - selected.length;

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
        busy={!!running}
        onRun={(s) => void runStep(s)}
      />

      {/* 2 · The whole pipeline as one row of chips. */}
      <TourStepStrip
        stateOf={stateOf}
        running={running}
        awaitingReview={awaitingReview}
        onRun={(s) => void runStep(s)}
        onRunAutomated={() => void runAutomated()}
        error={stepError}
      />

      {/* 3 · Hand-picked sources: a page URL in, pending photos out. Sits
           directly above the table those photos land in. */}
      <PhotoSourcePanel communityId={communityId} onIngested={() => router.refresh()} />

      {/* 4 · THE workspace. Open, full width — everything is managed here
           (owner 2026-08-19: "one big table to manage and display
           everything"). It used to be shut behind a <details>. */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        {/* No heading here: PhotoTable owns the "All Photos" title. Two
            headings stacked on one table read as two tables (owner
            2026-08-19: "the format doesnt look right"). */}
        {hiddenCount > 0 && (
          <div className="mb-2 text-[11px] text-ink2">
            <button
              type="button"
              onClick={() => setShowAllPhotos((v) => !v)}
              className="underline hover:text-ink"
            >
              {showAllPhotos
                ? 'show selected POIs only'
                : `also show ${hiddenCount} photos from unselected POIs`}
            </button>
          </div>
        )}
        <PhotoTable
          table="poi_photos"
          storageBase={storageBase}
          bucket={bucket}
          photos={visible}
          onGenerateClip={generateClip}
        />
      </section>
    </div>
  );
}
