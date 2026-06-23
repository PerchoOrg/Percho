'use client';

/**
 * CommunityVideoManageList — Phase 50.9 rewrite (2026-06-23).
 *
 * REPLACES the Phase 35.x rich row (visibility chips, archive/restore/private,
 * uploader byline, group-by-visibility, edit-category sheet) with a flat row
 * matching the listing edit page's VideoPanel UX:
 *
 *   thumbnail · title · category pill · [Set as cover] · [Delete]
 *
 * Why the simplification: agents asked for parity with listing media. The
 * extra controls (visibility/archive) are losses we accept — delete is now
 * the only way to take a video off buyer surfaces. Concerns table approved
 * by qiaoxux ahead of this rewrite.
 *
 * Cover indicator + "Set as cover" wires straight into the existing
 * `setCommunityCoverVideo` server action (cover-actions.ts). When a row is
 * the current cover we show a Cover badge next to the title and the action
 * collapses to a "Clear cover" button. Photo-as-cover lives in
 * CommunityPhotoPanel — same UX, different bucket plumbing.
 *
 * Read-only category pill replaces the edit-category sheet. Category is
 * still set at upload time via the shared CategoryPicker on
 * CommunityMediaPanel; re-categorizing an existing video would need to be
 * re-introduced separately if agents miss it.
 */

import { deleteCommunityVideo } from '@/app/dashboard/communities/actions';
import { setCommunityCoverVideo } from '@/app/dashboard/communities/[id]/cover-actions';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { COMMUNITY_VIDEO_CATEGORIES } from '@/lib/zod/community-video-categories';
import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';

export interface ManageVideoRow {
  id: string;
  cf_video_id: string;
  title: string | null;
  category: string | null;
  category_needs_review: boolean | null;
  status: string;
  visibility: 'public' | 'private' | 'archived';
  created_at: string;
  /** agents.id of the original uploader; null for legacy rows. */
  uploaded_by: string | null;
  uploaderSlug: string | null;
  uploaderDisplayName: string | null;
}

interface Props {
  communityId: string;
  videos: ManageVideoRow[];
  /** Current viewer's agent.id. Drives owner-only set-cover/delete. */
  myAgentId: string | null;
  /** Current cover video id, drives the ⭐/Cover badge + Clear-cover button. */
  coverVideoId: string | null;
}

export function CommunityVideoManageList({
  communityId,
  videos,
  myAgentId,
  coverVideoId,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleSetCover = useCallback(
    (videoId: string) => {
      setError(null);
      setBusyId(videoId);
      startTransition(async () => {
        const r = await setCommunityCoverVideo({ communityId, videoId });
        setBusyId(null);
        if (!r.ok) {
          setError(`Set cover failed: ${r.error}`);
          return;
        }
        router.refresh();
      });
    },
    [communityId, router],
  );

  const handleDelete = useCallback(
    (videoId: string, title: string | null) => {
      const label = title?.trim() || 'this video';
      if (!window.confirm(`Delete ${label}? This can't be undone.`)) return;
      setError(null);
      setBusyId(videoId);
      startTransition(async () => {
        const r = await deleteCommunityVideo(videoId, communityId);
        setBusyId(null);
        if (!r.ok) {
          setError(`Delete failed: ${r.error}`);
          return;
        }
        router.refresh();
      });
    },
    [communityId, router],
  );

  if (videos.length === 0) {
    return (
      <p className="text-sm text-muted">No videos yet. Use the upload button above.</p>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded border border-red-400/40 bg-red-950/30 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <ul className="space-y-2">
        {videos.map((v) => {
          const isOwner =
            myAgentId != null && v.uploaded_by != null && v.uploaded_by === myAgentId;
          const isCover = coverVideoId === v.id;
          return (
            <ManageRow
              key={v.id}
              video={v}
              isOwner={isOwner}
              isCover={isCover}
              busy={pending && busyId === v.id}
              disabled={pending && busyId !== v.id}
              onSetCover={() => handleSetCover(v.id)}
              onDelete={() => handleDelete(v.id, v.title)}
            />
          );
        })}
      </ul>
    </div>
  );
}

function ManageRow({
  video,
  isOwner,
  isCover,
  busy,
  disabled,
  onSetCover,
  onDelete,
}: {
  video: ManageVideoRow;
  isOwner: boolean;
  isCover: boolean;
  busy: boolean;
  disabled: boolean;
  onSetCover: () => void;
  onDelete: () => void;
}) {
  const catMeta = video.category
    ? COMMUNITY_VIDEO_CATEGORIES.find((c) => c.id === video.category)
    : undefined;

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
      className={`flex flex-wrap items-center gap-3 rounded border p-3 ${
        isCover ? 'border-line-strong bg-surface' : 'border-line bg-surface'
      }`}
    >
      <div className="h-12 w-20 flex-shrink-0 overflow-hidden rounded bg-bg">
        {thumb ? (
          // CF Stream thumbnails are external; <img> is fine for an 80×48 preview.
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted">
            {video.status === 'processing' ? '…' : '—'}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 basis-[8rem]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm text-ink">
            {video.title ?? '(untitled)'}
          </span>
          {isCover ? (
            <span className="flex-shrink-0 rounded bg-ink px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cream">
              Cover
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink2">
          <span className="rounded border border-line px-1.5 py-0.5">
            {catMeta?.label ?? video.category ?? 'uncategorized'}
          </span>
          {video.category_needs_review ? (
            <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-yellow-300">
              needs review
            </span>
          ) : null}
          {video.status !== 'ready' ? (
            <span className={video.status === 'error' ? 'text-red-400' : 'text-muted'}>
              {video.status === 'error' ? 'Upload failed' : 'Processing…'}
            </span>
          ) : null}
        </div>
      </div>

      {isOwner ? (
        <div className="flex w-full flex-shrink-0 items-center gap-2 sm:w-auto">
          {isCover ? (
            <span className="whitespace-nowrap rounded border border-line px-2 py-1 text-xs text-muted">
              Current cover
            </span>
          ) : (
            <button
              type="button"
              onClick={onSetCover}
              disabled={!canBeCover || busy || disabled}
              title={
                canBeCover
                  ? 'Use this video as the community cover'
                  : 'Available once processing finishes'
              }
              className="w-full whitespace-nowrap rounded border border-line px-2 py-1 text-xs text-ink2 hover:border-line-strong hover:text-ink disabled:opacity-30 sm:w-auto"
            >
              {busy ? 'Saving…' : 'Set as cover'}
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={busy || disabled}
            title="Remove this video"
            className="whitespace-nowrap rounded border border-line px-2 py-1 text-xs text-red-400 hover:border-red-400/60 hover:text-red-300 disabled:opacity-30"
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      ) : null}
    </li>
  );
}
