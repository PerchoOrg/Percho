'use client';

/**
 * VideoPanel — listing-video manager for the edit page.
 *
 * Responsibilities:
 *  - Render the list of `listing_videos` for the current listing, ordered by
 *    sort_order.
 * - Embed the existing `VideoUploader` so the agent can add videos
 *    inline. New videos optimistic-append at the bottom (highest sort_order
 *    seen so far + 1) and poll /api/video/list for status flips.
 *  - dnd-kit drag-and-drop to reorder, persisted via `reorderListingVideos`
 *    server action. Optimistic UI: reorder locally, then save in background;
 *    on failure, revert and surface an inline error.
 *
 * Cover-photo selection is deferred to 4.3c (separate component, will sit
 * alongside this one on the same page).
 */

import {
  deleteListingVideo,
  reorderListingVideos,
  setListingCover,
} from '@/app/dashboard/listings/[id]/edit/actions';
import { type UploadedVideo, VideoUploader } from '@/components/dashboard/VideoUploader';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useTransition,
} from 'react';

export interface ListingVideoRow {
  id: string;
  cf_video_id: string;
  cf_video_id_landscape: string | null;
  kind: string;
  title: string | null;
  status: string;
  sort_order: number;
}

interface Props {
  listingId: string;
  initialVideos: ListingVideoRow[];
  initialCoverVideoId: string | null;
  /**
   * .x: when true, hide the embedded VideoUploader. MediaPanel
   * renders its own per-file VideoUploader instances and pushes successful
   * uploads in via the imperative handle below.
   */
  hideUploader?: boolean;
}

/**
 * .x — imperative handle. MediaPanel calls `pushUploaded()` after a
 * VideoUploader instance it owns finishes, so the row appears in the
 * VideoPanel grid + status-poll loop just like an inline upload would.
 */
export interface VideoPanelHandle {
  pushUploaded: (video: UploadedVideo) => void;
}

const POLL_INTERVAL_MS = 5000;

