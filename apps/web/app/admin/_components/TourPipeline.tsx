'use client';

/**
 * TourPipeline — 8-panel Community Tour pipeline admin (owner 2026-08-15).
 *
 * Each step runs via POST /api/admin/community-tour/[id]/runs/[runId]/step,
 * output persists in community_tour_runs.step_results. Every panel shows its
 * step result; "Run all" chains steps in order. Steps that need no prior
 * data (research) start immediately; dependent steps return a clear message
 * until their prerequisite ran.
 *
 * Steps:
 *   1 community info    (DB read — always available)
 *   2 agent research    (Gemini grounding — inline, Vercel)
 *   3 resolve+merge     (Google firewall)
 *   4 <4 survivors      (widen hook — shown when resolve < 4)
 *   5 photos            (3 per POI — tag, shot list & clip generation live
 *                        in the table below this panel; steps 6/7 merged there)
 *   8 assemble          (ffmpeg concat — wire after clips ready)
 */

import { CheckCircle2, Loader2, Play, RefreshCw, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PhotoTable, type PhotoRow } from './PhotoTable';

type StepName = 'research' | 'resolve' | 'photos' | 'tag' | 'generate' | 'assemble';

const STEPS: Array<{ name: StepName; label: string; desc: string }> = [
  { name: 'research', label: '2 · Agent Research', desc: 'Gemini grounding' },
  { name: 'resolve', label: '3 · Resolve & Merge', desc: 'Google Places firewall' },
  {
    name: 'photos',
    label: '5 · Fetch Photos',
    desc: '3 per POI — tag, shot list & clips managed in table below',
  },
  { name: 'assemble', label: '8 · Assemble', desc: 'ffmpeg concat' },
];

interface Run {
  id: string;
  community_id: string;
  status: string;
  step_results: Record<string, unknown>;
  created_at: string;
}

