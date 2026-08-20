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
          />
          <SourcingStep
            n={2}
            label="Resolve & Merge"
            hint="Google Places firewall"
            state={resolveState}
            summary={resolveSummary}
            busy={busy}
            onRun={() => onRun('resolve')}
          />
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

/** One of the two sourcing steps: state, what it produced, and a Run button. */
function SourcingStep({
  n,
  label,
  hint,
  state,
  summary,
  busy,
  onRun,
}: {
  n: number;
  label: string;
  hint: string;
  state: StepState;
  summary: string | null;
  busy: boolean;
  onRun: () => void;
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
    </div>
  );
}
