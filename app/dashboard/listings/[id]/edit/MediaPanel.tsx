'use client';

/**
 * MediaPanel — Phase 47.x (2026-06-21).
 *
 * One unified "Click to upload" surface for both photos and videos. From the
 * agent's perspective, the listing's Media tab now has a single Content card
 * with a single upload button — at the end of the day, photos and videos are
 * just listing content.
 *
 * Why a wrapper instead of merging Video/PhotoPanel: each panel still owns
 * its own backend pipeline (Cloudflare Stream tus for video, Supabase
 * Storage for photo), thumbnails, reorder, cover toggle, and status poll.
 * Forking those in a brand-new component would double the surface area we
 * have to maintain. Instead this component keeps both panels intact and
 * forwards files into them by MIME type:
 *
 *   image/* → PhotoPanel.addFiles() (existing handleFiles → Supabase upload)
 *   video/* → spawn one <VideoUploader> instance per file (existing
 *             pick→title-confirm→tus pipeline, just driven by `initialFile`).
 *             VideoPanel.pushUploaded() registers the row optimistically
 *             once the upload finishes so it appears in the grid.
 *
 * What changes for the agent:
 *   - Two cards collapse to one Content card with two stacked sub-sections
 *     ("Videos (N)" / "Photos (N)").
 *   - The "Add photos" + "Click to select a video" buttons are replaced by
 *     one "Click to upload" button accepting `image/*,video/*` `multiple`.
 *   - Mixing photos and videos in a single pick is supported — they fan
 *     out by MIME after selection.
 *
 * What does NOT change:
 *   - Photo upload pipeline (Supabase batch, JPEG/PNG/WebP, 10 MB).
 *   - Video upload pipeline (Cloudflare Stream tus, 2 GB). The per-video
 *     "edit title before start" step is preserved — VideoUploader just
 *     gets prefilled with the file via `initialFile`.
 *   - Reorder, cover-photo selection, status polling, prefill-store.
 */

import { Upload } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { consumePrefill } from '@/app/_components/upload-prefill-store';
import { type UploadedVideo, VideoUploader } from '@/components/dashboard/VideoUploader';
import { type ListingPhotoRow, PhotoPanel, type PhotoPanelHandle } from './PhotoPanel';
import { type ListingVideoRow, VideoPanel, type VideoPanelHandle } from './VideoPanel';

interface PendingVideoUpload {
  /** Stable key for React. */
  key: string;
  /** The picked file fed into VideoUploader as `initialFile`. */
  file: File;
}

interface Props {
  listingId: string;
  initialVideos: ListingVideoRow[];
  initialCoverVideoId: string | null;
  initialPhotos: ListingPhotoRow[];
  initialCoverPhotoId: string | null;
}

