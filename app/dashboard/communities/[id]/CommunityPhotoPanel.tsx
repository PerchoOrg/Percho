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

import { setCommunityCoverFromPhoto } from '@/app/dashboard/communities/[id]/cover-actions';
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
import { Star, Trash2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useTransition,
} from 'react';

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
  /**
   * Phase 45.16 (2026-06-20): files queued by UploadFAB and handed off via
   * the upload-prefill-store. When present (and non-empty) on first mount,
   * the panel auto-uploads them under the current category — same path as
   * if the agent had picked them via the "Add photos" button. Subsequent
   * renders ignore the prop (consumePrefill makes it a one-shot anyway).
   */
  prefillFiles?: File[];
  /**
   * Phase 50.x: when true, hide the internal "Add photos as ..." button and
   * its file input. Used when CommunityMediaPanel renders a single unified
   * upload button covering both photos and videos and pushes images in via
   * the imperative handle below. Mirrors `PhotoPanel`'s `hideUploadButton`.
   */
  hideUploadButton?: boolean;
  /**
   * Phase 50.9 (2026-06-23): when present, drives the cover indicator (⭐
   * badge) on the matching photo card and lets agents pick a different
   * photo as cover. Null means no photo is currently the cover (could be
   * a video, or no cover at all). Owner-only — non-owners never see the
   * Set-as-cover button regardless of this prop.
   */
  coverStoragePath?: string | null;
  /**
   * Phase 50.9: gate the per-photo "Set as cover" button. The page already
   * checks `canEditMetadata` server-side; this prop lets the parent thread
   * the same flag through without re-deriving it.
   */
  canSetCover?: boolean;
  /**
   * Phase 50.17 (2026-06-23): notify the parent each time a photo finishes
   * (or fails) so it can update the prefill upload banner. Called once per
   * file, with `ok` reflecting whether the upload + DB record succeeded.
   */
  onUploadResolved?: (ok: boolean) => void;
}

/**
 * Phase 50.x — imperative handle exposed via `ref`. The parent media shell
 * forwards image files picked from the unified upload button into the
 * existing handleFiles pipeline so we don't fork upload logic.
 */
