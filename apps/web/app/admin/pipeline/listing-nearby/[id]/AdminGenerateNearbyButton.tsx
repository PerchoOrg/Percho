'use client';

/**
 * AdminGenerateNearbyButton — admin-only. Kicks off the
 * `scripts/pipelines/nearby_generate.py` pipeline via
 * POST /api/admin/listings/[id]/generate-nearby.
 *
 * UX flow:
 *   1. User clicks "Generate nearby videos".
 *   2. Confirmation dialog appears with cost warning + a
 *      "Force re-generate" checkbox.
 *   3. On confirm, POSTs to the admin API and shows a small status line
 *      with the log path and job id. Per-bucket video status polling is
 *      already handled by <BucketVideoCard> — it will pick up the new
 *      `generated_videos` rows automatically.
 *
 * Light theme (owner preference).
 */

import { Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';

const DEFAULT_BUCKETS = ['dining', 'schools', 'outdoor', 'shopping', 'daily_errands'];

type JobInfo = {
  pid: number;
  log_path: string;
  job_id: string;
  force: boolean;
};

export function AdminGenerateNearbyButton({ listingId }: { listingId: string }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [job, setJob] = useState<JobInfo | null>(null);

  async function fire() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/listings/${listingId}/generate-nearby`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buckets: DEFAULT_BUCKETS, force }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        setErr(body.message ?? body.error ?? `HTTP ${res.status}`);
        return;
      }
      const j = (await res.json()) as JobInfo;
      setJob(j);
      setDialogOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={() => {
            setErr(null);
            setDialogOpen(true);
          }}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-ink text-xs hover:border-bronze hover:text-bronze disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          Generate nearby videos
        </button>
        {job && (
          <p className="text-[11px] text-muted">
            Queued (pid {job.pid}). Bucket cards below will update as each
            video renders. Log: <code className="font-mono">{job.log_path}</code>
          </p>
        )}
        {err && !dialogOpen && (
          <p className="text-[11px] text-red-600">Error: {err}</p>
        )}
      </div>

      {dialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4"
        >
          <div className="w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-xl">
            <h4 className="text-base font-semibold text-ink">Generate nearby videos</h4>
            <p className="mt-2 text-sm text-ink2">
              This will run discovery + rendering for ~5 buckets
              (dining, schools, outdoor, shopping, daily_errands) — roughly
              <strong> $1 in API costs</strong>. Continue?
            </p>
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-ink2">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
                className="h-4 w-4 accent-bronze"
              />
              Force re-generate (replace buckets that already have a live video)
            </label>
            {err && <p className="mt-3 text-xs text-red-600">Error: {err}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                disabled={busy}
                className="rounded-md border border-line bg-bg px-3 py-1.5 text-ink2 text-xs hover:bg-line/40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={fire}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-bronze bg-bronze px-3 py-1.5 text-white text-xs hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {busy ? 'Queueing…' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
