'use client';

/**
 * CommunityMediaPanel — community hub Media tab.
 *
 * Unified Media tab, mirrors the listing edit hub's MediaPanel: one Content
 * card with a single "Click to upload" button (image/* + video/*) and stacked
 * Videos / Photos sub-sections. Plus what the listing version doesn't need:
 * a shared <CategoryPicker> at the top that tags BOTH the uploaded video and
 * the uploaded photos with the same community category.
 *
 * This is the only upload surface for communities — the legacy /upload,
 * /photos, /videos subroutes are redirect-only stubs.
 *
 * Pipeline:
 *   image/* → CommunityPhotoPanel.addFiles() (existing Supabase batch path)
 *   video/* → spawn one <VideoUploader> per file (existing tus pipeline w/
 *             category in `target`). On success we router.refresh() so the
 *             new row shows up in CommunityVideoManageList below.
 */

import {
  type CommunityKind,
  type UploadedVideo,
  VideoUploader,
} from '@/components/dashboard/VideoUploader';
import {
  type CommunityVideoCategoryId,
  getCategoryMeta,
  legacyKindForCategory,
} from '@/lib/zod/community-video-categories';
import { Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CategoryPicker, CategorySpecCard } from './CategoryPicker';
import {
  CommunityPhotoPanel,
  type CommunityPhotoPanelHandle,
  type CommunityPhotoRow,
} from './CommunityPhotoPanel';
import { CommunityVideoManageList, type ManageVideoRow } from './CommunityVideoManageList';

interface PendingVideoUpload {
  /** Stable key for React. */
  key: string;
  /** The picked file fed into VideoUploader as `initialFile`. */
  file: File;
}

interface Props {
  communityId: string;
  videos: ManageVideoRow[];
  myAgentId: string | null;
  photos: CommunityPhotoRow[];
  /** Phase 50.9: drives the Cover badge + clear/set actions per row. */
  coverVideoId: string | null;
  coverStoragePath: string | null;
  /** Phase 50.9: gates the photo "Set as cover" button. */
  canSetCover: boolean;
}

export function CommunityMediaPanel({
  communityId,
  videos,
  myAgentId,
  photos,
  coverVideoId,
  coverStoragePath,
  canSetCover,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const photoRef = useRef<CommunityPhotoPanelHandle | null>(null);
  const [category, setCategory] = useState<CommunityVideoCategoryId>('walk_the_block');
  const [pendingVideos, setPendingVideos] = useState<PendingVideoUpload[]>([]);
  const [unsupportedNotice, setUnsupportedNotice] = useState<string | null>(null);

  // Silent geolocation on mount — same trick CommunityVideoPanel uses (Phase
  // 23). Browser prompts once; if denied we proceed without coords. Coords
  // get attached to per-file VideoUploader `target` so the platform-wide
  // Nearby query keeps working without surfacing a UI control here.
  const [lat, setLat] = useState<number | undefined>(undefined);
  const [lng, setLng] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(Number(pos.coords.latitude.toFixed(6)));
        setLng(Number(pos.coords.longitude.toFixed(6)));
      },
      () => {
        // silent; coords stay undefined
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }, []);

  // Phase 50.12 (2026-06-23) / 50.16 (2026-06-23) — prefill consumer removed
  // (Phase 52+: no more FAB → /communities/new → ?prefill flow). The category
  // dropdown + per-file video uploader path is the only entry now.
  const kind: CommunityKind = legacyKindForCategory(category);
  const videoTarget = {
    scope: 'community' as const,
    communityId,
    kind,
    category,
    ...(typeof lat === 'number' ? { lat } : {}),
    ...(typeof lng === 'number' ? { lng } : {}),
  };

  const handlePicked = useCallback((files: FileList | File[]) => {
    setUnsupportedNotice(null);
    const arr = Array.from(files);
    const images: File[] = [];
    const vids: File[] = [];
    const skipped: string[] = [];
    for (const f of arr) {
      if (f.type.startsWith('image/')) images.push(f);
      else if (f.type.startsWith('video/')) vids.push(f);
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
    if (vids.length > 0) {
      setPendingVideos((prev) => [
        ...prev,
        ...vids.map((file) => ({
          key: `pick-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
        })),
      ]);
    }
  }, []);

  const handleVideoUploaded = useCallback(
    (key: string, _v: UploadedVideo) => {
      // Drop the uploader after a brief 'done' display, then re-fetch the
      // manage list so the row shows up below with edit / visibility / delete
      // controls. router.refresh() re-runs the server component and rehydrates
      // the `videos` prop.
      setTimeout(() => {
        setPendingVideos((prev) => prev.filter((p) => p.key !== key));
        router.refresh();
      }, 4000);
    },
    [router],
  );

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
      <div className="mb-4">
        <span className="text-muted text-xs">
          Upload videos and photos · same category tags both · pick any one as the community cover
        </span>
      </div>

      {/* Phase 50.11: Category dropdown (left) + Upload button (right) on a
          single row, items aligned to bottom so the dropdown's wider field
          and the button bottom-edge meet. SpecCard moved below so it
          doesn't make the Category column tower over the Upload button. */}
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <label
            htmlFor="community-media-category"
            className="mb-1.5 block text-xs font-medium text-ink2"
          >
            Category
          </label>
          <CategoryPicker mode="create" selected={category} onPick={setCategory} hideSpec />
        </div>
        <div>
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
        </div>
      </div>
      {unsupportedNotice ? (
        <p className="mb-3 text-[11px] text-red-300">{unsupportedNotice}</p>
      ) : null}
      <div className="mb-6">
        <CategorySpecCard meta={getCategoryMeta(category)} />
      </div>

      {/* Per-file video uploaders. Each owns its own pick→title→progress flow;
          we feed it `initialFile` so the agent skips the picker (already picked
          above) but still confirms the title. */}
      {pendingVideos.length > 0 ? (
        <div className="mb-6 space-y-3">
          {pendingVideos.map((p) => (
            <VideoUploader
              key={p.key}
              target={videoTarget}
              initialFile={p.file}
              onUploaded={(v) => handleVideoUploaded(p.key, v)}
            />
          ))}
        </div>
      ) : null}

      {/* Stacked sub-sections, listing-Media parity. Videos: flat row list with
          Set-as-cover + Delete (Phase 50.9 trim). Photos: grid w/ ⭐ Set-as-cover
          + 🗑 Delete on hover. */}
      <div className="space-y-6">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink2">Videos ({videos.length})</h3>
          <CommunityVideoManageList
            communityId={communityId}
            videos={videos}
            myAgentId={myAgentId}
            coverVideoId={coverVideoId}
          />
        </div>
        <div className="border-t border-line pt-6">
          <h3 className="mb-2 text-sm font-semibold text-ink2">Photos ({photos.length})</h3>
          <CommunityPhotoPanel
            ref={photoRef}
            communityId={communityId}
            initialPhotos={photos}
            category={category}
            hideUploadButton
            coverStoragePath={coverStoragePath}
            canSetCover={canSetCover}
          />
        </div>
      </div>
    </section>
  );
}
