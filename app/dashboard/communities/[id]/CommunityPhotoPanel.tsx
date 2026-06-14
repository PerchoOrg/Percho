'use client';

/**
 * CommunityPhotoPanel — Phase 20.2 (2026-06-13);
 *   Phase 23 (2026-06-14): trimmed school/POI categorization.
 *   Phase 24 (2026-06-14): added 12-category picker (batch mode).
 *
 * Lets an authenticated agent upload photos to a community's private
 * photo library. Photos are NOT visible to buyers — they're raw material
 * for future AI video generation. Tagging by category at upload time
 * means future AI assembly can group images by category without having
 * to infer it from pixels.
 *
 * UX (batch mode): pick one category, drop a stack of files; everything
 * in the stack gets that category. Switch category, drop another stack.
 * The picker stays sticky between uploads.
 */

import {
  deleteCommunityPhoto,
  recordCommunityPhoto,
} from '@/app/dashboard/communities/[id]/photo-actions';
import { createClient } from '@/lib/supabase/client';
import { COMMUNITY_PHOTOS_BUCKET, nextCommunityPhotoStoragePath } from '@/lib/supabase/storage';
import {
  COMMUNITY_VIDEO_CATEGORIES,
  type CommunityVideoCategoryId,
  getCategoryMeta,
  legacyKindForCategory,
} from '@/lib/zod/community-video-categories';
import { Trash2, Upload } from 'lucide-react';
import { useCallback, useRef, useState, useTransition } from 'react';

export interface CommunityPhotoRow {
  id: string;
  storage_path: string;
  signed_url: string | null;
  kind: 'school' | 'poi' | 'neighborhood' | string;
  category?: string | null;
  school_id: string | null;
  poi_id: string | null;
  alt_text: string | null;
  width: number | null;
  height: number | null;
  sort_order: number;
}

interface Props {
  communityId: string;
  initialPhotos: CommunityPhotoRow[];
  category: CommunityVideoCategoryId;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface PendingItem {
  tempId: string;
  fileName: string;
  preview: string;
  error?: string;
}

export function CommunityPhotoPanel({ communityId, initialPhotos, category }: Props) {
  const [photos, setPhotos] = useState<CommunityPhotoRow[]>(initialPhotos);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [_, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const meta = getCategoryMeta(category);

  const handleFiles = useCallback(
    async (files: FileList) => {
      setGlobalError(null);
      const supabase = createClient();
      const kind = legacyKindForCategory(category);

      for (const file of Array.from(files)) {
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

        const path = nextCommunityPhotoStoragePath(communityId, file.name);
        const { error: uploadErr } = await supabase.storage
          .from(COMMUNITY_PHOTOS_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });

        if (uploadErr) {
          console.error('[CommunityPhotoPanel] upload failed', uploadErr);
          setPending((prev) =>
            prev.map((p) => (p.tempId === tempId ? { ...p, error: uploadErr.message } : p)),
          );
          continue;
        }

        const dims = await readImageDimensions(preview);

        const result = await recordCommunityPhoto({
          communityId,
          storagePath: path,
          kind,
          category,
          schoolId: null,
          poiId: null,
          lat: null,
          lng: null,
          width: dims?.width ?? null,
          height: dims?.height ?? null,
          altText: null,
        });

        if (!result.ok) {
          await supabase.storage.from(COMMUNITY_PHOTOS_BUCKET).remove([path]);
          setPending((prev) =>
            prev.map((p) => (p.tempId === tempId ? { ...p, error: result.error } : p)),
          );
          continue;
        }

        setPending((prev) => prev.filter((p) => p.tempId !== tempId));
        setPhotos((prev) => [
          ...prev,
          {
            id: result.id,
            storage_path: path,
            signed_url: preview,
            kind,
            category,
            school_id: null,
            poi_id: null,
            alt_text: null,
            width: dims?.width ?? null,
            height: dims?.height ?? null,
            sort_order: result.sortOrder,
          },
        ]);
      }
    },
    [communityId, category],
  );

  const handleDelete = useCallback(
    (photoId: string) => {
      startTransition(async () => {
        const prev = photos;
        setPhotos((p) => p.filter((x) => x.id !== photoId));
        const res = await deleteCommunityPhoto({ communityId, photoId });
        if (!res.ok) {
          setGlobalError(`Delete failed: ${res.error}`);
          setPhotos(prev);
        }
      });
    },
    [communityId, photos],
  );

  return (
    <section className="rounded border border-bronze/30 bg-ink2 p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Photo library (private)</h2>
        <span className="text-cream/50 text-xs">{photos.length} uploaded</span>
      </div>
      <p className="mb-4 text-cream/60 text-xs">
        Photos here are <span className="text-cream/80">not visible to buyers</span> — they're raw
        material the platform can use to generate community videos later. JPEG / PNG / WebP, up to
        10 MB each.
      </p>

      {globalError ? (
        <div className="mb-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-200 text-xs">
          {globalError}
        </div>
      ) : null}

      <div className="mb-4">
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
          className="inline-flex items-center gap-2 rounded-md border border-bronze/40 bg-ink/40 px-4 py-2 text-cream/90 text-sm hover:border-bronze hover:text-cream"
        >
          <Upload size={16} aria-hidden="true" />
          Add photos as “{meta.label}”
        </button>
      </div>

      {pending.length > 0 ? (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {pending.map((p) => (
            <div
              key={p.tempId}
              className="relative aspect-[4/3] overflow-hidden rounded border border-bronze/20 bg-ink"
            >
              <img src={p.preview} alt="" className="h-full w-full object-cover opacity-50" />
              <div className="absolute inset-0 flex items-center justify-center text-cream/80 text-xs">
                {p.error ? <span className="text-red-300">{p.error}</span> : 'Uploading…'}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {photos.length > 0 ? (
        <details>
          <summary className="cursor-pointer select-none text-xs uppercase tracking-wide text-cream/60 hover:text-cream">
            Already uploaded ({photos.length})
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((photo) => {
              const catLabel = photo.category
                ? (COMMUNITY_VIDEO_CATEGORIES.find((c) => c.id === photo.category)?.label ?? null)
                : null;
              return (
                <div
                  key={photo.id}
                  className="group relative aspect-[4/3] overflow-hidden rounded border border-bronze/20 bg-ink"
                >
                  {photo.signed_url ? (
                    <img
                      src={photo.signed_url}
                      alt={photo.alt_text ?? ''}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-cream/40 text-xs">
                      (preview unavailable)
                    </div>
                  )}
                  {catLabel ? (
                    <span className="absolute bottom-1 left-1 rounded bg-ink/80 px-1.5 py-0.5 text-[10px] text-cream/80">
                      {catLabel}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleDelete(photo.id)}
                    aria-label="Delete photo"
                    className="absolute top-1.5 right-1.5 hidden rounded bg-ink/80 p-1.5 text-cream/80 hover:text-red-300 group-hover:block"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}
    </section>
  );
}

async function readImageDimensions(src: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