export interface CommunityPhotoPanelHandle {
  addFiles: (files: File[]) => void;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface PendingItem {
  tempId: string;
  fileName: string;
  preview: string;
  error?: string;
}

export const CommunityPhotoPanel = forwardRef<CommunityPhotoPanelHandle, Props>(
  function CommunityPhotoPanel(
    {
      communityId,
      initialPhotos,
      category,
      prefillFiles,
      hideUploadButton,
      coverStoragePath,
      canSetCover,
      onUploadResolved,
    },
    ref,
  ) {
    const router = useRouter();
    const [photos, setPhotos] = useState<CommunityPhotoRow[]>(initialPhotos);
    const [pending, setPending] = useState<PendingItem[]>([]);
    const [globalError, setGlobalError] = useState<string | null>(null);
    const [_, startTransition] = useTransition();
    const inputRef = useRef<HTMLInputElement | null>(null);
    // Phase 45.16: latch category at mount-time so the auto-upload effect can
    // run with the value the FAB intended (the user may switch categories
    // between mount and any subsequent prop change — but we already kicked
    // off the prefill upload by then).
    const categoryRef = useRef(category);
    categoryRef.current = category;

    const meta = getCategoryMeta(category);

    // Phase 50.17: latch onUploadResolved through a ref so handleFiles's
    // useCallback identity stays stable. Each photo end (success or error)
    // calls this once.
    const onResolvedRef = useRef(onUploadResolved);
    onResolvedRef.current = onUploadResolved;

    const handleFiles = useCallback(
      async (files: Iterable<File>, useCategory?: CommunityVideoCategoryId) => {
        setGlobalError(null);
        const supabase = createClient();
        const cat = useCategory ?? categoryRef.current;
        const kind = legacyKindForCategory(cat);

        for (const file of Array.from(files)) {
          const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

          if (!ALLOWED_MIMES.has(file.type)) {
            setGlobalError(`"${file.name}" — only JPEG, PNG, or WebP allowed`);
            onResolvedRef.current?.(false);
            continue;
          }
          if (file.size > MAX_FILE_BYTES) {
            setGlobalError(`"${file.name}" — file too large (max 10 MB)`);
            onResolvedRef.current?.(false);
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
            onResolvedRef.current?.(false);
            continue;
          }

          const dims = await readImageDimensions(preview);

          const result = await recordCommunityPhoto({
            communityId,
            storagePath: path,
            kind,
            category: cat,
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
            onResolvedRef.current?.(false);
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
              category: cat,
              school_id: null,
              poi_id: null,
              alt_text: null,
              width: dims?.width ?? null,
              height: dims?.height ?? null,
              sort_order: result.sortOrder,
            },
          ]);
          onResolvedRef.current?.(true);
        }
      },
      [communityId],
    );

    // Phase 50.x: expose addFiles to the parent media shell so the unified
    // upload button can route image files through this panel's existing
    // handleFiles pipeline (validation + Supabase upload + recordCommunityPhoto).
    useImperativeHandle(
      ref,
      () => ({
        addFiles: (files: File[]) => {
          if (files.length > 0) void handleFiles(files);
        },
      }),
      [handleFiles],
    );

    // Phase 45.16: auto-upload prefilled files once on mount. The bridge
    // consumes the upload-prefill-store key (one-shot) so re-renders won't
    // double-upload, but we still gate on a ref to be defensive against
    // StrictMode double-invoke in dev.
    const didConsumePrefill = useRef(false);
    useEffect(() => {
      if (didConsumePrefill.current) return;
      if (!prefillFiles || prefillFiles.length === 0) return;
      didConsumePrefill.current = true;
      // Only photos belong here — videos go through CommunityVideoPanel.
      const photos = prefillFiles.filter((f) => f.type.startsWith('image/'));
      if (photos.length === 0) return;
      void handleFiles(photos);
    }, [prefillFiles, handleFiles]);

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

    // Phase 50.9: per-photo "Set as cover". Server action copies the file
    // from the private community-photos bucket to the public community-covers
    // bucket and updates communities.cover_storage_path. We router.refresh()
    // on success so the new badge shows up + the hero hero updates.
    const [coverBusyId, setCoverBusyId] = useState<string | null>(null);
    const handleSetCover = useCallback(
      (photoStoragePath: string) => {
        setGlobalError(null);
        setCoverBusyId(photoStoragePath);
        startTransition(async () => {
          const res = await setCommunityCoverFromPhoto({
            communityId,
            photoStoragePath,
          });
          setCoverBusyId(null);
          if (!res.ok) {
            setGlobalError(`Set cover failed: ${res.error}`);
            return;
          }
          router.refresh();
        });
      },
      [communityId, router],
    );

    // When embedded in the unified media shell, drop the surface chrome
    // (heading, description, card border) so it reads as a sub-section of the
    // parent card rather than a card-in-card. Mirrors `PhotoPanel`'s embedded
    // shape under MediaPanel.
    const Wrapper = hideUploadButton ? 'div' : 'section';
    const wrapperClassName = hideUploadButton
      ? 'space-y-4'
      : 'rounded border border-line bg-surface p-5';

    return (
      <Wrapper className={wrapperClassName}>
        {hideUploadButton ? null : (
          <>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-base font-semibold">Photo library (private)</h2>
              <span className="text-muted text-xs">{photos.length} uploaded</span>
            </div>
            <p className="mb-4 text-ink2 text-xs">
              Photos here are <span className="text-ink2">not visible to buyers</span> — they're raw
              material the platform can use to generate community videos later. JPEG / PNG / WebP,
              up to 10 MB each.
            </p>
          </>
        )}

        {globalError ? (
          <div className="mb-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-200 text-xs">
            {globalError}
          </div>
        ) : null}

        <div className={hideUploadButton ? 'hidden' : 'mb-4'}>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                void handleFiles(Array.from(e.target.files));
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
            Add photos as “{meta.label}”
          </button>
        </div>

        {pending.length > 0 ? (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {pending.map((p) => (
              <div
                key={p.tempId}
                className="relative aspect-[4/3] overflow-hidden rounded border border-line bg-bg"
              >
                <img src={p.preview} alt="" className="h-full w-full object-cover opacity-50" />
                <div className="absolute inset-0 flex items-center justify-center text-ink2 text-xs">
                  {p.error ? <span className="text-red-300">{p.error}</span> : 'Uploading…'}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {photos.length > 0 ? (
          hideUploadButton ? (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {photos.map((photo) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  onDelete={handleDelete}
                  isCover={coverStoragePath != null && coverStoragePath === photo.storage_path}
                  canSetCover={!!canSetCover}
                  onSetCover={handleSetCover}
                  coverBusy={coverBusyId === photo.storage_path}
                />
              ))}
            </div>
          ) : (
            <details>
              <summary className="cursor-pointer select-none text-xs uppercase tracking-wide text-ink2 hover:text-ink">
                Already uploaded ({photos.length})
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {photos.map((photo) => (
                  <PhotoCard
                    key={photo.id}
                    photo={photo}
                    onDelete={handleDelete}
                    isCover={coverStoragePath != null && coverStoragePath === photo.storage_path}
                    canSetCover={!!canSetCover}
                    onSetCover={handleSetCover}
                    coverBusy={coverBusyId === photo.storage_path}
                  />
                ))}
              </div>
            </details>
          )
        ) : null}
      </Wrapper>
    );
  },
);

async function readImageDimensions(src: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function PhotoCard({
  photo,
  onDelete,
  isCover,
  canSetCover,
  onSetCover,
  coverBusy,
}: {
  photo: CommunityPhotoRow;
  onDelete: (id: string) => void;
  isCover: boolean;
  canSetCover: boolean;
  onSetCover: (storagePath: string) => void;
  coverBusy: boolean;
}) {
  const catLabel = photo.category
    ? (COMMUNITY_VIDEO_CATEGORIES.find((c) => c.id === photo.category)?.label ?? null)
    : null;
  return (
    <div
      className={`group relative aspect-[4/3] overflow-hidden rounded border bg-bg ${
        isCover ? 'border-line-strong' : 'border-line'
      }`}
    >
      {photo.signed_url ? (
        <img
          src={photo.signed_url}
          alt={photo.alt_text ?? ''}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted text-xs">
          (preview unavailable)
        </div>
      )}
      {isCover ? (
        <span className="absolute top-1.5 left-1.5 rounded bg-ink px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cream">
          Cover
        </span>
      ) : null}
      {catLabel ? (
        <span className="absolute bottom-1 left-1 rounded bg-bg px-1.5 py-0.5 text-[10px] text-ink2">
          {catLabel}
        </span>
      ) : null}
      {canSetCover && !isCover ? (
        <button
          type="button"
          onClick={() => onSetCover(photo.storage_path)}
          disabled={coverBusy}
          aria-label="Set as cover"
          title="Set as cover"
          className="absolute top-1.5 right-9 hidden rounded bg-bg p-1.5 text-ink2 hover:text-ink disabled:opacity-50 group-hover:block"
        >
          <Star size={14} aria-hidden="true" />
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onDelete(photo.id)}
        aria-label="Delete photo"
        className="absolute top-1.5 right-1.5 hidden rounded bg-bg p-1.5 text-ink2 hover:text-red-300 group-hover:block"
      >
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
