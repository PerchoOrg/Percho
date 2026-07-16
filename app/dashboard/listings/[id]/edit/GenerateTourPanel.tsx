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
 * Phase 96 (2026-07-16): re-shaped as an inline button that lives next to the
 * "Videos (N)" header inside MediaPanel — no longer its own card section.
 * Status messages surface via a small popover below the button so the header
 * row stays compact.
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
      : 'Turn your listing photos into a 30-second Ken Burns home tour video (~2 min).';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        disabled={!enoughPhotos || busy}
        title={disabledReason}
        aria-disabled={!enoughPhotos || busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-line bg-bg px-3 py-1.5 text-ink2 text-xs hover:border-bronze hover:text-ink disabled:cursor-not-allowed disabled:text-muted"
      >
        <Sparkles size={14} aria-hidden="true" />
        {busy ? 'Rendering…' : 'Generate tour video'}
      </button>

      {status !== 'idle' && (
        <div className="mt-1 text-xs">
          {status === 'queued' && (
            <span className="text-ink2">Queued — waiting for render worker…</span>
          )}
          {status === 'running' && <span className="text-ink2">Rendering (~2 min)…</span>}
          {status === 'done' && (
            <span className="text-emerald-600">Done. Reload to see the new tour video.</span>
          )}
          {status === 'failed' && (
            <span className="text-red-600">Render failed{error ? `: ${error}` : '.'}</span>
          )}
          {jobId && status !== 'done' && (
            <span className="ml-2 font-mono text-muted">job {jobId.slice(0, 8)}…</span>
          )}
        </div>
      )}
    </div>
  );
}
