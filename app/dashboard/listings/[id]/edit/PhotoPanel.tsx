'use client';

/**
 * PhotoPanel — Phase 10 (2026-06-12).
 *
 * Lets an agent attach photos to a listing. Mirrors the VideoPanel layout
 * but skips dnd-kit reorder (deferred to a fast-follow — V1 ships with
 * upload-order = display-order, agent can delete + re-upload to reorder).
 *
 * Upload flow:
 *   1. User picks one or more image files.
 *   2. For each: client uploads to Supabase Storage bucket `listing-photos`
 *      at `{listingId}/{uuid}.{ext}`. RLS on storage.objects fences the
 *      first path segment.
 *   3. On upload success, call `recordListingPhoto()` server action to
 *      insert the `listing_photos` row.
 *   4. Optimistic update: prepend a placeholder while uploading, replace
 *      with the real row on success, or remove with an error toast on
 *      failure.
 *
 * No status polling — photos are 'ready' immediately on insert.
 */

import { setListingCoverPhoto } from '@/app/dashboard/listings/[id]/edit/actions';
import {
  deleteListingPhoto,
  recordListingPhoto,
} from '@/app/dashboard/listings/[id]/edit/photo-actions';
import { createClient } from '@/lib/supabase/client';
import {
  LISTING_PHOTOS_BUCKET,
  nextPhotoStoragePath,
  photoPublicUrl,
} from '@/lib/supabase/storage';
import { Star, Trash2, Upload } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  useTransition,
} from 'react';

export interface ListingPhotoRow {
  id: string;
  storage_path: string;
  alt_text: string | null;
  width: number | null;
  height: number | null;
  sort_order: number;
}

interface Props {
  listingId: string;
  initialPhotos: ListingPhotoRow[];
  initialCoverPhotoId: string | null;
  /**
   * When true, hide the internal "Add photos" button and file input. Used
   * when MediaPanel renders a single unified upload button covering both
   * photos and videos and pushes images in via the imperative handle below.
   */
  hideUploadButton?: boolean;
}

/**
 * Phase 47.x — imperative handle exposed via `ref`. MediaPanel uses
 * `addFiles()` to forward image files picked from the unified upload button
 * into PhotoPanel's existing upload pipeline (validation + Supabase upload
 * + recordListingPhoto), so we don't fork the upload logic.
 */
