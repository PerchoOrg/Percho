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
 *   TourHeader      facts (left) + latest cut (right)
 *   TourStepStrip   the whole pipeline as one row of clickable chips
 *   PhotoSourcePanel
 *   PhotoTable      OPEN, full width — the workspace
 *   Step details    collapsed; the per-step result dumps
 *
 * What this replaced: a full-width video, then five stacked accordion panels,
 * then the table collapsed behind a `<details>`. The thing an admin actually
 * works in was the one thing below the fold and shut.
 *
 * The step results are demoted, not deleted. Losing the research candidate
 * list or the shot-list plan would make several classes of bug invisible again
 * — most of this month's pipeline bugs were found by reading those panels.
 */

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PhotoSourcePanel } from './PhotoSourcePanel';
import type { PhotoRow } from './PhotoTable';
import { PhotoTable } from './PhotoTable';
import { TourHeader } from './TourHeader';
import { TourPipeline } from './TourPipeline';
import { AUTOMATABLE_STEPS, type StepName, type StepState, TourStepStrip } from './TourStepStrip';

interface ClipRow {
  photo_id: string;
  poi_id: string;
  photo_url: string;
  ai_tags: unknown;
  recommended: boolean;
  clip: {
    engine: string;
    duration_s: number | null;
    status: string;
    video_url: string | null;
    cost_usd: number | null;
    error: string | null;
  } | null;
  dakb_clip: {
    engine: string;
    duration_s: number | null;
    status: string;
    video_url: string | null;
    cost_usd: number | null;
    error: string | null;
  } | null;
}

interface Run {
  id: string;
  step_results: Record<string, unknown>;
  status: string;
}

export function CommunityTourSection({
  communityId,
  communityName,
  slug,
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
  slug: string | null;
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

  const stateOf = (s: StepName): StepState => {
    if (running === s) return 'running';
    if (s === 'plan') return photosResult?.phase === 'done' ? 'done' : 'idle';
    const r = run?.step_results[resultKey(s)] as { error?: string } | undefined;
    if (!r) return 'idle';
    return r.error ? 'failed' : 'done';
  };

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
    return { ...p, recommended: c.recommended, clip: c.clip, dakb_clip: c.dakb_clip };
  });

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
        slug={slug}
        city={city}
        state={state}
        zip={zip}
        lat={lat}
        lng={lng}
        kind={kind}
        photoCount={photos.length}
        poiCount={poiCount}
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
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-semibold text-ink text-sm">Photos ({enriched.length})</h2>
          <span className="text-[11px] text-ink2">
            review, reframe, tag and generate clips — all from this table
          </span>
        </div>
        <PhotoTable
          table="poi_photos"
          storageBase={storageBase}
          bucket={bucket}
          photos={enriched}
          onGenerateClip={generateClip}
        />
      </section>

      {/* 5 · The per-step result dumps, demoted but kept: most of this month's
           pipeline bugs were found by reading them. */}
      <details className="rounded-2xl border border-line bg-surface">
        <summary className="cursor-pointer p-4 font-semibold text-ink text-sm">
          Step details
        </summary>
        <div className="px-4 pb-4">
          <TourPipeline
            communityId={communityId}
            communityName={communityName}
            city={city}
            state={state}
            lat={lat}
            lng={lng}
            storageBase={storageBase}
            bucket={bucket}
            photos={photos}
            readOnly
          />
        </div>
      </details>
    </div>
  );
}
