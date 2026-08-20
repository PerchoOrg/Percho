'use client';

/**
 * TourHeader — the community and how it was sourced (left), latest cut (right).
 *
 * Owner 2026-08-19: "on top show community information on the left, and show
 * latest generated video on the right", then: "a lot of empty on the top left
 * box, you can move 1) and 2) to this area."
 *
 * So Research and Resolve live HERE, not in the step strip below. They are the
 * right shape for it: both are about establishing WHICH PLACES this community
 * has — the same question the facts beside them answer — and neither is
 * something you touch again once it has run. The strip below is the production
 * line, and it now starts where the photos do.
 *
 * The video column is fixed-width and the info column flexes, because the
 * video's width is not negotiable — it is a portrait player at the render
 * canvas's aspect, and letting it stretch would letterbox it.
 */

import { streamIframeUrl } from '@/lib/cloudflare/stream';
import { CANVAS_H, CANVAS_W } from '@/lib/poi/tour-orchestrator/scheduler';
import { Check, Loader2, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { StepState } from './TourStepStrip';

interface AssemblyRow {
  id: string;
  status: string;
  cf_stream_uid: string | null;
  error: string | null;
  created_at: string;
}

const POLL_MS = 10_000;

export function TourHeader({
  communityId,
  communityName,
  city,
  state,
  zip,
  lat,
  lng,
  kind,
  photoCount,
  poiCount,
  researchState,
  resolveState,
  researchSummary,
  resolveSummary,
  researchPois,
  resolvedPlaces,
  droppedPlaces,
  busy,
  onRun,
}: {
  communityId: string;
  communityName: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  kind: string | null;
  photoCount: number;
  poiCount: number;
  researchState: StepState;
  resolveState: StepState;
  /** One line each, e.g. "14 candidates" — null before the step has run. */
  researchSummary: string | null;
  resolveSummary: string | null;
  /** What Research proposed, and what Resolve made of it. */
  researchPois: Array<{ name: string; bucket?: string; why?: string; approx_miles?: number }>;
  resolvedPlaces: Array<{
    name?: string;
    bucket?: string;
    distance_m?: number | null;
    is_new?: boolean;
    in_film?: boolean;
  }>;
  droppedPlaces: Array<{ name?: string; reason?: string }>;
  busy: boolean;
  onRun: (step: 'research' | 'resolve') => void;
}) {
  const [rows, setRows] = useState<AssemblyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/admin/community-tour/${communityId}/assemblies`);
        if (!res.ok) return;
        const body = (await res.json()) as { assemblies: AssemblyRow[] };
        if (!cancelled) setRows(body.assemblies);
      } catch {
        /* transient — next poll retries */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const t = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [communityId]);

  const latest = rows[0];
  const ready = latest?.status === 'ready';
  const iframeUrl = latest?.cf_stream_uid ? streamIframeUrl(latest.cf_stream_uid) : null;
  const readyCount = rows.filter((r) => r.status === 'ready').length;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
      {/* ── Left: what this community IS ─────────────────────────────── */}
      <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold text-ink">{communityName}</h1>
          {kind && (
            <span className="rounded-full bg-ink2/10 px-2 py-0.5 text-xs font-medium text-ink2">
              {kind}
            </span>
          )}
        </div>
        <div className="mt-1 text-sm text-ink2">
          {[city, state, zip].filter(Boolean).join(', ') || 'no address on file'}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Fact label="POIs" value={String(poiCount)} />
          <Fact label="Photos" value={String(photoCount)} />
          <Fact label="Videos" value={String(readyCount)} />
          <Fact
            label="Coordinates"
            value={lat != null && lng != null ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : '—'}
          />
        </dl>

        {/* Sourcing — how this community got its list of places. */}
        <div className="mt-4 grid gap-2 border-line border-t pt-4 sm:grid-cols-2">
          <SourcingStep
            n={1}
            label="Agent Research"
            hint="Gemini finds the places"
            state={researchState}
            summary={researchSummary}
            busy={busy}
            onRun={() => onRun('research')}
          >
            {researchPois.length > 0 && (
              <ul className="space-y-1">
                {researchPois.map((poi) => (
                  <li key={poi.name} className="text-[11px] leading-snug">
                    <span className="font-medium text-ink">{poi.name}</span>
                    <span className="text-ink2">
                      {poi.bucket ? ` · ${poi.bucket}` : ''}
                      {poi.approx_miles != null ? ` · ${poi.approx_miles} mi` : ''}
                    </span>
                    {poi.why && <div className="text-[10px] text-ink2">{poi.why}</div>}
                  </li>
                ))}
              </ul>
            )}
          </SourcingStep>
          <SourcingStep
            n={2}
            label="Resolve & Merge"
            hint="Google Places firewall"
            state={resolveState}
            summary={resolveSummary}
            busy={busy}
            onRun={() => onRun('resolve')}
          >
            {(resolvedPlaces.length > 0 || droppedPlaces.length > 0) && (
              <div className="space-y-2">
                <ul className="space-y-0.5">
                  {resolvedPlaces.map((r, i) => (
                    <li key={`${r.name}-${i}`} className="text-[11px] leading-snug">
                      <span className="text-ink">{r.name ?? '(unnamed)'}</span>
                      <span className="text-ink2">
                        {r.bucket ? ` · ${r.bucket}` : ''}
                        {r.distance_m != null
                          ? ` · ${(r.distance_m / 1609.344).toFixed(1)} mi`
                          : ''}
                      </span>
                    </li>
                  ))}
                </ul>
                {droppedPlaces.length > 0 && (
                  <div className="border-line border-t pt-1">
                    <div className="text-[10px] text-ink2 uppercase tracking-wide">Dropped</div>
                    <ul className="space-y-0.5">
                      {droppedPlaces.map((d, i) => (
                        <li key={`${d.name}-${i}`} className="text-[11px] text-ink2 leading-snug">
                          {d.name ?? '(unnamed)'}
                          {d.reason ? ` — ${d.reason}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </SourcingStep>
        </div>
      </section>

      {/* ── Right: the latest cut ────────────────────────────────────── */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="font-semibold text-ink text-lg">Latest Video</div>
          {latest && (
            <span
              className={`rounded-full px-2 py-0.5 font-medium text-xs ${
                ready ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {latest.status}
            </span>
          )}
        </div>

        {ready && iframeUrl ? (
          <>
            <div className="mt-3 overflow-hidden rounded-xl bg-black">
              <iframe
                title="Assembled tour video"
                src={iframeUrl}
                // The render canvas, not 9:16 — see CANVAS_W/CANVAS_H. A
                // hardcoded 9/16 here letterboxed the player after the canvas
                // changed shape on 2026-08-19.
                style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}`, height: 420 }}
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <div className="mt-2 text-center text-[11px] text-ink2 tabular-nums">
              {new Date(latest.created_at).toLocaleString()}
            </div>
          </>
        ) : (
          <div className="mt-3 flex h-[420px] w-[288px] items-center justify-center rounded-xl border border-line border-dashed px-4 text-center text-xs text-ink2">
            {loading
              ? 'Loading…'
              : !latest
                ? 'No video yet — review the photos, then Plan Shots and Assemble.'
                : latest.status === 'pending' || latest.status === 'processing'
                  ? 'Assembling… the worker is rendering it now.'
                  : (latest.error ?? latest.status)}
          </div>
        )}
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-ink2 uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink text-sm tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * One sourcing step: state, what it produced, a Run button — and its RESULT.
 *
 * The result panel is not optional garnish. Collapsing these two steps into
 * summary chips removed the only place their output was rendered (the deleted
 * step-details panel), so running Research appeared to do nothing at all
 * (owner 2026-08-19: "i clicked Agent Research - but dont see the result under
 * it"). The photos step could lose its panel because its output IS the table;
 * these two produce places, which the table never shows.
 */
function SourcingStep({
  n,
  label,
  hint,
  state,
  summary,
  busy,
  onRun,
  children,
}: {
  n: number;
  label: string;
  hint: string;
  state: StepState;
  summary: string | null;
  busy: boolean;
  onRun: () => void;
  /** The step's result, revealed on click. */
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 ${
        state === 'failed'
          ? 'border-red-400/50 bg-red-50'
          : state === 'done'
            ? 'border-emerald-600/25 bg-emerald-600/5'
            : 'border-line bg-bg'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {state === 'running' ? (
            <Loader2 size={12} className="animate-spin text-ink2" />
          ) : state === 'done' ? (
            <Check size={12} className="text-emerald-600" />
          ) : (
            <span className="inline-block h-3 w-3 rounded-full border border-ink2/30" />
          )}
          <span className="font-medium text-ink text-xs">{`${n} · ${label}`}</span>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] text-ink hover:border-ink2 disabled:cursor-not-allowed disabled:text-muted"
        >
          <Play size={10} aria-hidden />
          {state === 'done' ? 'Re-run' : 'Run'}
        </button>
      </div>
      <div className="mt-1 text-[11px] text-ink2">{summary ?? hint}</div>
      {/* Always open. A click to see whether the step did anything is a click
          to answer the only question the panel exists for (owner 2026-08-19:
          "show the result directly for the first 2 steps, no need to click").
          Capped and scrollable so a long list cannot push the video off. */}
      {children && (
        <div className="mt-2 max-h-56 overflow-y-auto border-line border-t pt-2">{children}</div>
      )}
    </div>
  );
}
