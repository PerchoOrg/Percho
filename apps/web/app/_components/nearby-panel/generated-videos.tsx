'use client';

/**
 * Generated Videos section — one card per intent bucket. Each card shows:
 *   - CF Stream player when the render is ready
 *   - Status pill (idle / rendering / ready / failed)
 *   - Structured description (intro + scene beats + closing) synthesized
 *     from the photos' vision-tagged captions. Manual "Regenerate description"
 *     button — never auto-fires to keep Gemini spend predictable.
 *   - Generate / Regenerate video button — enqueues a `generated_videos` row,
 *     the render worker picks it up.
 *
 * The grid stays visible even when no buckets have rendered yet, so the agent
 * always sees the full slate and knows what's missing.
 */

import { streamIframeUrl } from '@/lib/cloudflare/stream';
import type { BucketVideoStatus } from '@/lib/poi/entity-scope';
import type { IntentBucket } from '@/lib/poi/types';
import { Loader2, Play, RefreshCw, Sparkles, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BUCKET_SHORT, type NearbyPanelScope } from './scope';

export function GeneratedVideosSection({
  entityId,
  scope,
}: {
  entityId: string;
  scope: NearbyPanelScope;
}) {
  return (
    <div>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-ink2">Generated videos</h3>
        <p className="text-xs text-muted">
          One 30–60s slideshow per intent bucket, stitched from approved POI photos. Each video
          comes with an English description you can send to TTS later.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {scope.buckets.map((bucket) => (
          <BucketVideoCard key={bucket} entityId={entityId} bucket={bucket} scope={scope} />
        ))}
      </div>
    </div>
  );
}