export const VideoPanel = forwardRef<VideoPanelHandle, Props>(function VideoPanel(
  { listingId, initialVideos, initialCoverVideoId, hideUploader },
  ref,
) {
  const [videos, setVideos] = useState<ListingVideoRow[]>(initialVideos);
  const [coverVideoId, setCoverVideoId] = useState<string | null>(initialCoverVideoId);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [coverPending, setCoverPending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const videosRef = useRef(videos);
  videosRef.current = videos;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Poll for status flips while any row is processing. Same pattern as
  // VideoUploader but scoped to this listing.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      const hasProcessing = videosRef.current.some((v) => v.status === 'processing');
      if (!hasProcessing) {
        timer = setTimeout(poll, POLL_INTERVAL_MS);
        return;
      }
      try {
        const res = await fetch(`/api/video/list?listing_id=${listingId}`, {
          cache: 'no-store',
        });
        if (res.ok && !cancelled) {
          const json = (await res.json()) as {
            videos: Array<{
              id: string;
              cf_video_id: string;
              cf_video_id_landscape: string | null;
              kind: string;
              title: string | null;
              status: string;
              created_at: string;
            }>;
          };
          // Server returns newest-first by created_at; we need our local order.
          // Merge status only — keep our sort, drop any rows server lost.
          setVideos((prev) => {
            const serverById = new Map(json.videos.map((v) => [v.id, v]));
            return prev
              .filter((v) => serverById.has(v.id))
              .map((v) => {
                const s = serverById.get(v.id);
                return s
                  ? {
                      ...v,
                      status: s.status,
                      title: s.title,
                      cf_video_id_landscape: s.cf_video_id_landscape ?? null,
                    }
                  : v;
              });
          });
        }
      } catch {
        // network blip — try again next tick
      }
      if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS);
    }
    timer = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [listingId]);

  const handleUploaded = useCallback((v: UploadedVideo) => {
    setVideos((prev) => {
      if (prev.some((p) => p.id === v.rowId)) return prev;
      const nextSort = prev.length === 0 ? 0 : Math.max(...prev.map((r) => r.sort_order)) + 1;
      const optimistic: ListingVideoRow = {
        id: v.rowId,
        cf_video_id: v.videoId,
        cf_video_id_landscape: null,
        kind: v.kind,
        title: v.title,
        status: 'processing',
        sort_order: nextSort,
      };
      return [...prev, optimistic];
    });
  }, []);

  // .x: expose pushUploaded so MediaPanel-owned VideoUploaders feed
  // successful uploads back into this panel's grid + status-poll.
  useImperativeHandle(ref, () => ({ pushUploaded: handleUploaded }), [handleUploaded]);

  const handleSetCover = useCallback(
    (videoId: string | null) => {
      const previous = coverVideoId;
      setCoverVideoId(videoId); // optimistic
      setCoverError(null);
      setCoverPending(true);
      startTransition(async () => {
        const result = await setListingCover(listingId, videoId);
        setCoverPending(false);
        if (!result.ok) {
          setCoverVideoId(previous);
          setCoverError(result.error);
        }
      });
    },
    [coverVideoId, listingId],
  );

  const handleDelete = useCallback(
    (videoId: string, title: string | null) => {
      const label = title?.trim() || 'this video';
      // Native confirm — V1 ok, no design system modal yet. Phase-N: lift to
      // a styled dialog if confirm() UX gets pushback.
      if (!window.confirm(`Delete ${label}? This can't be undone.`)) return;
      const previous = videos;
      setVideos((prev) => prev.filter((v) => v.id !== videoId));
      setDeleteError(null);
      setDeletingId(videoId);
      startTransition(async () => {
        const result = await deleteListingVideo(listingId, videoId);
        setDeletingId(null);
        if (!result.ok) {
          setVideos(previous);
          setDeleteError(result.error);
        } else if (coverVideoId === videoId) {
          // Server cleared cover_url; reflect locally.
          setCoverVideoId(null);
        }
      });
    },
    [videos, coverVideoId, listingId],
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = videos.findIndex((v) => v.id === active.id);
    const newIndex = videos.findIndex((v) => v.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(videos, oldIndex, newIndex).map((v, i) => ({
      ...v,
      sort_order: i,
    }));
    const previous = videos;
    setVideos(reordered);
    setReorderError(null);

    startTransition(async () => {
      const result = await reorderListingVideos(
        listingId,
        reordered.map((v) => v.id),
      );
      if (!result.ok) {
        setVideos(previous);
        setReorderError(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {hideUploader ? null : (
        <VideoUploader target={{ scope: 'listing', listingId }} onUploaded={handleUploaded} />
      )}

      {reorderError ? (
        <div className="rounded border border-red-400/40 bg-red-950/30 px-3 py-2 text-sm text-red-300">
          Reorder failed: {reorderError}. Drag again to retry.
        </div>
      ) : null}

      {coverError ? (
        <div className="rounded border border-red-400/40 bg-red-950/30 px-3 py-2 text-sm text-red-300">
          Cover update failed: {coverError}
        </div>
      ) : null}

      {deleteError ? (
        <div className="rounded border border-red-400/40 bg-red-950/30 px-3 py-2 text-sm text-red-300">
          Delete failed: {deleteError}
        </div>
      ) : null}

      {videos.length === 0 ? (
        <p className="text-sm text-muted">No videos yet. Use the uploader above.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={videos.map((v) => v.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {videos.map((v, i) => (
                <SortableVideoItem
                  key={v.id}
                  video={v}
                  index={i}
                  isCover={coverVideoId === v.id}
                  coverPending={coverPending}
                  deletePending={deletingId === v.id}
                  onSetCover={handleSetCover}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
});

function SortableVideoItem({
  video,
  index,
  isCover,
  coverPending,
  deletePending,
  onSetCover,
  onDelete,
}: {
  video: ListingVideoRow;
  index: number;
  isCover: boolean;
  coverPending: boolean;
  deletePending: boolean;
  onSetCover: (videoId: string | null) => void;
  onDelete: (videoId: string, title: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: video.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  let thumb: string | null = null;
  if (video.status === 'ready') {
    // Prefer portrait (main cf_video_id). Some auto-generated rows have only
    // the landscape variant populated — fall back so the row still shows a
    // real thumbnail instead of the film-icon placeholder.
    const thumbId = video.cf_video_id ?? video.cf_video_id_landscape;
    if (thumbId) {
      try {
        thumb = thumbnailUrl(thumbId);
      } catch {
        thumb = null;
      }
    }
  }

  const canBeCover = video.status === 'ready';

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex flex-wrap items-center gap-3 rounded border p-3 ${
        isCover ? 'border-line-strong bg-surface' : 'border-line bg-surface'
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab select-none px-2 py-1 text-muted hover:text-ink2 active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        ⋮⋮
      </button>
      <span className="w-6 text-xs text-muted">{index + 1}</span>
      <div className="h-12 w-20 flex-shrink-0 overflow-hidden rounded bg-bg">
        {thumb ? (
          // CF Stream thumbnails are external; using next/image needs remotePatterns
          // config and adds no win for a 80×48 dashboard preview. Plain <img> here.
          // CF thumbnail generation lags ~10-60s behind status='ready', so if the
          // URL 404s the browser would render a broken "?" glyph — swap it to an
          // inline SVG film icon instead so the row stays clean.
          <img
            src={thumb}
            alt=""
            className="h-full w-full object-cover"
            onError={(e) => {
              const el = e.currentTarget;
              el.style.display = 'none';
              const sibling = el.nextElementSibling as HTMLElement | null;
              if (sibling) sibling.style.display = 'flex';
            }}
          />
        ) : null}
        <div
          className="flex h-full w-full items-center justify-center text-xs text-muted"
          style={{ display: thumb ? 'none' : 'flex' }}
          aria-hidden
        >
          {video.status === 'processing' ? (
            '…'
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M2 8h4M18 8h4M2 16h4M18 16h4M8 4v16M16 4v16" />
            </svg>
          )}
        </div>
      </div>
      <div className="min-w-0 flex-1 basis-[8rem]">
        <div className="truncate text-sm text-ink">
          {(video.title ?? video.cf_video_id).replace(/\s*\(auto-generated\)\s*$/i, '')}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {isCover ? (
            <span className="flex-shrink-0 rounded bg-ink px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cream">
              Cover
            </span>
          ) : null}
          {video.kind ? (
            <span className="flex-shrink-0 rounded bg-ink/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink2">
              {video.kind}
            </span>
          ) : null}
          {/(auto-generated)/i.test(video.title ?? '') ? (
            <span
              className="flex-shrink-0 rounded bg-ink/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink2"
              title="Auto-generated from listing photos"
            >
              Auto
            </span>
          ) : null}
          {video.cf_video_id_landscape ? (
            <span
              className="flex-shrink-0 rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-300"
              title="A landscape (16:9) version is also available. Viewers can toggle full-screen in the browse feed."
            >
              Landscape
            </span>
          ) : null}
          {video.status !== 'ready' ? (
            <span className="text-xs text-muted">
              <StatusText status={video.status} />
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex w-full flex-shrink-0 items-center gap-2 sm:w-auto">
        {isCover ? (
          <button
            type="button"
            onClick={() => onSetCover(null)}
            disabled={coverPending}
            className="w-full whitespace-nowrap rounded border border-line px-2 py-1 text-xs text-ink2 hover:border-line hover:text-ink disabled:opacity-50 sm:w-auto"
          >
            Clear cover
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSetCover(video.id)}
            disabled={!canBeCover || coverPending}
            title={
              canBeCover
                ? 'Use this video as the listing cover'
                : 'Available once processing finishes'
            }
            className="w-full whitespace-nowrap rounded border border-line px-2 py-1 text-xs text-ink2 hover:border-line-strong hover:text-ink disabled:opacity-30 sm:w-auto"
          >
            Set as cover
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(video.id, video.title)}
          disabled={deletePending}
          title="Remove this video"
          className="whitespace-nowrap rounded border border-line px-2 py-1 text-xs text-red-400 hover:border-red-400/60 hover:text-red-300 disabled:opacity-30"
        >
          {deletePending ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </li>
  );
}

function StatusText({ status }: { status: string }) {
  // humanize Cloudflare Stream lifecycle states.
  // Callers are expected to skip rendering this when status === 'ready'
  // (the happy path is silent, no flag needed). We still handle it for
  // defensive rendering.
  if (status === 'ready') return <span className="text-emerald-400">Ready</span>;
  if (status === 'error') return <span className="text-red-400">Upload failed</span>;
  return <span className="text-ink">Processing…</span>;
}