export function MediaPanel({
  listingId,
  initialVideos,
  initialCoverVideoId,
  initialPhotos,
  initialCoverPhotoId,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const photoRef = useRef<PhotoPanelHandle | null>(null);
  const videoRef = useRef<VideoPanelHandle | null>(null);
  const [pendingVideos, setPendingVideos] = useState<PendingVideoUpload[]>([]);
  const [unsupportedNotice, setUnsupportedNotice] = useState<string | null>(null);

  // Phase 43.6 prefill: the FAB → /new flow drops File[] into the
  // upload-prefill-store and redirects with `?prefill=<id>`. We consume it
  // here (instead of in PhotoPanelPrefillBridge) so videos in the prefill
  // can also fan out — image/* still go to PhotoPanel, video/* spawn
  // VideoUploader instances. Lazy-init keeps StrictMode double-mount safe.
  const searchParams = useSearchParams();
  const [prefillFiles] = useState<File[] | null>(() => {
    const id = searchParams?.get('prefill');
    if (!id) return null;
    return consumePrefill(id);
  });
  const prefillImages = prefillFiles?.filter((f) => f.type.startsWith('image/')) ?? null;
  const prefillVideosRef = useRef(false);
  if (!prefillVideosRef.current && prefillFiles) {
    prefillVideosRef.current = true;
    const videos = prefillFiles.filter((f) => f.type.startsWith('video/'));
    if (videos.length > 0) {
      // Defer to after first paint so the panels mount before we register
      // pending uploads against them.
      setTimeout(() => {
        setPendingVideos((prev) => [
          ...prev,
          ...videos.map((file) => ({
            key: `prefill-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            file,
          })),
        ]);
      }, 0);
    }
  }

  const handlePicked = useCallback((files: FileList | File[]) => {
    setUnsupportedNotice(null);
    const arr = Array.from(files);
    const images: File[] = [];
    const videos: File[] = [];
    const skipped: string[] = [];
    for (const f of arr) {
      if (f.type.startsWith('image/')) images.push(f);
      else if (f.type.startsWith('video/')) videos.push(f);
      else skipped.push(f.name);
    }
    if (skipped.length > 0) {
      setUnsupportedNotice(
        `Skipped ${skipped.length} unsupported file(s): ${skipped.slice(0, 3).join(', ')}${
          skipped.length > 3 ? '…' : ''
        }`,
      );
    }
    if (images.length > 0) photoRef.current?.addFiles(images);
    if (videos.length > 0) {
      setPendingVideos((prev) => [
        ...prev,
        ...videos.map((file) => ({
          key: `pick-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
        })),
      ]);
    }
  }, []);

  const handleVideoUploaded = useCallback((key: string, v: UploadedVideo) => {
    videoRef.current?.pushUploaded(v);
    // Keep the uploader in 'done' state visible briefly so the agent sees
    // the success line, then drop it. 4s matches the time it takes most
    // people to glance at a green checkmark.
    setTimeout(() => {
      setPendingVideos((prev) => prev.filter((p) => p.key !== key));
    }, 4000);
  }, []);

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="text-base font-semibold">Content</h2>
        <span className="text-muted text-xs">
          Photos and videos · drag to reorder · use ⓒ to set cover
        </span>
      </div>

      {/* Unified upload entry point. One button, both media types. */}
      <div className="mb-6">
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handlePicked(e.target.files);
              e.target.value = '';
            }
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-md border border-line bg-bg px-4 py-2 text-ink2 text-sm hover:border-bronze hover:text-ink"
        >
          <Upload size={16} aria-hidden="true" />
          Click to upload
        </button>
        <p className="mt-2 text-muted text-xs">
          Photos (JPEG / PNG / WebP, up to 10 MB) and videos (MP4 / MOV, up to 2 GB).
        </p>
        {unsupportedNotice ? (
          <p className="mt-2 text-xs text-red-300">{unsupportedNotice}</p>
        ) : null}
      </div>

      {/* Per-file video uploaders. Each instance owns its own pick→title→
          progress flow; we just feed it `initialFile` so the agent skips
          the picker step (they already picked above) but still confirms
          the title. */}
      {pendingVideos.length > 0 ? (
        <div className="mb-6 space-y-3">
          {pendingVideos.map((p) => (
            <VideoUploader
              key={p.key}
              target={{ scope: 'listing', listingId }}
              initialFile={p.file}
              onUploaded={(v) => handleVideoUploaded(p.key, v)}
            />
          ))}
        </div>
      ) : null}

      {/* Stacked sub-sections. Same panels, just with their own upload
          buttons hidden — the unified one above replaces them. */}
      <div className="space-y-6">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink2">Videos ({initialVideos.length})</h3>
          <VideoPanel
            ref={videoRef}
            listingId={listingId}
            initialVideos={initialVideos}
            initialCoverVideoId={initialCoverVideoId}
            hideUploader
          />
        </div>
        <div className="border-t border-line pt-6">
          <h3 className="mb-2 text-sm font-semibold text-ink2">Photos ({initialPhotos.length})</h3>
          <PhotoPanel
            ref={photoRef}
            listingId={listingId}
            initialPhotos={initialPhotos}
            initialCoverPhotoId={initialCoverPhotoId}
            prefillFiles={prefillImages ?? undefined}
            hideUploadButton
          />
        </div>
      </div>
    </section>
  );
}