function BucketVideoCard({
  entityId,
  bucket,
  scope,
}: {
  entityId: string;
  bucket: IntentBucket;
  scope: NearbyPanelScope;
}) {
  const [status, setStatus] = useState<BucketVideoStatus>(null);
  const [eligibleCount, setEligibleCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [narrativeBusy, setNarrativeBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [narrativeErr, setNarrativeErr] = useState<string | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [showFullScript, setShowFullScript] = useState(false);

  const { getVideoStatus, getEligiblePhotoCount } = scope;

  // Initial load + polling while render is in flight.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [next, elig] = await Promise.all([
        getVideoStatus(entityId, bucket),
        getEligiblePhotoCount(entityId, bucket),
      ]);
      if (!cancelled) {
        setStatus(next);
        setEligibleCount(elig);
      }
      return next;
    };
    load().then((s) => {
      if (cancelled) return;
      if (s?.status === 'pending' || s?.status === 'processing') {
        const t = setInterval(async () => {
          const cur = await load();
          if (!cur || (cur.status !== 'pending' && cur.status !== 'processing')) {
            clearInterval(t);
          }
        }, 5000);
        return () => clearInterval(t);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [entityId, bucket, getVideoStatus, getEligiblePhotoCount]);

  const handleGenerate = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await scope.generateVideo(entityId, bucket);
      if (!res.ok) {
        setErr(res.message);
        return;
      }
      setStatus({
        video_id: res.video_id,
        status: res.status,
        cf_stream_uid: null,
        duration_s: null,
        photo_count: res.photo_count,
        error: null,
        created_at: new Date().toISOString(),
        narrative: null,
      });
      const t = setInterval(async () => {
        const cur = await scope.getVideoStatus(entityId, bucket);
        setStatus(cur);
        if (cur && cur.status !== 'pending' && cur.status !== 'processing') {
          clearInterval(t);
        }
      }, 5000);
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerateNarrative = async () => {
    if (!status?.video_id) return;
    setNarrativeBusy(true);
    setNarrativeErr(null);
    try {
      const res = await scope.regenerateNarrative(status.video_id);
      if (!res.ok) {
        setNarrativeErr(res.message);
        return;
      }
      setStatus((prev) => (prev ? { ...prev, narrative: res.narrative } : prev));
    } finally {
      setNarrativeBusy(false);
    }
  };

  const isReady = status?.status === 'ready' || status?.status === 'approved';
  const isRendering = status?.status === 'pending' || status?.status === 'processing';
  const isFailed = status?.status === 'failed';
  const narrative = status?.narrative ?? null;

  return (
    <div className="rounded-lg border border-line bg-bg p-3">
      {/* header */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4 text-ink2" aria-hidden />
          <span className="text-sm font-medium text-ink">{BUCKET_SHORT[bucket]}</span>
          <StatusPill status={status?.status ?? null} />
        </div>
        <div className="flex items-center gap-1.5">
          {isReady && status?.cf_stream_uid ? (
            <button
              type="button"
              onClick={() => setShowPlayer((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-ink hover:bg-line/40"
            >
              <Play className="h-3 w-3" />
              {showPlayer ? 'Hide' : 'Play'}
              {status.duration_s ? ` · ${Math.round(status.duration_s)}s` : ''}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={
              busy || isRendering || (eligibleCount != null && eligibleCount < 3 && !isReady)
            }
            title={
              isReady
                ? `Regenerate from ${eligibleCount ?? '?'} approved photos`
                : eligibleCount != null && eligibleCount < 3
                  ? `Need at least 3 approved photos (${eligibleCount} eligible)`
                  : `Generate video from ${eligibleCount ?? '?'} approved photos`
            }
            className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-ink hover:bg-line/40 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {isReady ? 'Regenerate' : 'Generate'}
            {eligibleCount != null ? (
              <span className="text-muted">{` · ${Math.min(eligibleCount, 15)}`}</span>
            ) : null}
          </button>
        </div>
      </div>

      {/* status/error line */}
      {isRendering ? (
        <p className="mb-2 flex items-center gap-1 text-[11px] text-muted">
          <Loader2 className="h-3 w-3 animate-spin" />
          Rendering {status?.photo_count} photos… ({status?.status})
        </p>
      ) : null}
      {isFailed || err ? (
        <p className="mb-2 truncate text-[11px] text-red-600" title={status?.error ?? err ?? ''}>
          {isFailed ? 'Failed: ' : ''}
          {err ?? status?.error ?? ''}
        </p>
      ) : null}

      {/* inline player */}
      {isReady && status?.cf_stream_uid && showPlayer ? (
        <div className="mb-3 aspect-[9/16] w-full max-w-[280px] overflow-hidden rounded-lg border border-line bg-black">
          <iframe
            title={scope.videoTitle}
            src={streamIframeUrl(status.cf_stream_uid)}
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
            allowFullScreen
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        </div>
      ) : null}

      {/* narrative / description block */}
      <div className="rounded border border-line/70 bg-surface p-2.5">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
            Description (English · for TTS)
          </span>
          <button
            type="button"
            onClick={handleRegenerateNarrative}
            disabled={narrativeBusy || !status?.video_id || (!isReady && !isFailed)}
            title={
              !status?.video_id
                ? 'Generate the video first'
                : narrative
                  ? 'Regenerate description from tagged photos'
                  : 'Generate a description from tagged photos'
            }
            className="inline-flex items-center gap-1 rounded-md border border-line bg-bg px-2 py-0.5 text-[10.5px] text-ink hover:bg-line/40 disabled:opacity-40"
          >
            {narrativeBusy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            {narrative ? 'Regenerate' : 'Generate'}
          </button>
        </div>
        {narrativeErr ? <p className="mb-1 text-[11px] text-red-600">{narrativeErr}</p> : null}
        {narrative ? (
          <div className="space-y-1.5 text-[11.5px] leading-relaxed text-ink2">
            {narrative.intro ? <p className="italic">{narrative.intro}</p> : null}
            {narrative.scenes && narrative.scenes.length > 0 ? (
              <ol className="list-decimal space-y-0.5 pl-4 text-ink2/90">
                {narrative.scenes.map((s, i) => (
                  <li key={`${i}-${s.poi_name}`}>
                    <span className="font-medium text-ink">{s.poi_name}</span>
                    {s.beat ? <span className="text-ink2/80"> — {s.beat}</span> : null}
                  </li>
                ))}
              </ol>
            ) : null}
            {narrative.closing ? <p className="italic text-ink2/90">{narrative.closing}</p> : null}
            {narrative.voiceover ? (
              <details
                open={showFullScript}
                onToggle={(e) => setShowFullScript((e.currentTarget as HTMLDetailsElement).open)}
                className="mt-2 border-t border-line/60 pt-1.5"
              >
                <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-muted hover:text-ink2">
                  Voiceover script ({narrative.voiceover.split(/\s+/).length} words)
                </summary>
                <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-ink">
                  {narrative.voiceover}
                </p>
              </details>
            ) : null}
          </div>
        ) : (
          <p className="text-[11px] italic text-muted">
            {isReady
              ? 'Click Generate to synthesize a description from the tagged photos.'
              : isRendering
                ? 'Description generates once the render finishes.'
                : 'Generate the video first.'}
          </p>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="rounded-full bg-line/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
        Not started
      </span>
    );
  }
  const styles: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    processing: 'bg-amber-100 text-amber-800',
    ready: 'bg-green-100 text-green-800',
    approved: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    rejected: 'bg-red-100 text-red-800',
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${styles[status] ?? 'bg-line/40 text-muted'}`}
    >
      {status}
    </span>
  );
}
