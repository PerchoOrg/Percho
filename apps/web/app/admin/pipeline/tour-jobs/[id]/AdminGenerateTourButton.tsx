'use client';

/**
 * AdminGenerateTourButton — admin-scope wrapper around the tour
 * generator. Posts to /api/admin/listings/[id]/generate-tour (no
 * ownership check) and polls until done.
 */

import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type JobStatus = 'idle' | 'queued' | 'running' | 'done' | 'failed';

export function AdminGenerateTourButton({
  listingId,
  photoCount,
}: {
  listingId: string;
  photoCount: number;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<JobStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const enough = photoCount >= 3;
  const busy = status === 'queued' || status === 'running';

  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
    },
    [],
  );

  async function pollOnce(id: string) {
    try {
      const res = await fetch(`/api/admin/listings/${listingId}/generate-tour?jobId=${id}`);
      if (!res.ok) return;
      const j = (await res.json()) as { status: JobStatus; error?: string | null };
      setStatus(j.status);
      if (j.error) setError(j.error);
      if (j.status === 'done' || j.status === 'failed') {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        if (j.status === 'done') router.refresh();
      }
    } catch {
      /* transient */
    }
  }

  async function onClick(surface?: 'ios' | 'web') {
    if (!enough || busy) return;
    setError(null);
    setStatus('queued');
    try {
      const res = await fetch(`/api/admin/listings/${listingId}/generate-tour`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // No surface = rebuild BOTH (drops the row and re-renders from scratch).
        // A surface re-renders ONLY that shape and leaves the other one intact.
        body: JSON.stringify(surface ? { surface } : {}),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        setStatus('failed');
        setError(body.message ?? body.error ?? `HTTP ${res.status}`);
        return;
      }
      const { jobId: id } = (await res.json()) as { jobId: string };
      setJobId(id);
      pollRef.current = setInterval(() => pollOnce(id), 5000);
      void pollOnce(id);
    } catch (e) {
      setStatus('failed');
      setError(e instanceof Error ? e.message : 'network error');
    }
  }

  const title = !enough
    ? `Need ≥3 photos (have ${photoCount}).`
    : busy
      ? 'Rendering…'
      : 'Re-render the Ken Burns walkthrough for this listing (~2 min).';

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onClick('ios')}
          disabled={!enough || busy}
          title={enough ? 'Render the 1:1 asset the iOS feed card plays (~2 min). Leaves the web video alone.' : title}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink hover:border-bronze disabled:cursor-not-allowed disabled:text-muted"
        >
          <Sparkles size={14} aria-hidden />
          {busy ? 'Rendering…' : 'Generate iOS video (1:1)'}
        </button>
        <button
          type="button"
          onClick={() => onClick('web')}
          disabled={!enough || busy}
          title={enough ? 'Render the 16:9 asset web plays (~2 min). Leaves the iOS video alone.' : title}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink hover:border-bronze disabled:cursor-not-allowed disabled:text-muted"
        >
          <Sparkles size={14} aria-hidden />
          {busy ? 'Rendering…' : 'Generate web video (16:9)'}
        </button>
        <button
          type="button"
          onClick={() => onClick()}
          disabled={!enough || busy}
          title={enough ? 'Drop both assets and re-render iOS + web from scratch (~4 min).' : title}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs text-ink2 underline hover:text-ink disabled:cursor-not-allowed disabled:text-muted"
        >
          Rebuild both
        </button>
      </div>
      {status !== 'idle' && (
        <div className="text-xs">
          {status === 'queued' && <span className="text-ink2">Queued…</span>}
          {status === 'running' && <span className="text-ink2">Rendering (~2 min)…</span>}
          {status === 'done' && <span className="text-emerald-600">Done.</span>}
          {status === 'failed' && (
            <span className="text-red-600">Failed{error ? `: ${error}` : '.'}</span>
          )}
          {jobId && status !== 'done' && (
            <span className="ml-2 font-mono text-muted">job {jobId.slice(0, 8)}…</span>
          )}
        </div>
      )}
    </div>
  );
}
