'use client';

/**
 * GenerateTourPanel — kicks off an agent-generated home tour video.
 *
 * Phase 71 (2026-07-05): activated. Posts to `/api/listings/[id]/generate-tour`
 * which enqueues a render_jobs row picked up by the EC2 render worker
 * (scripts/render-worker/worker.py). The worker generates a Ken Burns MP4
 * from listing_photos, uploads to Cloudflare Stream, and updates the
 * placeholder listing_videos row this API creates.
 *
 * Disabled if <3 photos.
 */

import { Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type JobStatus = 'idle' | 'queued' | 'running' | 'done' | 'failed';

const MIN_PHOTOS = 3;

export function GenerateTourPanel({
  listingId,
  photoCount,
}: {
  listingId: string;
  photoCount: number;
}) {
  const [status, setStatus] = useState<JobStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const enoughPhotos = photoCount >= MIN_PHOTOS;
  const busy = status === 'queued' || status === 'running';

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function pollOnce(id: string) {
    try {
      const res = await fetch(`/api/listings/${listingId}/generate-tour?jobId=${id}`);
      if (!res.ok) return;
      const j = (await res.json()) as { status: JobStatus; error?: string | null };
      setStatus(j.status);
      if (j.error) setError(j.error);
      if (j.status === 'done' || j.status === 'failed') {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch {
      /* transient network — keep polling */
    }
  }

  async function onClick() {
    if (!enoughPhotos || busy) return;
    setError(null);
    setStatus('queued');
    try {
      const res = await fetch(`/api/listings/${listingId}/generate-tour`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        setStatus('failed');
        setError(body.message ?? body.error ?? `HTTP ${res.status}`);
        return;
      }
      const { jobId: id } = (await res.json()) as { jobId: string };
      setJobId(id);
      pollRef.current = setInterval(() => pollOnce(id), 5000);
      // Kick off an immediate poll so the label flips to "running" fast.
      void pollOnce(id);
    } catch (e) {
      setStatus('failed');
      setError(e instanceof Error ? e.message : 'network error');
    }
  }

  const disabledReason = !enoughPhotos
    ? `Need at least ${MIN_PHOTOS} photos (currently ${photoCount}).`
    : busy
      ? 'Rendering in progress…'
      : undefined;

  return (
    <section className="rounded border border-line bg-surface p-6">
      <p className="mb-4 text-ink2 text-sm leading-relaxed">
        Turn your listing photos into a 30-second Ken Burns home tour video with price and address
        overlays. Rendering takes ~2 minutes.
      </p>

      <button
        type="button"
        onClick={onClick}
        disabled={!enoughPhotos || busy}
        title={disabledReason}
        aria-disabled={!enoughPhotos || busy}
        className="inline-flex items-center gap-2 rounded-md border border-line bg-bg px-4 py-2 text-ink text-sm hover:bg-surface2 disabled:cursor-not-allowed disabled:text-muted"
      >
        <Sparkles size={16} aria-hidden="true" />
        {busy ? 'Rendering…' : 'Generate home tour video'}
      </button>

      {status !== 'idle' && (
        <div className="mt-4 text-sm">
          {status === 'queued' && <p className="text-ink2">Queued — waiting for render worker…</p>}
          {status === 'running' && <p className="text-ink2">Rendering video (this takes ~2 min)…</p>}
          {status === 'done' && (
            <p className="text-emerald-600">
              Done. Reload this page — the new tour video is at the top of the Media list.
            </p>
          )}
          {status === 'failed' && (
            <p className="text-red-600">
              Render failed{error ? `: ${error}` : '.'} You can try again.
            </p>
          )}
          {jobId && (
            <p className="mt-1 font-mono text-muted text-xs">
              job {jobId.slice(0, 8)}…
            </p>
          )}
        </div>
      )}
    </section>
  );
}
