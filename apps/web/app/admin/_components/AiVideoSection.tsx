'use client';

/**
 * AiVideoSection — "Generate AI Video" panel above the Community Tour photo
 * table (owner 2026-08-15: 每一个照片设置一个按钮选择用来生产 AI 视频，所有选择
 * 的照片会被生出视频).
 *
 * Owns the photo selection because the picker (a checkbox per row, inside
 * PhotoTable) and the consumer (this panel, above it) are different subtrees.
 *
 * One selected photo = one clip: Seedance takes a single `first_frame`
 * reference image per job, so a 5-photo selection submits 5 jobs and you get 5
 * clips back — not one stitched video. Stitching is the ffmpeg render worker's
 * job and isn't wired to these clips yet.
 *
 * Generation takes minutes, so the GET this component polls is also what
 * advances the queue (see the route's header comment).
 */

import {
  AI_VIDEO_DURATIONS,
  type AiTourVideoRow,
  type AiVideoDuration,
  MAX_PHOTOS_PER_BATCH,
  defaultTourPrompt,
} from '@/lib/poi/ai-tour-video';
import { Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PhotoRow } from './PhotoTable';

const POLL_MS = 10_000;

export function AiVideoSection({
  communityId,
  communityName,
  city,
  state,
  storageBase,
  bucket,
  photos,
  selected,
  onClearSelection,
}: {
  communityId: string;
  communityName: string;
  city: string | null;
  state: string | null;
  storageBase: string;
  bucket: string;
  photos: PhotoRow[];
  /** Selection count only — the checkboxes live in the big table below the
   *  8-step pipeline. Owner 2026-08-16: page order is video → 8 steps →
   *  big table → collapsible extras. */
  selected: ReadonlySet<string>;
  onClearSelection: () => void;
}) {
  const [prompt, setPrompt] = useState(() =>
    defaultTourPrompt({ name: communityName, city, state }),
  );
  const [durationS, setDurationS] = useState<AiVideoDuration>(8);
  const [videos, setVideos] = useState<AiTourVideoRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const endpoint = `/api/admin/community-tour/${communityId}/ai-video`;
  const live = videos.some((v) => v.status !== 'ready' && v.status !== 'failed');

  const load = useCallback(async () => {
    // A pump can take a few seconds; never stack two of them.
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(endpoint);
      if (!res.ok) return;
      const body = (await res.json()) as { videos: AiTourVideoRow[] };
      setVideos(body.videos);
    } catch {
      /* transient — the next tick retries */
    } finally {
      inFlight.current = false;
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
    if (!live) return;
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load, live]);

  const count = selected.size;
  const tooMany = count > MAX_PHOTOS_PER_BATCH;

  async function generate() {
    if (count === 0 || tooMany || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoIds: [...selected], prompt, durationS }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        setError(body.message ?? body.error ?? `HTTP ${res.status}`);
        return;
      }
      onClearSelection();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network error');
    } finally {
      setSubmitting(false);
    }
  }

  const thumb = (photoId: string) => {
    const p = photos.find((x) => x.id === photoId);
    if (!p) return null;
    const path =
      p.enhanced_status === 'approved' && p.enhanced_path ? p.enhanced_path : p.storage_path;
    return `${storageBase}/storage/v1/object/public/${bucket}/${path}`;
  };

  const clipThumbs = (photoIds: string[]) => {
    const found = photoIds.map(thumb).filter((u): u is string => u !== null);
    return found;
  };

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-1.5 text-lg font-semibold">
              <Sparkles size={16} aria-hidden />
              Generate AI Video
            </h2>
            <p className="text-ink2 text-xs">
              Tick photos in the table below. All selected photos are woven into ONE AI video
              (Seedance accepts up to {MAX_PHOTOS_PER_BATCH} reference photos per clip).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-2 text-ink2">
              <span>Length</span>
              <select
                value={durationS}
                onChange={(e) => setDurationS(Number(e.target.value) as AiVideoDuration)}
                className="rounded-md border border-line bg-bg px-2 py-1 text-ink"
              >
                {AI_VIDEO_DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}s
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={count === 0 || tooMany || submitting}
              title={`Generate one ${durationS}s AI video from ${count} selected photo${count === 1 ? '' : 's'} (~2-5 min).`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink hover:border-bronze disabled:cursor-not-allowed disabled:text-muted"
            >
              <Sparkles size={14} aria-hidden />
              {submitting ? 'Queueing…' : `Generate ${count || ''}`}
            </button>
          </div>
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          aria-label="AI video prompt"
          className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink"
        />

        {tooMany && (
          <p className="text-xs text-red-600">
            {count} photos selected — the cap is {MAX_PHOTOS_PER_BATCH} per run.
          </p>
        )}
        {error && (
          <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-700">{error}</div>
        )}

        {videos.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {videos
              .filter((v) => v.status !== 'failed')
              .map((v) => (
                <ClipCard key={v.id} video={v} thumbs={clipThumbs(v.photo_ids)} />
              ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ClipCard({ video, thumbs }: { video: AiTourVideoRow; thumbs: string[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-bg">
      {video.status === 'ready' && video.video_url ? (
        <video src={video.video_url} controls playsInline className="aspect-[9/16] w-full bg-black">
          <track kind="captions" />
        </video>
      ) : (
        <div className="relative flex aspect-[9/16] w-full items-center justify-center bg-black">
          {thumbs.length > 0 && (
            <div className="absolute inset-0 grid grid-cols-2 gap-px opacity-30">
              {thumbs.slice(0, 4).map((u) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={u} src={u} alt="" className="h-full w-full object-cover" />
              ))}
            </div>
          )}
          <span
            className={`relative text-[11px] ${
              video.status === 'failed' ? 'text-red-400' : 'text-white/80'
            }`}
          >
            {video.status === 'failed' ? 'failed' : `${video.status}…`}
          </span>
        </div>
      )}
      <div className="space-y-0.5 px-2 py-1.5">
        <div className="text-[10px] text-ink2">
          {video.duration_s}s · {thumbs.length} photo{thumbs.length === 1 ? '' : 's'} ·{' '}
          {new Date(video.created_at).toLocaleString()}
          {video.status === 'ready' && video.cost_usd != null && (
            <span className="text-ink3"> · ${video.cost_usd.toFixed(2)}</span>
          )}
        </div>
        {video.error && (
          <div className="text-[10px] text-red-600" title={video.error}>
            {video.error.length > 60 ? `${video.error.slice(0, 60)}…` : video.error}
          </div>
        )}
      </div>
    </div>
  );
}
