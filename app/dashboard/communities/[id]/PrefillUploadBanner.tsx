'use client';

/**
 * PrefillUploadBanner — Phase 50.17 (2026-06-23).
 *
 * Sits at the top of the community Details tab. When the agent landed
 * here from the FAB (FAB → createStubCommunity → /communities/[id])
 * with queued media, the eager-mounted Media tab auto-uploads in the
 * background and reports progress through `upload-status-store`.
 * This banner reflects that progress so the agent isn't confused
 * about whether their files made it.
 *
 * Hidden when there's nothing in flight.
 */

import { useUploadStatus } from '@/app/_components/upload-status-store';
import { useEffect, useState } from 'react';

interface Props {
  communityId: string;
}

export function PrefillUploadBanner({ communityId }: Props) {
  const status = useUploadStatus(communityId);
  const [dismissed, setDismissed] = useState(false);

  // Auto-dismiss the success banner after 8s once everything is done.
  useEffect(() => {
    if (status.total === 0) return;
    if (status.done + status.failed < status.total) return;
    const t = setTimeout(() => setDismissed(true), 8000);
    return () => clearTimeout(t);
  }, [status]);

  if (status.total === 0 || dismissed) return null;

  const inFlight = status.total - status.done - status.failed;
  const allDone = inFlight === 0;
  const anyFailed = status.failed > 0;

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
        allDone
          ? anyFailed
            ? 'border-rose-300/70 bg-rose-50 text-rose-700'
            : 'border-emerald-300/70 bg-emerald-50 text-emerald-700'
          : 'border-amber-300/70 bg-amber-50 text-amber-800'
      }`}
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        {allDone ? (
          anyFailed ? (
            <span aria-hidden>⚠️</span>
          ) : (
            <span aria-hidden>✅</span>
          )
        ) : (
          <span
            aria-hidden
            className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        )}
        <span>
          {allDone
            ? anyFailed
              ? `Uploaded ${status.done} of ${status.total} — ${status.failed} failed`
              : `Uploaded ${status.done} file${status.total === 1 ? '' : 's'} to your Media tab`
            : `Uploading your ${status.total} file${status.total === 1 ? '' : 's'} in the background — ${status.done}/${status.total} done`}
        </span>
      </div>
      {allDone ? (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded text-xs underline hover:no-underline"
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
