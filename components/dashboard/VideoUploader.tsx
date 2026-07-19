'use client';

import type { CommunityVideoCategoryId } from '@/lib/zod/community-video-categories';
import { useEffect, useRef, useState } from 'react';
/**
 * VideoUploader — Client Component (task 2.2; Phase 4.5 extends to community).
 *
 * Flow:
 *   1. User picks a file. Reject locally if > 2 GB (server enforces too).
 *   2. POST /api/video/create-upload to reserve a Cloudflare Stream slot
 *      and pre-insert a row in listing_videos OR community_videos.
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

type Status = 'idle' | 'picked' | 'creating' | 'uploading' | 'done' | 'error';

/**
 * Turn an iOS/Android camera filename like
 *   `80286515262__A36D0705-4E7F-466B-8EE7-9AD52895DF45.MOV`
 * into something a human will tolerate ("Walkthrough" fallback). The agent can
 * still edit it before upload starts.
 */
function cleanTitle(filename: string): string {
  let name = filename.replace(/\.[^.]+$/, ''); // strip extension
  name = name
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '')
    .replace(/^IMG[_-]?\d+/i, '')
    .replace(/^MVI[_-]?\d+/i, '')
    .replace(/^VID[_-]?\d+/i, '')
    .replace(/\b\d{6,}\b/g, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name || /^[\s\d]*$/.test(name)) return 'Walkthrough';
  return name.slice(0, 80);
}

export type ListingTarget = { scope: 'listing'; listingId: string };
export type CommunityKind = 'school' | 'poi' | 'neighborhood';
export type CommunityTarget = {
  scope: 'community';
  communityId: string;
  kind: CommunityKind;
  // preferred axis. When supplied, the server treats
  // `category` as authoritative and derives `kind` from it. `kind` is still
  // sent (and required by the wire schema) for backwards compat with the
  // not-null `kind` column.
  category?: CommunityVideoCategoryId;
  schoolId?: string;
  poiId?: string;
  // geo for platform-wide nearby. Optional so
  // older callers compile; agents are encouraged to fill them in.
  lat?: number;
  lng?: number;
  // optional human-readable address. When set we
  // forward it on the wire; when empty we still send lat/lng (silent geo)
  // but no address.
  address?: string;
  // additional community memberships. The video
  // is primarily uploaded under `communityId`; these extra IDs cause the
  // server to also insert rows into `community_video_extra_links` so the
  // same video shows up under multiple `/c/[slug]` pages.
  extraCommunityIds?: string[];
};
export type UploadTarget = ListingTarget | CommunityTarget;

export interface UploadedVideo {
  rowId: string;
  videoId: string;
  title: string;
  kind: 'walkthrough' | CommunityKind;
}

interface Props {
  target: UploadTarget;
  onUploaded?: (video: UploadedVideo) => void;
  /**
   * when set on first mount, the file is treated
   * as if the agent had picked it via the file input — same validation,
   * same "picked" state. The agent still presses "Start upload" to confirm
   * and (optionally) edit the title. We intentionally don't auto-start so
   * the agent can sanity-check before bytes leave the device.
   */
  initialFile?: File;
}

export function VideoUploader({ target, onUploaded, initialFile }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // when the FAB handed us a file via prefill, treat it as if
  // the agent had picked it. We don't auto-start the upload — the agent
  // confirms via the existing button so they can edit the title first.
  const didConsumeInitial = useRef(false);
  useEffect(() => {
    if (didConsumeInitial.current) return;
    if (!initialFile) return;
    didConsumeInitial.current = true;
    handlePicked(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

  function handlePicked(file: File) {
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

    setPickedFile(file);
    setTitle(cleanTitle(file.name));
    setStatus('picked');
  }

  async function startUpload() {
    if (!pickedFile) return;
    const file = pickedFile;
    const finalTitle = title.trim() || cleanTitle(file.name);

    setStatus('creating');
    setProgress(0);

    const requestBody =
      target.scope === 'listing'
        ? {
            scope: 'listing' as const,
            parent_id: target.listingId,
            kind: 'walkthrough' as const,
            upload_length: file.size,
            title: finalTitle,
          }
        : {
            scope: 'community' as const,
            parent_id: target.communityId,
            kind: target.kind,
            upload_length: file.size,
            title: finalTitle,
            ...(target.category ? { category: target.category } : {}),
            ...(target.schoolId ? { school_id: target.schoolId } : {}),
            ...(target.poiId ? { poi_id: target.poiId } : {}),
            ...(typeof target.lat === 'number' ? { lat: target.lat } : {}),
            ...(typeof target.lng === 'number' ? { lng: target.lng } : {}),
            ...(target.address && target.address.trim() !== ''
              ? { address: target.address.trim() }
              : {}),
            ...(target.extraCommunityIds && target.extraCommunityIds.length > 0
              ? { extra_community_ids: target.extraCommunityIds }
              : {}),
          };

    let uploadUrl: string;
    let rowId: string;
    let videoId: string;
    try {
      const res = await fetch('/api/video/create-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
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

    const uploadedKind: UploadedVideo['kind'] =
      target.scope === 'listing' ? 'walkthrough' : target.kind;

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
        onUploaded?.({ rowId, videoId, title: finalTitle, kind: uploadedKind });
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
    setPickedFile(null);
    setTitle('');
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
              if (f) handlePicked(f);
            }}
          />
          <span className="text-sm font-medium">Click to select a video</span>
          <span className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
            MP4 or MOV, up to 2 GB, max 5 min
          </span>
        </label>
      )}

      {status === 'picked' && (
        <div className="space-y-4">
          <div>
            <div className="mb-1 text-xs" style={{ color: 'var(--muted)' }}>
              Selected file
            </div>
            <div
              className="break-all rounded-lg border px-3 py-2 text-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
            >
              {fileName}
            </div>
          </div>
          <div>
            <label htmlFor="vu-title" className="mb-1 block text-xs">
              Video title <span style={{ color: 'var(--muted)' }}>(shown to buyers)</span>
            </label>
            <input
              id="vu-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="e.g. Front exterior walkthrough"
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--border)', background: 'transparent' }}
            />
            <div className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              {title.length}/80 — defaults to a cleaned-up filename, edit to taste.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={startUpload}
              className="inline-flex items-center gap-2 rounded-md border border-line bg-bg px-4 py-2 text-sm font-medium text-ink transition hover:border-line-strong hover:text-ink"
            >
              Start upload
            </button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-md border border-line bg-transparent px-4 py-2 text-sm text-ink2 transition hover:border-line-strong hover:text-ink"
            >
              Pick another file
            </button>
          </div>
        </div>
      )}

      {(status === 'creating' || status === 'uploading') && (
        <div className="space-y-3">
          <div className="break-all text-sm font-medium">{title || fileName}</div>
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
          <div className="text-sm font-medium">
            ✓ Upload complete
            <span className="mt-1 block break-all font-normal" style={{ color: 'var(--muted)' }}>
              {title || fileName}
            </span>
          </div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>
            Cloudflare is processing the video. Refresh in ~60s to see status flip to ready.
          </div>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-md border border-line bg-bg px-4 py-2 text-sm font-medium text-ink transition hover:border-line-strong"
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
