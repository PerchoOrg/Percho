'use client';

/**
 * TourHeader — community facts on the left, the latest cut on the right.
 *
 * Owner 2026-08-19: "on top show community information on the left, and show
 * latest generated video on the right". Replaces a full-width video panel that
 * pushed everything else below the fold, and a header that carried only the
 * name.
 *
 * The video column is fixed-width and the info column flexes, because the
 * video's width is not negotiable — it is a portrait player at the render
 * canvas's aspect, and letting it stretch would letterbox it.
 */

import { streamIframeUrl } from '@/lib/cloudflare/stream';
import { CANVAS_H, CANVAS_W } from '@/lib/poi/tour-orchestrator/scheduler';
import { useEffect, useState } from 'react';

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
  slug,
  city,
  state,
  zip,
  lat,
  lng,
  kind,
  photoCount,
  poiCount,
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
  photoCount: number;
  poiCount: number;
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

        {slug && (
          <div className="mt-4 border-line border-t pt-3 text-xs text-ink2">
            slug <code className="text-ink">{slug}</code>
          </div>
        )}
      </section>

      {/* ── Right: the latest cut ────────────────────────────────────── */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="font-semibold text-ink text-sm">Latest Video</div>
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
