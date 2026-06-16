'use client';

/**
 * CommunityCoverPanel — pick a cover image or video for a community.
 *
 * Phase 27.8 (2026-06-16). Two paths:
 *   (a) Pick from this community's ready videos → server action sets
 *       cover_video_id. Cloudflare Stream auto-poster renders.
 *   (b) Upload an image → goes to public `community-covers` bucket via
 *       supabase-js, then server action records `cover_storage_path`.
 *
 * UI is intentionally minimal: a current-cover preview, a "Choose video"
 * grid (collapsible), an upload button, and a clear button. No crop
 * tool, no multi-image carousel — V1.
 */

import { useState, useTransition, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  setCommunityCoverVideo,
  recordCommunityCoverImage,
  clearCommunityCover,
} from './cover-actions';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { publicCoverImageUrl } from '@/lib/community/cover';

interface VideoOption {
  id: string;
  cf_video_id: string;
  title: string | null;
}

interface Props {
  communityId: string;
  canEdit: boolean;
  videos: VideoOption[];
  initialCoverVideoId: string | null;
  initialCoverStoragePath: string | null;
}

const COVERS_BUCKET = 'community-covers';
const MAX_COVER_BYTES = 10 * 1024 * 1024;

export function CommunityCoverPanel({
  communityId,
  canEdit,
  videos,
  initialCoverVideoId,
  initialCoverStoragePath,
}: Props) {
  const router = useRouter();
  const [coverVideoId, setCoverVideoId] = useState(initialCoverVideoId);
  const [coverStoragePath, setCoverStoragePath] = useState(initialCoverStoragePath);
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Render the current cover preview.
  const previewVideo =
    coverVideoId != null ? videos.find((v) => v.id === coverVideoId) ?? null : null;
  const previewUrl = previewVideo
    ? thumbnailUrl(previewVideo.cf_video_id)
    : coverStoragePath
      ? publicCoverImageUrl(coverStoragePath)
      : null;

  function pickVideo(videoId: string) {
    setError(null);
    startTransition(async () => {
      const res = await setCommunityCoverVideo({ communityId, videoId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCoverVideoId(videoId);
      setCoverStoragePath(null);
      setShowPicker(false);
      router.refresh();
    });
  }

  async function uploadImage(file: File) {
    setError(null);
    if (file.size > MAX_COVER_BYTES) {
      setError('Image must be under 10 MB');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Use JPG, PNG, or WebP');
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${communityId}/${crypto.randomUUID()}.${ext}`;
    const supabase = createClient();
    const { error: upErr } = await supabase.storage
      .from(COVERS_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) {
      console.error('[CommunityCoverPanel] upload failed', upErr);
      setError('Upload failed');
      return;
    }
    startTransition(async () => {
      const res = await recordCommunityCoverImage({ communityId, storagePath: path });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCoverVideoId(null);
      setCoverStoragePath(path);
      router.refresh();
    });
  }

  function clearCover() {
    setError(null);
    startTransition(async () => {
      const res = await clearCommunityCover({ communityId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCoverVideoId(null);
      setCoverStoragePath(null);
      router.refresh();
    });
  }

  if (!canEdit) {
    // Read-only preview for non-owners. Should rarely render — page-level
    // checks already gate access — but cheap to be explicit.
    return null;
  }

  return (
    <section className="rounded-lg border border-bronze/30 bg-ink2 p-4">
      <header className="mb-3">
        <h2 className="text-sm font-semibold text-cream">Cover</h2>
        <p className="mt-0.5 text-xs text-cream/60">
          Shown on the buyer Communities grid, the community page header, and saved cards. Pick
          a video or upload an image; otherwise the first video&apos;s thumbnail is used.
        </p>
      </header>

      <div className="flex gap-4">
        {/* Preview */}
        <div className="aspect-[9/16] w-32 shrink-0 overflow-hidden rounded bg-ink">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Cover"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[11px] text-cream/40">
              No cover
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={isPending || videos.length === 0}
            onClick={() => setShowPicker((v) => !v)}
            className="rounded border border-bronze/40 px-3 py-1.5 text-xs text-cream transition hover:border-gold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {videos.length === 0 ? 'No videos yet' : showPicker ? 'Cancel pick' : 'Pick from videos'}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => fileInputRef.current?.click()}
            className="rounded border border-bronze/40 px-3 py-1.5 text-xs text-cream transition hover:border-gold disabled:cursor-not-allowed disabled:opacity-50"
          >
            Upload image
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadImage(f);
              e.target.value = '';
            }}
          />
          {(coverVideoId || coverStoragePath) && (
            <button
              type="button"
              disabled={isPending}
              onClick={clearCover}
              className="rounded border border-bronze/40 px-3 py-1.5 text-xs text-cream/70 transition hover:border-red-500/60 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear cover
            </button>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          {isPending && <p className="text-xs text-cream/40">Saving…</p>}
        </div>
      </div>

      {showPicker && videos.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {videos.map((v) => {
            const selected = v.id === coverVideoId;
            return (
              <button
                key={v.id}
                type="button"
                disabled={isPending}
                onClick={() => pickVideo(v.id)}
                className={`relative aspect-[9/16] overflow-hidden rounded transition ${
                  selected ? 'ring-2 ring-gold' : 'ring-1 ring-bronze/30 hover:ring-gold/60'
                }`}
                title={v.title ?? 'Video'}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbnailUrl(v.cf_video_id)}
                  alt={v.title ?? 'Video'}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                {selected && (
                  <span className="absolute right-1 top-1 rounded bg-gold px-1.5 py-0.5 text-[10px] font-medium text-ink">
                    Cover
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