export function TourPipeline({
  communityId,
  communityName,
  city,
  state,
  zip,
  lat,
  lng,
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
  storageBase: string;
  bucket: string;
  photos: PhotoRow[];
}) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [running, setRunning] = useState<StepName | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    const res = await fetch(`/api/admin/community-tour/${communityId}/runs`);
    if (!res.ok) return;
    const body = (await res.json()) as { runs: Run[] };
    setRuns(body.runs);
    if (!selectedRun && body.runs.length > 0) setSelectedRun(body.runs[0]!.id);
  }, [communityId, selectedRun]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  // Poll only while a step button is actually in flight (POST pending).
  // Research is now inline (Vercel) — it completes inside the POST, so no
  // separate "wait for the detached script" polling is needed.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      void loadRuns();
    }, 4000);
    return () => clearInterval(t);
  }, [running, loadRuns]);

  async function createRun(): Promise<string | null> {
    const res = await fetch(`/api/admin/community-tour/${communityId}/runs`, { method: 'POST' });
    if (!res.ok) return null;
    const body = (await res.json()) as { run: Run };
    setRuns((prev) => [body.run, ...prev]);
    setSelectedRun(body.run.id);
    return body.run.id;
  }

  async function runStep(step: StepName, runId: string | null): Promise<void> {
    // Research is expensive + cached per-run: "Run" always starts a fresh run
    // so the button visibly does something (owner 2026-08-16).
    const rid = step === 'research' ? await createRun() : (runId ?? (await createRun()));
    if (!rid) {
      setError('Could not create run');
      return;
    }
    setRunning(step);
    setError(null);
    try {
      const res = await fetch(`/api/admin/community-tour/${communityId}/runs/${rid}/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !body.ok) {
        setError(body.message ?? body.error ?? `HTTP ${res.status}`);
        return;
      }
    } finally {
      setRunning(null);
      await loadRuns();
    }
  }

  async function runAll(): Promise<void> {
    const rid = await createRun();
    if (!rid) {
      setError('Could not create run');
      return;
    }
    for (const s of STEPS) {
      setRunning(s.name);
      setError(null);
      try {
        const res = await fetch(`/api/admin/community-tour/${communityId}/runs/${rid}/step`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: s.name }),
        });
        const body = (await res.json()) as { ok?: boolean; error?: string; message?: string };
        if (!res.ok || !body.ok) {
          setError(`${s.label}: ${body.message ?? body.error ?? 'failed'}`);
          break;
        }
      } finally {
        setRunning(null);
        await loadRuns();
      }
    }
  }

  const run = runs.find((r) => r.id === selectedRun);

  // Steps 6/7 (tag + generate clips) merged into the photos panel — the table
  // below drives per-photo actions (owner 2026-08-17). Clip status fetched
  // separately so tag/generate reflect immediately without a full reload.
  const [clipRows, setClipRows] = useState<
    Array<{
      photo_id: string;
      clip: {
        engine: string;
        duration_s: number | null;
        status: string;
        video_url: string | null;
        cost_usd: number | null;
        error: string | null;
      } | null;
    }>
  >([]);
  const [tagPending, setTagPending] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);

  const loadClips = useCallback(async () => {
    if (!run?.id) return;
    const res = await fetch(`/api/admin/community-tour/${communityId}/clips`);
    if (!res.ok) return;
    const body = (await res.json()) as { clips: typeof clipRows };
    setClipRows(body.clips);
  }, [communityId, run?.id]);

  const clipById = new Map(clipRows.map((c) => [c.photo_id, c.clip]));
  const stepPhotos = photos.map((p) => {
    const clip = clipById.get(p.id);
    return clip !== undefined ? { ...p, clip } : p;
  });

  async function tagPhotos(runId: string): Promise<void> {
    setTagPending(true);
    setTagError(null);
    try {
      const res = await fetch(`/api/admin/community-tour/${communityId}/runs/${runId}/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'tag' }),
      });
      const body = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !body.ok) {
        setTagError(body.message ?? body.error ?? `HTTP ${res.status}`);
        return;
      }
      await loadRuns();
      await loadClips();
    } finally {
      setTagPending(false);
    }
  }

  async function generateClip(photoId: string): Promise<{ ok: boolean; message?: string }> {
    if (!run?.id) return { ok: false, message: 'No run yet — create one first.' };
    const res = await fetch(`/api/admin/community-tour/${communityId}/runs/${run.id}/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'generate', photoIds: [photoId] }),
    });
    const body = (await res.json()) as { ok?: boolean; message?: string; error?: string };
    if (!res.ok || !body.ok) return { ok: false, message: body.message ?? body.error ?? `HTTP ${res.status}` };
    await loadClips();
    return { ok: true };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-lg font-semibold">
            <Sparkles size={16} aria-hidden />
            Community Tour Pipeline
          </h2>
          <p className="text-ink2 text-xs">
            {communityName} · {[city, state].filter(Boolean).join(', ')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {runs.length > 0 && (
            <select
              value={selectedRun ?? ''}
              onChange={(e) => setSelectedRun(e.target.value)}
              className="rounded-md border border-line bg-bg px-2 py-1 text-ink"
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {new Date(r.created_at).toLocaleString()} · {r.status}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => void runAll()}
            disabled={!!running}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink hover:border-bronze disabled:cursor-not-allowed disabled:text-muted"
          >
            <Play size={14} aria-hidden />
            Run all
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Step 1 — community info (always visible) */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h3 className="text-sm font-semibold">1 · Community Info</h3>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-ink3">Name</dt>
            <dd className="text-ink">{communityName}</dd>
          </div>
          <div>
            <dt className="text-ink3">Location</dt>
            <dd className="text-ink">{[city, state, zip].filter(Boolean).join(', ') || '—'}</dd>
          </div>
          <div>
            <dt className="text-ink3">Coordinates</dt>
            <dd className="tabular-nums text-ink">
              {lat != null && lng != null ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : '—'}
            </dd>
          </div>
        </dl>
      </section>

      {/* Steps 2-5, 8 */}
      {STEPS.map((s) => {
        // research results live under agent_research (written by the detached
        // agent script); every other step uses its own key.
        const resultKey = s.name === 'research' ? 'agent_research' : s.name;
        const done = !!run?.step_results[resultKey];
        const result = run?.step_results[resultKey] as
          | {
              resolved?: unknown[];
              dropped?: unknown[];
              tagged?: number;
              shots?: unknown[];
              created?: number;
              started?: boolean;
              error?: string;
            }
          | undefined;
        // Live research progress (script writes research_progress while the
        // two agents run; agent_research landing is the done signal).
        // Only trust it while THIS button actually triggered a run — a stale
        // research_progress blob (dead process) must not show a spinner.
        const researchProgress = run?.step_results.research_progress as
          | {
              status?: string;
              started_at?: string;
              agents_done?: string[];
              error?: string;
            }
          | undefined;
        const researching = running === 'research' && researchProgress?.status === 'running';
        const runSeconds = researchProgress?.started_at
          ? Math.max(
              0,
              Math.round((Date.now() - new Date(researchProgress.started_at).getTime()) / 1000),
            )
          : 0;
        return (
          <section key={s.name} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  {s.label}
                  {done && <CheckCircle2 size={13} className="text-emerald-600" />}
                  {researching && (
                    <Loader2 size={13} className="animate-spin text-bronze" aria-hidden />
                  )}
                </h3>
                <p className="text-ink2 text-xs">{s.desc}</p>
              </div>
              <button
                type="button"
                onClick={() => void runStep(s.name, selectedRun)}
                disabled={!!running}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg px-3 py-1.5 text-xs text-ink hover:border-bronze disabled:cursor-not-allowed disabled:text-muted"
              >
                {running === s.name || researching ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <RefreshCw size={13} />
                )}
                {running === s.name || researching ? 'Running…' : done ? 'Re-run' : 'Run'}
              </button>
            </div>

            {researching && (
              <div className="mt-2 flex items-center gap-2 text-xs text-ink2">
                <Loader2 size={13} className="animate-spin text-bronze" aria-hidden />
                {researchProgress?.agents_done?.length ?? 0}/2 agents done · {runSeconds}s elapsed
              </div>
            )}
            {running === 'research' && researchProgress?.status === 'failed' && (
              <div className="mt-2 text-xs text-red-600">
                Research failed: {researchProgress.error ?? 'unknown'}
              </div>
            )}

            {done && result && (
              <div className="mt-2 text-xs text-ink2">
                <StepResult
                  s={s.name}
                  result={result}
                  storageBase={storageBase}
                  bucket={bucket}
                  photos={stepPhotos}
                  onGenerateClip={generateClip}
                />
                {s.name === 'photos' && run && (
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void tagPhotos(run.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg px-3 py-1.5 text-xs text-ink hover:border-bronze"
                    >
                      {tagPending ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Sparkles size={13} />
                      )}
                      {tagPending ? 'Tagging…' : 'Tag all untagged'}
                    </button>
                    {tagError && <span className="text-red-600">{tagError}</span>}
                  </div>
                )}
              </div>
            )}
            {!done && !result && <div className="mt-2 text-xs text-ink3">Not run yet.</div>}
          </section>
        );
      })}
    </div>
  );
}

function StepResult({
  s,
  result,
  storageBase,
  bucket,
  photos,
  onGenerateClip,
}: {
  s: StepName;
  result: Record<string, unknown>;
  storageBase: string;
  bucket: string;
  photos: PhotoRow[];
  onGenerateClip?: (photoId: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  if (s === 'research') {
    const r = result as {
      prompt?: string;
      agents?: {
        gemini_a?: {
          ok?: boolean;
          parsed?: { pois?: unknown[] } | null;
          raw?: string | null;
          error?: string | null;
          usage?: { input_tokens?: number; output_tokens?: number; total_cost_usd?: number } | null;
        };
        gemini_b?: {
          ok?: boolean;
          parsed?: { pois?: unknown[] } | null;
          raw?: string | null;
          error?: string | null;
          usage?: { input_tokens?: number; output_tokens?: number; total_cost_usd?: number } | null;
        };
      };
      community?: { name?: string };
    };
    const geminiAPois = r.agents?.gemini_a?.parsed?.pois?.length ?? 0;
    const geminiBPois = r.agents?.gemini_b?.parsed?.pois?.length ?? 0;
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-3">
          <span className={r.agents?.gemini_a?.ok ? 'text-emerald-600' : 'text-red-600'}>
            gemini_a {r.agents?.gemini_a?.ok ? `${geminiAPois} POIs` : 'failed'}
            {r.agents?.gemini_a?.usage && (
              <span className="text-ink3">
                {' '}
                · {r.agents.gemini_a.usage.input_tokens?.toLocaleString()} in /{' '}
                {r.agents.gemini_a.usage.output_tokens?.toLocaleString()} out
                {r.agents.gemini_a.usage.total_cost_usd
                  ? ` · $${r.agents.gemini_a.usage.total_cost_usd.toFixed(4)}`
                  : ''}
              </span>
            )}
          </span>
          <span className={r.agents?.gemini_b?.ok ? 'text-emerald-600' : 'text-red-600'}>
            gemini_b {r.agents?.gemini_b?.ok ? `${geminiBPois} POIs` : 'failed'}
            {r.agents?.gemini_b?.usage && (
              <span className="text-ink3">
                {' '}
                · {r.agents.gemini_b.usage.input_tokens?.toLocaleString()} in /{' '}
                {r.agents.gemini_b.usage.output_tokens?.toLocaleString()} out
              </span>
            )}
          </span>
        </div>
        {r.prompt && (
          <details open>
            <summary className="cursor-pointer text-ink2">Prompt (fed to agent)</summary>
            <pre className="bg-bg mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded border border-line p-2 text-[10px] text-ink2">
              {r.prompt}
            </pre>
          </details>
        )}
        {r.agents?.gemini_a?.raw && (
          <details>
            <summary className="cursor-pointer text-ink2">gemini_a raw ({geminiAPois} POIs)</summary>
            <pre className="bg-bg mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded border border-line p-2 text-[10px] text-ink2">
              {r.agents.gemini_a.raw}
            </pre>
          </details>
        )}
        {r.agents?.gemini_b?.raw && (
          <div>
            <h4 className="text-ink2 text-xs font-medium">gemini_b results ({geminiBPois} POIs)</h4>
            <div className="overflow-x-auto rounded border border-line">
              <table className="w-full border-collapse text-left text-[10px]">
                <thead className="bg-surface text-ink2">
                  <tr>
                    <th className="border-line border-b px-2 py-1">Name</th>
                    <th className="border-line border-b px-2 py-1">Address</th>
                    <th className="border-line border-b px-2 py-1">Bucket</th>
                    <th className="border-line border-b px-2 py-1">Conf</th>
                    <th className="border-line border-b px-2 py-1">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {(r.agents?.gemini_b?.parsed?.pois ?? []).map((p, i) => {
                    const poi = p as {
                      name?: string;
                      address_hint?: string;
                      bucket?: string;
                      confidence?: string;
                      why?: string;
                    };
                    return (
                      <tr
                        key={`${poi.name ?? 'poi'}-${i}`}
                        className="border-line border-b align-top last:border-b-0"
                      >
                        <td className="px-2 py-1 font-medium">{poi.name ?? '—'}</td>
                        <td className="px-2 py-1 text-ink2">{poi.address_hint ?? '—'}</td>
                        <td className="px-2 py-1 text-ink2">{poi.bucket ?? '—'}</td>
                        <td className="px-2 py-1">{poi.confidence ?? '—'}</td>
                        <td className="max-w-[280px] px-2 py-1 text-ink2">
                          {poi.why && poi.why.length > 120
                            ? `${poi.why.slice(0, 120)}…`
                            : (poi.why ?? '—')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <details className="mt-1">
              <summary className="cursor-pointer text-ink2">raw JSON</summary>
              <pre className="bg-bg mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded border border-line p-2 text-[10px] text-ink2">
                {r.agents.gemini_b.raw}
              </pre>
            </details>
          </div>
        )}
        {r.agents?.gemini_a?.error && (
          <div className="text-red-600">gemini_a: {r.agents.gemini_a.error}</div>
        )}
        {r.agents?.gemini_b?.error && (
          <div className="text-red-600">gemini_b: {r.agents.gemini_b.error}</div>
        )}
      </div>
    );
  }
  if (s === 'resolve') {
    const r = result as {
      resolved?: Array<{
        name: string;
        bucket: string;
        score: number;
        agreement: number;
        place_id?: string;
        source?: string;
        confidence?: string;
        formatted_address?: string;
      }>;
      dropped?: Array<{ name: string; reason: string }>;
    };
    const resolved = r.resolved ?? [];
    return (
      <div>
        <div className="mb-1">
          {resolved.length} resolved · {r.dropped?.length ?? 0} dropped
        </div>
        <div className="overflow-x-auto rounded border border-line">
          <table className="w-full border-collapse text-left text-[10px]">
            <thead className="bg-surface text-ink2">
              <tr>
                <th className="border-line border-b px-2 py-1">Name</th>
                <th className="border-line border-b px-2 py-1">Address</th>
                <th className="border-line border-b px-2 py-1">Bucket</th>
                <th className="border-line border-b px-2 py-1">Score</th>
                <th className="border-line border-b px-2 py-1">Agreement</th>
              </tr>
            </thead>
            <tbody>
              {resolved.map((p, i) => (
                <tr
                  key={`${p.name}-${i}`}
                  className="border-line border-b align-top last:border-b-0"
                >
                  <td className="px-2 py-1 font-medium">{p.name}</td>
                  <td className="max-w-[260px] px-2 py-1 text-ink2">
                    {p.formatted_address ?? '—'}
                  </td>
                  <td className="px-2 py-1 text-ink2">{p.bucket}</td>
                  <td className="tabular-nums px-2 py-1">{p.score.toFixed(2)}</td>
                  <td className="px-2 py-1">{p.agreement}/2</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {r.dropped && r.dropped.length > 0 && (
          <details className="mt-1">
            <summary className="cursor-pointer text-ink2">dropped ({r.dropped.length})</summary>
            <ul className="mt-1 space-y-0.5">
              {r.dropped.map((p, i) => (
                <li key={`${p.name}-${i}`} className="text-ink2">
                  {p.name} — {p.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    );
  }
  if (s === 'photos') {
    const r = result as {
      results?: Record<string, { fetched?: number; reused?: number; skipped?: number }>;
      resolved_poi_ids?: string[];
    };
    const vals = Object.values(r.results ?? {});
    const fetched = vals.reduce((a, v) => a + (v.fetched ?? 0), 0);
    const reused = vals.reduce((a, v) => a + (v.reused ?? 0), 0);
    const poiIds = new Set(r.resolved_poi_ids ?? []);
    // Same shape as the big table below: every photo of the resolve-surviving
    // POIs, filtered to this run's POI set. Legacy runs (before resolved_poi_ids
    // existed) fall back to all photos — the per-POI mapping is not recoverable.
    const isLegacy = (r.resolved_poi_ids ?? []).length === 0;
    const stepPhotos = isLegacy
      ? (photos ?? [])
      : (photos ?? []).filter((p) => p.poi_id && poiIds.has(p.poi_id));
    return (
      <div className="space-y-2">
        <div className="text-xs">
          {fetched} fetched · {reused} reused · {stepPhotos.length} photos
          {isLegacy
            ? ' (legacy run — no per-POI mapping)'
            : ` across ${poiIds.size} resolved POIs`}
        </div>
        {stepPhotos.length > 0 ? (
          <PhotoTable
            table="poi_photos"
            storageBase={storageBase}
            bucket={bucket}
            photos={stepPhotos}
            onGenerateClip={onGenerateClip}
          />
        ) : (
          <div className="text-xs text-ink3">No photos fetched for this run yet.</div>
        )}
      </div>
    );
  }
  if (s === 'assemble') {
    const r = result as { video_url?: string };
    return r.video_url ? (
      <a href={r.video_url} target="_blank" rel="noreferrer" className="text-bronze underline">
        Watch final video
      </a>
    ) : (
      <div>Not assembled yet — run after clips are ready.</div>
    );
  }
  return null;
}
