'use client';

import { useRef, useState } from 'react';
/**
 * VideoUploader — Client Component (task 2.2).
 *
 * Flow:
 *   1. User picks a file. Reject locally if > 2 GB (server enforces too).
 *   2. POST /api/video/create-upload to reserve a Cloudflare Stream slot
 *      and pre-insert a `listing_videos` row (status=processing).
 *   3. tus-js-client uploads bytes directly to Cloudflare. Browser → CF.
 *      Our server never touches the bytes.
 *   4. On success, the row stays `processing` until the CF webhook fires
 *      (task 2.3) and flips it to `ready`. UI auto-reflects via Realtime
 *      (task 2.4). For now, refresh the page to see the status flip.
 *
 * Retry: tus retries on transient network errors with exponential backoff.
 */
import * as tus from 'tus-js-client';

const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

type Status = 'idle' | 'creating' | 'uploading' | 'done' | 'error';

export interface UploadedVideo {
  rowId: string;
  videoId: string;
  title: string;
  kind: 'walkthrough';
}

interface Props {
  listingId: string;
  onUploaded?: (video: UploadedVideo) => void;
}

export function VideoUploader({ listingId, onUploaded }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setErrorMsg(null);
    setFileName(file.name);

    if (file.size > MAX_BYTES) {
      setStatus('error');
      setErrorMsg(`File is ${(file.size / 1024 ** 3).toFixed(2)} GB. Max is 2 GB.`);
      return;
    }
    if (!file.type.startsWith('video/')) {
      setStatus('error');
      setErrorMsg('Please select a video file.');
      return;
    }

    setStatus('creating');
    setProgress(0);

    let uploadUrl: string;
    let rowId: string;
    let videoId: string;
    try {
      const res = await fetch('/api/video/create-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'listing',
          parent_id: listingId,
          kind: 'walkthrough',
          upload_length: file.size,
          title: file.name,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `create-upload returned ${res.status}`);
      }
      const json = (await res.json()) as { uploadUrl: string; rowId: string; videoId: string };
      uploadUrl = json.uploadUrl;
      rowId = json.rowId;
      videoId = json.videoId;
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to start upload.');
      return;
    }

    setStatus('uploading');

    const upload = new tus.Upload(file, {
      uploadUrl,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      chunkSize: 50 * 1024 * 1024, // 50 MB chunks
      metadata: { filename: file.name, filetype: file.type },
      onProgress: (sent, total) => {
        setProgress(Math.round((sent / total) * 100));
      },
      onSuccess: () => {
        setStatus('done');
        setProgress(100);
        onUploaded?.({ rowId, videoId, title: file.name, kind: 'walkthrough' });
      },
      onError: (err) => {
        setStatus('error');
        setErrorMsg(err.message ?? 'Upload failed.');
      },
    });

    upload.start();
  }

  function reset() {
    setStatus('idle');
    setProgress(0);
    setErrorMsg(null);
    setFileName(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div
      className="rounded-2xl border p-6"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
    >
      {(status === 'idle' || status === 'error') && (
        <label
          className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition hover:opacity-80"
          style={{ borderColor: 'var(--border)' }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <span className="text-sm font-medium">Click to select a video</span>
          <span className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
            MP4 or MOV, up to 2 GB, max 5 min
          </span>
        </label>
      )}

      {(status === 'creating' || status === 'uploading') && (
        <div className="space-y-3">
          <div className="text-sm font-medium truncate">{fileName}</div>
          <div
            className="h-2 w-full overflow-hidden rounded-full"
            style={{ background: 'var(--border)' }}
          >
            <div
              className="h-full transition-all"
              style={{
                width: `${progress}%`,
                background: 'var(--brand)',
              }}
            />
          </div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>
            {status === 'creating' ? 'Reserving upload slot…' : `Uploading… ${progress}%`}
          </div>
        </div>
      )}

      {status === 'done' && (
        <div className="space-y-3">
          <div className="text-sm font-medium">✓ Upload complete: {fileName}</div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>
            Cloudflare is processing the video. Refresh in ~60s to see status flip to ready.
          </div>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-90"
            style={{ background: 'var(--brand)', color: '#0c0c0c' }}
          >
            Upload another
          </button>
        </div>
      )}

      {status === 'error' && errorMsg && (
        <div
          className="mt-4 rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--border)', color: '#f87171' }}
        >
          {errorMsg}
        </div>
      )}
    </div>
  );
}
