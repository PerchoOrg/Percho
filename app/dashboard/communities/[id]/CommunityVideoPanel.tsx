'use client';

/**
 * CommunityVideoPanel — Phase 4.5; Phase 22 (2026-06-14) re-categorized;
 * Phase 23 (2026-06-14) trimmed link-to-school / link-to-POI sections and
 * replaced the lat/lng UI with a single human-readable `address` field.
 *
 * Why the cuts (Phase 23): linking a video to a specific school / POI row
 * was rarely used and double-coupled the picker with `kind`. The 12-cat
 * picker already says "this is a school_run" — agents don't need to also
 * pick which school. Geo coords are still captured (silently, via browser
 * geolocation) so the platform-wide Nearby query keeps working, but the
 * UI never shows them.
 */

import { deleteCommunityVideo } from '@/app/dashboard/communities/actions';
import {
  type CommunityKind,
  type UploadedVideo,
  VideoUploader,
} from '@/components/dashboard/VideoUploader';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import {
  COMMUNITY_VIDEO_CATEGORIES,
  type CommunityVideoCategoryId,
  legacyKindForCategory,
} from '@/lib/zod/community-video-categories';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

export interface CommunityVideoRow {
  id: string;
  cf_video_id: string;
  kind: string;
  category?: string | null;
  category_needs_review?: boolean | null;
  school_id: string | null;
  poi_id: string | null;
  title: string | null;
  status: string;
  created_at: string;
}

export interface CommunityOption {
  id: string;
  name: string;
  city: string | null;
  state: string;
}

const POLL_MS = 5000;

export function CommunityVideoPanel({
  communityId,
  initialVideos,
  category,
  // Phase 35.3 (2026-06-17): hidden until we land a geo guardrail. Tianrou
  // (agent UAT) flagged that without a "must be within X miles" check,
  // multi-tagging will get abused by agents pasting their video into
  // unrelated communities for reach. Prop stays in the API so the parent
  // server component doesn't have to change shape; we just stop rendering
  // the picker. Re-enable in the migration that adds the distance check.
  availableCommunities: _availableCommunities,
  prefillVideo,
}: {
  communityId: string;
  initialVideos: CommunityVideoRow[];
  category: CommunityVideoCategoryId;
  availableCommunities: CommunityOption[];
  /** Phase 45.16: file handed off by UploadFAB (one-shot). */
  prefillVideo?: File;
}) {
  const router = useRouter();
  const [videos, setVideos] = useState<CommunityVideoRow[]>(initialVideos);
  const [address, setAddress] = useState<string>('');
  // Phase 23: silent geo. Captured once on mount; never surfaced in the UI.
  // If the user denies geolocation we just don't send lat/lng — the row still
  // saves with `address` (or neither, in which case Nearby just skips it).
  const [lat, setLat] = useState<number | undefined>(undefined);
  const [lng, setLng] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const kind: CommunityKind = legacyKindForCategory(category);

  // Silent geolocation on mount. Browser will prompt once; if the user
  // denies, we proceed without coords — no UI flag, no error toast.
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

  useEffect(() => {
    setVideos(initialVideos);
  }, [initialVideos]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/video/list?community_id=${communityId}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const json = (await res.json()) as { videos: CommunityVideoRow[] };
      setVideos(json.videos);
    } catch {
      // network blip
    }
  }, [communityId]);

  useEffect(() => {
    const hasProcessing = videos.some((v) => v.status === 'processing');
    if (!hasProcessing) return;
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [videos, refresh]);

  function handleUploaded(_video: UploadedVideo) {
    refresh();
  }

  async function handleDelete(videoId: string) {
    if (!confirm('Delete this community video?')) return;
    setError(null);
    const result = await deleteCommunityVideo(videoId, communityId);
    if (result.ok) {
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  const target = {
    scope: 'community' as const,
    communityId,
    kind,
    category,
    ...(typeof lat === 'number' ? { lat } : {}),
    ...(typeof lng === 'number' ? { lng } : {}),
    ...(address.trim() !== '' ? { address: address.trim() } : {}),
  };

  return (
    <section className="rounded border border-line bg-surface p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Upload a video</h2>
        <span className="text-xs text-muted">{videos.length} uploaded</span>
      </div>

      {/* ── Address (Phase 23) ───────────────────────────────────── */}
      <div className="mb-4">
        <label htmlFor="cv-address" className="mb-1 block text-xs font-medium text-ink2">
          Address <span className="text-muted">(optional)</span>
        </label>
        <input
          id="cv-address"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="e.g. Smith Park, 123 Main St — or leave blank to use current location"
          maxLength={200}
          className="w-full rounded border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
        />
        <p className="mt-1 text-[11px] text-muted">
          What's in the video — readable for buyers. If left blank, we use your phone's location
          quietly so this still shows up in Nearby.
        </p>
      </div>

      <VideoUploader target={target} onUploaded={handleUploaded} initialFile={prefillVideo} />
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {/* Phase 35.3: "Also show this video in" multi-community picker
       * removed pending a geo guardrail. See param comment above. */}

      {videos.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer select-none text-xs uppercase tracking-wide text-ink2 hover:text-ink">
            Already uploaded ({videos.length})
          </summary>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {videos.map((v) => {
              const displayCategory = v.category
                ? (COMMUNITY_VIDEO_CATEGORIES.find((c) => c.id === v.category)?.label ?? v.category)
                : v.kind;
              return (
                <li key={v.id} className="flex gap-3 rounded border border-line p-3 text-sm">
                  <div
                    className="h-16 w-28 flex-shrink-0 overflow-hidden rounded bg-bg"
                    style={{
                      backgroundImage: `url(${thumbnailUrl(v.cf_video_id)})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-ink">{v.title ?? '(untitled)'}</div>
                    <div className="text-xs text-muted">
                      {displayCategory}
                      {v.category_needs_review ? (
                        <span className="ml-1 rounded bg-yellow-500/20 px-1 py-0.5 text-[10px] text-yellow-300">
                          needs review
                        </span>
                      ) : null}
                      {v.status !== 'ready' ? (
                        <>
                          {' · '}
                          <span
                            className={
                              v.status === 'error' ? 'text-red-400' : 'text-muted'
                            }
                          >
                            {v.status === 'error' ? 'Upload failed' : 'Processing…'}
                          </span>
                        </>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(v.id)}
                      className="mt-2 text-xs text-red-400 hover:underline"
                    >
                      delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