export interface PhotoPanelHandle {
  addFiles: (files: File[]) => void;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB — matches bucket policy
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface PendingItem {
  tempId: string;
  fileName: string;
  preview: string; // object URL
  error?: string;
}

export const PhotoPanel = forwardRef<PhotoPanelHandle, Props>(function PhotoPanel(
  { listingId, initialPhotos, initialCoverPhotoId, hideUploadButton },
  ref,
) {
  const [photos, setPhotos] = useState<ListingPhotoRow[]>(initialPhotos);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [coverPhotoId, setCoverPhotoId] = useState<string | null>(initialCoverPhotoId);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [coverPending, setCoverPending] = useState(false);
  const [_, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = useCallback(
    async (files: File[] | FileList) => {
      setGlobalError(null);
      const supabase = createClient();

      const items = Array.from(files);
      for (const file of items) {
        const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        if (!ALLOWED_MIMES.has(file.type)) {
          setGlobalError(`"${file.name}" — only JPEG, PNG, or WebP allowed`);
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          setGlobalError(`"${file.name}" — file too large (max 10 MB)`);
          continue;
        }

        const preview = URL.createObjectURL(file);
        setPending((prev) => [...prev, { tempId, fileName: file.name, preview }]);

        const path = nextPhotoStoragePath(listingId, file.name);
        const { error: uploadErr } = await supabase.storage
          .from(LISTING_PHOTOS_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });

        if (uploadErr) {
          console.error('[PhotoPanel] upload failed', uploadErr);
          setPending((prev) =>
            prev.map((p) => (p.tempId === tempId ? { ...p, error: uploadErr.message } : p)),
          );
          continue;
        }

        // Best-effort: read image dimensions from the preview blob.
        const dims = await readImageDimensions(preview);

        const result = await recordListingPhoto({
          listingId,
          storagePath: path,
          width: dims?.width ?? null,
          height: dims?.height ?? null,
          altText: null,
        });

        if (!result.ok) {
          // Roll back the storage upload to avoid orphaned files.
          await supabase.storage.from(LISTING_PHOTOS_BUCKET).remove([path]);
          setPending((prev) =>
            prev.map((p) => (p.tempId === tempId ? { ...p, error: result.error } : p)),
          );
          continue;
        }

        // Success: drop pending item and append real row.
        URL.revokeObjectURL(preview);
        setPending((prev) => prev.filter((p) => p.tempId !== tempId));
        setPhotos((prev) => [
          ...prev,
          {
            id: result.id,
            storage_path: path,
            alt_text: null,
            width: dims?.width ?? null,
            height: dims?.height ?? null,
            sort_order: result.sortOrder,
          },
        ]);
      }
    },
    [listingId],
  );

  // Phase 47.x: expose addFiles to MediaPanel so the unified upload button
  // can route image files through PhotoPanel's existing pipeline.
  useImperativeHandle(
    ref,
    () => ({
      addFiles: (files: File[]) => {
        if (files.length > 0) void handleFiles(files);
      },
    }),
    [handleFiles],
  );

  const handleDelete = useCallback(
    (photoId: string) => {
      startTransition(async () => {
        // Optimistic remove.
        const prev = photos;
        const wasCover = coverPhotoId === photoId;
        setPhotos((p) => p.filter((x) => x.id !== photoId));
        if (wasCover) setCoverPhotoId(null);
        const res = await deleteListingPhoto({ listingId, photoId });
        if (!res.ok) {
          setGlobalError(`Delete failed: ${res.error}`);
          setPhotos(prev);
          if (wasCover) setCoverPhotoId(photoId);
        }
      });
    },
    [listingId, photos, coverPhotoId],
  );

  const handleSetCover = useCallback(
    (photoId: string | null) => {
      const previous = coverPhotoId;
      setCoverPhotoId(photoId); // optimistic
      setCoverError(null);
      setCoverPending(true);
      startTransition(async () => {
        const result = await setListingCoverPhoto(listingId, photoId);
        setCoverPending(false);
        if (!result.ok) {
          setCoverPhotoId(previous);
          setCoverError(result.error);
        }
      });
    },
    [coverPhotoId, listingId],
  );

  return (
    <div className="space-y-4">
      {globalError ? (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-200 text-xs">
          {globalError}
        </div>
      ) : null}

      {coverError ? (
        <div className="rounded border border-red-400/40 bg-red-950/30 px-3 py-2 text-sm text-red-300">
          Cover update failed: {coverError}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {photos.map((photo) => {
          const isCover = coverPhotoId === photo.id;
          return (
            <div
              key={photo.id}
              className={`group relative aspect-[4/3] overflow-hidden rounded border bg-bg ${
                isCover ? 'border-line-strong ring-1 ring-line-strong' : 'border-line'
              }`}
            >
              {/* Cross-origin Supabase URL — next/image domain config out of scope. */}
              <img
                src={photoPublicUrl(photo.storage_path)}
                alt={photo.alt_text ?? ''}
                loading="lazy"
                className="h-full w-full object-cover"
              />

              {isCover ? (
                <span className="absolute top-1.5 left-1.5 rounded bg-ink px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cream">
                  Cover
                </span>
              ) : null}

              <button
                type="button"
                onClick={() => handleSetCover(isCover ? null : photo.id)}
                disabled={coverPending}
                aria-label={isCover ? 'Clear cover' : 'Set as cover'}
                title={isCover ? 'Clear cover' : 'Set as cover'}
                className={`absolute top-1.5 right-9 rounded bg-bg p-1.5 disabled:opacity-50 ${
                  isCover ? 'text-ink block' : 'hidden text-ink2 hover:text-ink group-hover:block'
                }`}
              >
                <Star size={14} aria-hidden="true" fill={isCover ? 'currentColor' : 'none'} />
              </button>

              <button
                type="button"
                onClick={() => handleDelete(photo.id)}
                aria-label="Delete photo"
                className="absolute top-1.5 right-1.5 hidden rounded bg-bg p-1.5 text-ink2 hover:text-red-300 group-hover:block"
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          );
        })}

        {pending.map((p) => (
          <div
            key={p.tempId}
            className="relative aspect-[4/3] overflow-hidden rounded border border-line bg-bg"
          >
            {/* Object-URL preview during upload. */}
            <img src={p.preview} alt="" className="h-full w-full object-cover opacity-50" />
            <div className="absolute inset-0 flex items-center justify-center text-ink2 text-xs">
              {p.error ? <span className="text-red-300">{p.error}</span> : 'Uploading…'}
            </div>
          </div>
        ))}
      </div>

      <div className={hideUploadButton ? 'hidden' : undefined}>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              void handleFiles(e.target.files);
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
          Add photos
        </button>
        <p className="mt-2 text-muted text-xs">JPEG / PNG / WebP, up to 10 MB each.</p>
      </div>
    </div>
  );
});

async function readImageDimensions(src: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
