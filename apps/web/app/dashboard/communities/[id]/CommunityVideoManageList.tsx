'use client';

/**
 * CommunityVideoManageList — Phase 50.10 (2026-06-23).
 *
 * Flat row matching listing edit MediaPanel UX, plus community-specific
 * category pill and an inline editable description:
 *
 *   thumbnail · title · category pill · [Set as cover] · [Delete]
 *   description (click to edit, Enter / blur to save, Esc to cancel)
 *
 * Phase 50.10 changes vs 50.9:
 *   - REMOVED the yellow "needs review" pill (the flag still exists on the
 *     row for analytics, just not surfaced in the manage UI — agents can't
 *     act on it without the edit-category sheet anyway).
 *   - ADDED inline description editor: stored on `community_videos.description`
 *     (added in migration 0040). Empty = "Add a description" placeholder
 *     button. Clicking enters edit mode (textarea); Enter saves, Shift+Enter
 *     newlines, Esc cancels, blur saves. 280-char cap matches server action.
 *
 * Cover indicator + "Set as cover" wires straight into the existing
 * `setCommunityCoverVideo` server action (cover-actions.ts). When a row is
 * the current cover we show a Cover badge next to the title and the action
 * collapses to a "Current cover" label.
 *
 * Read-only category pill replaces the edit-category sheet. Category is
 * still set at upload time via the shared CategoryPicker on
 * CommunityMediaPanel; re-categorizing an existing video would need to be
 * re-introduced separately if agents miss it.
 */

import {
  deleteCommunityVideo,
  updateCommunityVideoDescription,
} from '@/app/dashboard/communities/actions';
import { setCommunityCoverVideo } from '@/app/dashboard/communities/[id]/cover-actions';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { COMMUNITY_VIDEO_CATEGORIES } from '@/lib/zod/community-video-categories';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

const DESCRIPTION_MAX = 280;

export interface ManageVideoRow {
  id: string;
  cf_video_id: string;
  title: string | null;
  description: string | null;
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
              communityId={communityId}
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
  communityId,
  isOwner,
  isCover,
  busy,
  disabled,
  onSetCover,
  onDelete,
}: {
  video: ManageVideoRow;
  communityId: string;
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
      className={`flex flex-wrap items-start gap-3 rounded border p-3 ${
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
          {video.status !== 'ready' ? (
            <span className={video.status === 'error' ? 'text-red-400' : 'text-muted'}>
              {video.status === 'error' ? 'Upload failed' : 'Processing…'}
            </span>
          ) : null}
        </div>

        {/* Inline description editor — owners only. Non-owners see read-only
            text if a description exists, otherwise nothing. */}
        <DescriptionEditor
          videoId={video.id}
          communityId={communityId}
          initial={video.description}
          editable={isOwner}
        />
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
                  ? 'Use this video as the neighborhood cover'
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

/**
 * Inline description editor.
 *
 * Three states:
 *   - VIEW (has text):     <p>{text}</p>  — owner click → EDIT
 *   - VIEW (empty, owner): <button>+ Add a description</button> → EDIT
 *   - VIEW (empty, !owner): renders nothing
 *   - EDIT:                <textarea> autoFocused, Enter saves, Shift+Enter
 *                          newline, Esc cancels, blur saves.
 *
 * Saves through the `updateCommunityVideoDescription` server action and
 * locally optimistic-updates so the row doesn't flicker between save and
 * revalidatePath. On error we revert + surface the error to the row.
 */
function DescriptionEditor({
  videoId,
  communityId,
  initial,
  editable,
}: {
  videoId: string;
  communityId: string;
  initial: string | null;
  editable: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState<string>(initial ?? '');
  const [draft, setDraft] = useState<string>(initial ?? '');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // If the server-rendered prop changes (e.g. after router.refresh from a
  // sibling action), keep `value` in sync so we don't strand a stale view.
  useEffect(() => {
    setValue(initial ?? '');
    if (!editing) setDraft(initial ?? '');
  }, [initial, editing]);

  const enterEdit = () => {
    if (!editable) return;
    setDraft(value);
    setErr(null);
    setEditing(true);
    // Defer focus until after render.
    setTimeout(() => taRef.current?.focus(), 0);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(value);
    setErr(null);
  };

  const save = async () => {
    const next = draft.trim();
    if (next === (value ?? '').trim()) {
      setEditing(false);
      return;
    }
    if (next.length > DESCRIPTION_MAX) {
      setErr(`Description too long (${next.length}/${DESCRIPTION_MAX}).`);
      return;
    }
    setSaving(true);
    const r = await updateCommunityVideoDescription(videoId, communityId, next);
    setSaving(false);
    if (!r.ok) {
      setErr(`Save failed: ${r.error}`);
      return;
    }
    // Optimistic update locally; router.refresh will re-sync from server.
    setValue(next);
    setEditing(false);
    router.refresh();
  };

  if (editing) {
    return (
      <div className="mt-1.5">
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (err) setErr(null);
          }}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void save();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          rows={2}
          maxLength={DESCRIPTION_MAX}
          placeholder="Describe this video — when, where, what's in frame…"
          disabled={saving}
          className="w-full rounded border border-line bg-bg px-2 py-1.5 text-sm text-ink placeholder:text-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong disabled:opacity-50"
        />
        <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
          <span>{saving ? 'Saving…' : 'Enter to save · Esc to cancel'}</span>
          <span>
            {draft.length}/{DESCRIPTION_MAX}
          </span>
        </div>
        {err ? <p className="mt-1 text-[11px] text-red-300">{err}</p> : null}
      </div>
    );
  }

  if (value.length > 0) {
    // VIEW (has text). Owners get a click-to-edit affordance; non-owners
    // just see the text.
    return editable ? (
      <button
        type="button"
        onClick={enterEdit}
        title="Click to edit description"
        className="mt-1.5 block w-full whitespace-pre-wrap text-left text-sm text-ink2 hover:text-ink"
      >
        {value}
      </button>
    ) : (
      <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink2">{value}</p>
    );
  }

  if (!editable) return null;

  // VIEW (empty, owner) — placeholder button.
  return (
    <button
      type="button"
      onClick={enterEdit}
      className="mt-1.5 inline-flex items-center text-[11px] text-muted hover:text-ink2"
    >
      + Add a description
    </button>
  );
}
