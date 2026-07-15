'use client';

/**
 * MediaPanel — listing edit Media tab.
 *
 * One unified "Click to upload" surface for both photos and videos. From the
 * agent's perspective, the listing's Media tab now has a single Content card
 * with a single upload button — at the end of the day, photos and videos are
 * just listing content.
 *
 * Why a wrapper instead of merging Video/PhotoPanel: each panel still owns
 * its own backend pipeline (Cloudflare Stream tus for video, Supabase
 * Storage for photo), thumbnails, reorder, cover toggle, and status poll.
 * Forking those would double the surface area we have to maintain. Instead
 * this component keeps both panels intact and forwards files into them by
 * MIME type:
 *
 *   image/* → PhotoPanel.addFiles() (Supabase upload pipeline)
 *   video/* → spawn one <VideoUploader> per file (tus pipeline driven by
 *             `initialFile`); VideoPanel.pushUploaded() registers the row
 *             optimistically once the upload finishes.
 */

import { Upload } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
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
      <div className="mb-4">
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

      {/* Per-file video uploaders. Each instance owns its own
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
            hideUploadButton
          />
        </div>
      </div>
    </section>
  );
}
