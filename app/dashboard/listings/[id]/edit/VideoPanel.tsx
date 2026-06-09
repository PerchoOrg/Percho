'use client';

/**
 * VideoPanel — Phase 4.3b — listing-video manager for the edit page.
 *
 * Responsibilities:
 *  - Render the list of `listing_videos` for the current listing, ordered by
 *    sort_order.
 *  - Embed the existing Phase 2 `VideoUploader` so the agent can add videos
 *    inline. New videos optimistic-append at the bottom (highest sort_order
 *    seen so far + 1) and poll /api/video/list for status flips.
 *  - dnd-kit drag-and-drop to reorder, persisted via `reorderListingVideos`
 *    server action. Optimistic UI: reorder locally, then save in background;
 *    on failure, revert and surface an inline error.
 *
 * Cover-photo selection is deferred to 4.3c (separate component, will sit
 * alongside this one on the same page).
 */

import { reorderListingVideos, setListingCover } from '@/app/dashboard/listings/[id]/edit/actions';
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
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

export interface ListingVideoRow {
  id: string;
  cf_video_id: string;
  kind: string;
  title: string | null;
  status: string;
  sort_order: number;
}

interface Props {
  listingId: string;
  initialVideos: ListingVideoRow[];
  initialCoverVideoId: string | null;
}

const POLL_INTERVAL_MS = 5000;

export function VideoPanel({ listingId, initialVideos, initialCoverVideoId }: Props) {
  const [videos, setVideos] = useState<ListingVideoRow[]>(initialVideos);
  const [coverVideoId, setCoverVideoId] = useState<string | null>(initialCoverVideoId);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [coverPending, setCoverPending] = useState(false);
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
                return s ? { ...v, status: s.status, title: s.title } : v;
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
        kind: v.kind,
        title: v.title,
        status: 'processing',
        sort_order: nextSort,
      };
      return [...prev, optimistic];
    });
  }, []);

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
      <VideoUploader target={{ scope: 'listing', listingId }} onUploaded={handleUploaded} />

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

      {videos.length === 0 ? (
        <p className="text-sm text-cream/50">No videos yet. Use the uploader above.</p>
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
                  onSetCover={handleSetCover}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function SortableVideoItem({
  video,
  index,
  isCover,
  coverPending,
  onSetCover,
}: {
  video: ListingVideoRow;
  index: number;
  isCover: boolean;
  coverPending: boolean;
  onSetCover: (videoId: string | null) => void;
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
    try {
      thumb = thumbnailUrl(video.cf_video_id);
    } catch {
      thumb = null;
    }
  }

  const canBeCover = video.status === 'ready';

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded border p-3 ${
        isCover ? 'border-gold/60 bg-ink2' : 'border-bronze/30 bg-ink2'
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab select-none px-2 py-1 text-cream/40 hover:text-cream/70 active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        ⋮⋮
      </button>
      <span className="w-6 text-xs text-cream/40">{index + 1}</span>
      <div className="h-12 w-20 flex-shrink-0 overflow-hidden rounded bg-ink">
        {thumb ? (
          // CF Stream thumbnails are external; using next/image needs remotePatterns
          // config and adds no win for a 80×48 dashboard preview. Plain <img> here.
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-cream/40">
            {video.status === 'processing' ? '…' : '—'}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm text-cream">{video.title ?? video.cf_video_id}</span>
          {isCover ? (
            <span className="rounded bg-gold px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink">
              Cover
            </span>
          ) : null}
        </div>
        <div className="text-xs text-cream/50">
          {video.kind} · <StatusText status={video.status} />
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {isCover ? (
          <button
            type="button"
            onClick={() => onSetCover(null)}
            disabled={coverPending}
            className="rounded border border-bronze/40 px-2 py-1 text-xs text-cream/70 hover:border-bronze/60 hover:text-cream disabled:opacity-50"
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
            className="rounded border border-bronze/40 px-2 py-1 text-xs text-cream/70 hover:border-gold hover:text-gold disabled:opacity-30"
          >
            Set as cover
          </button>
        )}
      </div>
    </li>
  );
}

function StatusText({ status }: { status: string }) {
  const color =
    status === 'ready' ? 'text-emerald-400' : status === 'error' ? 'text-red-400' : 'text-gold';
  return <span className={color}>{status}</span>;
}
