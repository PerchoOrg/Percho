'use client';

/**
 * CommunityVideoManageList — Phase 35.2 (2026-06-17).
 *
 * Inline manage of an existing community's videos directly on the editor
 * page (was previously: tap "Manage" → bounce to /upload, which is a
 * create surface, not a manage surface — unfair to agents who already have
 * 30 videos and want to hide one).
 *
 * Each row exposes:
 *   - thumbnail + title + current category + visibility chip
 *   - edit category   → expands a flat <CategoryPicker mode="edit"> sheet
 *   - mark private    → set visibility='private' (hidden from buyers)
 *   - archive         → set visibility='archived' (also hidden, dashboard parks them)
 *   - restore         → set visibility='public'
 *   - delete          → permanent (current behaviour)
 *
 * Buyers only ever see public videos (RLS in 0026). The dashboard list shows
 * everything so the agent can see what's hidden and unhide it.
 *
 * Why no virtual scroll: a single community averages <30 videos in V1.
 * If we hit performance issues we fold to a "show 20, load more" pager.
 */

import {
  deleteCommunityVideo,
  updateCommunityVideoCategory,
  updateCommunityVideoVisibility,
  type CommunityVideoVisibility,
} from '@/app/dashboard/communities/actions';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import {
  COMMUNITY_VIDEO_CATEGORIES,
  type CommunityVideoCategoryId,
} from '@/lib/zod/community-video-categories';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CategoryPicker } from './CategoryPicker';

export interface ManageVideoRow {
  id: string;
  cf_video_id: string;
  title: string | null;
  category: string | null;
  category_needs_review: boolean | null;
  status: string;
  visibility: 'public' | 'private' | 'archived';
  created_at: string;
}

export function CommunityVideoManageList({
  communityId,
  videos,
}: {
  communityId: string;
  videos: ManageVideoRow[];
}) {
  if (videos.length === 0) {
    return (
      <p className="text-xs text-cream/50">
        No videos yet. Tap <span className="text-cream/80">+ Upload</span> to add one.
      </p>
    );
  }

  // Group by visibility so the working set (public) is on top, then private,
  // then archived parked at the bottom — agents can collapse archived once
  // they've stopped caring about a video without losing the file.
  const groups: Record<CommunityVideoVisibility, ManageVideoRow[]> = {
    public: [],
    private: [],
    archived: [],
  };
  for (const v of videos) groups[v.visibility].push(v);

  return (
    <div className="space-y-5">
      <Group
        label="Live"
        sublabel="Visible to buyers"
        items={groups.public}
        communityId={communityId}
      />
      {groups.private.length > 0 ? (
        <Group
          label="Private"
          sublabel="Hidden from buyers, kept in your dashboard"
          items={groups.private}
          communityId={communityId}
        />
      ) : null}
      {groups.archived.length > 0 ? (
        <Group
          label="Archived"
          sublabel="Parked — out of sight, not deleted"
          items={groups.archived}
          communityId={communityId}
          collapsible
        />
      ) : null}
    </div>
  );
}

function Group({
  label,
  sublabel,
  items,
  communityId,
  collapsible,
}: {
  label: string;
  sublabel: string;
  items: ManageVideoRow[];
  communityId: string;
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(!collapsible);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-cream/70">
            {label} <span className="ml-1 text-cream/40">({items.length})</span>
          </div>
          <div className="text-[11px] text-cream/45">{sublabel}</div>
        </div>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="h-9 px-2 text-xs text-cream/60 hover:text-cream"
          >
            {open ? 'hide' : 'show'}
          </button>
        ) : null}
      </div>
      {open ? (
        <ul className="space-y-2">
          {items.map((v) => (
            <ManageRow key={v.id} video={v} communityId={communityId} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ManageRow({ video, communityId }: { video: ManageVideoRow; communityId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingCat, setEditingCat] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catMeta = video.category
    ? COMMUNITY_VIDEO_CATEGORIES.find((c) => c.id === video.category)
    : undefined;

  function run<T>(fn: () => Promise<{ ok: true } | { ok: true; data: T } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function handleVisibility(next: CommunityVideoVisibility) {
    run(() => updateCommunityVideoVisibility(video.id, communityId, next));
  }

  function handleCategoryPick(id: CommunityVideoCategoryId) {
    setEditingCat(false);
    run(() => updateCommunityVideoCategory(video.id, communityId, id));
  }

  function handleDelete() {
    if (!confirm('Delete this community video? This cannot be undone.')) return;
    run(() => deleteCommunityVideo(video.id, communityId));
  }

  return (
    <li className="rounded border border-bronze/25 bg-ink2 p-3">
      <div className="flex gap-3">
        <div
          className="h-16 w-24 shrink-0 overflow-hidden rounded bg-ink"
          style={{
            backgroundImage: `url(${thumbnailUrl(video.cf_video_id)})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-cream">
            {video.title ?? '(untitled)'}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-cream/55">
            <span className="rounded border border-bronze/30 px-1.5 py-0.5">
              {catMeta?.label ?? video.category ?? 'uncategorized'}
            </span>
            {video.category_needs_review ? (
              <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-yellow-300">
                needs review
              </span>
            ) : null}
            <VisibilityChip visibility={video.visibility} />
            <span
              className={
                video.status === 'ready'
                  ? 'text-emerald-400'
                  : video.status === 'error'
                    ? 'text-red-400'
                    : 'text-cream/45'
              }
            >
              {video.status}
            </span>
          </div>
        </div>
      </div>

      {/* actions row — wraps on narrow screens */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <ActionButton onClick={() => setEditingCat((s) => !s)} disabled={pending}>
          {editingCat ? 'cancel' : 'edit category'}
        </ActionButton>
        {video.visibility === 'public' ? (
          <>
            <ActionButton onClick={() => handleVisibility('private')} disabled={pending}>
              mark private
            </ActionButton>
            <ActionButton onClick={() => handleVisibility('archived')} disabled={pending}>
              archive
            </ActionButton>
          </>
        ) : (
          <ActionButton onClick={() => handleVisibility('public')} disabled={pending}>
            make public
          </ActionButton>
        )}
        {video.visibility === 'private' ? (
          <ActionButton onClick={() => handleVisibility('archived')} disabled={pending}>
            archive
          </ActionButton>
        ) : null}
        <ActionButton onClick={handleDelete} disabled={pending} tone="danger">
          delete
        </ActionButton>
      </div>

      {editingCat ? (
        <div className="mt-3 rounded border border-bronze/25 bg-ink p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-cream/55">
            Re-categorize
          </div>
          <CategoryPicker
            mode="edit"
            selected={(video.category as CommunityVideoCategoryId) ?? 'walk_the_block'}
            onPick={handleCategoryPick}
            disabled={pending}
          />
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
    </li>
  );
}

function VisibilityChip({ visibility }: { visibility: CommunityVideoVisibility }) {
  if (visibility === 'public') {
    return (
      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300">live</span>
    );
  }
  if (visibility === 'private') {
    return (
      <span className="rounded bg-cream/10 px-1.5 py-0.5 text-cream/70">private</span>
    );
  }
  return (
    <span className="rounded bg-bronze/30 px-1.5 py-0.5 text-cream/60">archived</span>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'min-h-9 rounded border px-2.5 py-1 text-[11px] transition disabled:opacity-50',
        tone === 'danger'
          ? 'border-red-500/40 text-red-300 hover:border-red-400 hover:bg-red-500/10'
          : 'border-bronze/40 text-cream/80 hover:border-gold/60 hover:text-cream',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
