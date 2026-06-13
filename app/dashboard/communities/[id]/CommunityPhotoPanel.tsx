'use client';

/**
 * CommunityPhotoPanel — Phase 20.2 (2026-06-13).
 *
 * Lets an authenticated agent upload photos to a community's private
 * photo library. Photos are NOT visible to buyers — they're raw material
 * for future AI video generation.
 *
 * Flow mirrors PhotoPanel (listing photos):
 *   1. Pick files → client uploads each to private bucket via supabase-js.
 *      Storage RLS scopes by community_id + agent membership.
 *   2. On upload success, recordCommunityPhoto() inserts a row.
 *   3. Existing photos: server passes signed URLs (1h TTL) for the grid.
 *      Bucket is private so we cannot construct a public URL.
 */

import {
  deleteCommunityPhoto,
  recordCommunityPhoto,
} from '@/app/dashboard/communities/[id]/photo-actions';
import { createClient } from '@/lib/supabase/client';
import { COMMUNITY_PHOTOS_BUCKET, nextCommunityPhotoStoragePath } from '@/lib/supabase/storage';
import { Trash2, Upload } from 'lucide-react';
import { useCallback, useRef, useState, useTransition } from 'react';
import type { PoiRow, SchoolRow } from './page';

export interface CommunityPhotoRow {
  id: string;
  storage_path: string;
  signed_url: string | null;
  kind: 'school' | 'poi' | 'neighborhood' | string;
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
  schools: SchoolRow[];
  pois: PoiRow[];
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface PendingItem {
  tempId: string;
  fileName: string;
  preview: string;
  error?: string;
}

export function CommunityPhotoPanel({ communityId, initialPhotos, schools, pois }: Props) {
  const [photos, setPhotos] = useState<CommunityPhotoRow[]>(initialPhotos);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [kind, setKind] = useState<'school' | 'poi' | 'neighborhood'>('neighborhood');
  const [schoolId, setSchoolId] = useState<string>('');
  const [poiId, setPoiId] = useState<string>('');
  const [_, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = useCallback(
    async (files: FileList) => {
      setGlobalError(null);
      const supabase = createClient();
      // Snapshot tagging at the moment of pick so a mid-batch dropdown
      // change doesn't retag in-flight uploads.
      const taggedKind = kind;
      const taggedSchool = kind === 'school' && schoolId ? schoolId : null;
      const taggedPoi = kind === 'poi' && poiId ? poiId : null;

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
          kind: taggedKind,
          schoolId: taggedSchool,
          poiId: taggedPoi,
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

        // For freshly uploaded photos, we use the local object-URL preview
        // until the page revalidates and refetches with a signed URL.
        setPending((prev) => prev.filter((p) => p.tempId !== tempId));
        setPhotos((prev) => [
          ...prev,
          {
            id: result.id,
            storage_path: path,
            signed_url: preview, // local preview; revalidated on next nav
            kind: taggedKind,
            school_id: taggedSchool,
            poi_id: taggedPoi,
            alt_text: null,
            width: dims?.width ?? null,
            height: dims?.height ?? null,
            sort_order: result.sortOrder,
          },
        ]);
      }
    },
    [communityId, kind, schoolId, poiId],
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
        <h2 className="text-base font-semibold">Upload photos (private library)</h2>
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

      <details className="mb-4 rounded border border-bronze/20 bg-ink/50 px-3 py-2 text-sm">
        <summary className="cursor-pointer select-none text-cream/60 text-xs uppercase tracking-wide hover:text-cream">
          Categorize next upload (optional)
        </summary>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="mb-1 block font-medium text-cream/70 text-xs">Kind</span>
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as 'school' | 'poi' | 'neighborhood');
                setSchoolId('');
                setPoiId('');
              }}
              className="w-full rounded border border-bronze/30 bg-ink px-3 py-2 text-cream text-sm focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
            >
              <option value="neighborhood">neighborhood</option>
              <option value="school">school</option>
              <option value="poi">poi</option>
            </select>
          </label>
          {kind === 'school' && schools.length > 0 && (
            <label className="block">
              <span className="mb-1 block font-medium text-cream/70 text-xs">
                Link to school (optional)
              </span>
              <select
                value={schoolId}
                onChange={(e) => setSchoolId(e.target.value)}
                className="w-full rounded border border-bronze/30 bg-ink px-3 py-2 text-cream text-sm focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
              >
                <option value="">— unlinked —</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind === 'poi' && pois.length > 0 && (
            <label className="block">
              <span className="mb-1 block font-medium text-cream/70 text-xs">
                Link to POI (optional)
              </span>
              <select
                value={poiId}
                onChange={(e) => setPoiId(e.target.value)}
                className="w-full rounded border border-bronze/30 bg-ink px-3 py-2 text-cream text-sm focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
              >
                <option value="">— unlinked —</option>
                {pois.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} [{p.poi_type}]
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </details>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {photos.map((photo) => (
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
            <button
              type="button"
              onClick={() => handleDelete(photo.id)}
              aria-label="Delete photo"
              className="absolute top-1.5 right-1.5 hidden rounded bg-ink/80 p-1.5 text-cream/80 hover:text-red-300 group-hover:block"
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
            {photo.kind !== 'neighborhood' && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-ink/90 to-transparent px-2 py-1 text-[10px] text-cream/80">
                {photo.kind}
              </div>
            )}
          </div>
        ))}

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

      <div>
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
          Add photos
        </button>
      </div>
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
