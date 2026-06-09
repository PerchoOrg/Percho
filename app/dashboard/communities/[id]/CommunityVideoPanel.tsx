'use client';

/**
 * CommunityVideoPanel — Phase 4.5.
 *
 * Lists community_videos for one community + embeds VideoUploader with the
 * 'community' scope. Before uploading, the agent picks:
 *   - kind: school | poi | neighborhood
 *   - if kind=school: optional school link (one of the community's schools)
 *   - if kind=poi:    optional poi link (one of the community's POIs)
 *   - if kind=neighborhood: no link (footage is just for the community)
 *
 * After upload, polls /api/video/list?community_id=… for status flips
 * (mirrors the listing VideoPanel pattern; no Realtime here for V1 simplicity).
 *
 * No reorder, no cover photo — those are listing-level concerns. Community
 * videos surface on the public listing page later (Phase 5).
 */

import { deleteCommunityVideo } from '@/app/dashboard/communities/actions';
import {
  type CommunityKind,
  type UploadedVideo,
  VideoUploader,
} from '@/components/dashboard/VideoUploader';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { PoiRow, SchoolRow } from './page';

export interface CommunityVideoRow {
  id: string;
  cf_video_id: string;
  kind: string;
  school_id: string | null;
  poi_id: string | null;
  title: string | null;
  status: string;
  created_at: string;
}

const POLL_MS = 5000;

export function CommunityVideoPanel({
  communityId,
  initialVideos,
  schools,
  pois,
}: {
  communityId: string;
  initialVideos: CommunityVideoRow[];
  schools: SchoolRow[];
  pois: PoiRow[];
}) {
  const router = useRouter();
  const [videos, setVideos] = useState<CommunityVideoRow[]>(initialVideos);
  const [kind, setKind] = useState<CommunityKind>('neighborhood');
  const [schoolId, setSchoolId] = useState<string>('');
  const [poiId, setPoiId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Sync if a parent refresh delivers new initial data (e.g. after a delete).
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
      // network blip; next tick will retry
    }
  }, [communityId]);

  // Poll while any video is processing (mirror Phase 2 pattern, simpler — no Realtime).
  useEffect(() => {
    const hasProcessing = videos.some((v) => v.status === 'processing');
    if (!hasProcessing) return;
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [videos, refresh]);

  function handleUploaded(_video: UploadedVideo) {
    // Optimistic refresh from server so we pick up the inserted row + its IDs
    // (the kind/school/poi/etc. fields aren't on UploadedVideo).
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

  const target =
    kind === 'school'
      ? {
          scope: 'community' as const,
          communityId,
          kind: 'school' as const,
          ...(schoolId ? { schoolId } : {}),
        }
      : kind === 'poi'
        ? {
            scope: 'community' as const,
            communityId,
            kind: 'poi' as const,
            ...(poiId ? { poiId } : {}),
          }
        : { scope: 'community' as const, communityId, kind: 'neighborhood' as const };

  return (
    <section className="rounded border border-bronze/30 bg-ink2 p-6">
      <h2 className="mb-4 text-base font-semibold">Community videos ({videos.length})</h2>

      {videos.length > 0 && (
        <ul className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {videos.map((v) => {
            const linked =
              v.school_id != null
                ? (schools.find((s) => s.id === v.school_id)?.name ?? 'school')
                : v.poi_id != null
                  ? (pois.find((p) => p.id === v.poi_id)?.name ?? 'poi')
                  : null;
            return (
              <li key={v.id} className="flex gap-3 rounded border border-bronze/20 p-3 text-sm">
                <div
                  className="h-16 w-28 flex-shrink-0 overflow-hidden rounded bg-ink"
                  style={{
                    backgroundImage: `url(${thumbnailUrl(v.cf_video_id)})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-cream">{v.title ?? '(untitled)'}</div>
                  <div className="text-xs text-cream/50">
                    {v.kind}
                    {linked ? ` · ${linked}` : null}
                    {' · '}
                    <span
                      className={
                        v.status === 'ready'
                          ? 'text-emerald-400'
                          : v.status === 'error'
                            ? 'text-red-400'
                            : 'text-cream/50'
                      }
                    >
                      {v.status}
                    </span>
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
      )}

      <div className="space-y-3 rounded border border-dashed border-bronze/20 p-4">
        <h3 className="text-xs font-medium uppercase tracking-wide text-cream/50">
          Upload a community video
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-cream/70">Kind *</span>
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as CommunityKind);
                setSchoolId('');
                setPoiId('');
              }}
              className="w-full rounded border border-bronze/30 bg-ink px-3 py-2 text-sm text-cream focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
            >
              <option value="neighborhood">neighborhood</option>
              <option value="school">school</option>
              <option value="poi">poi</option>
            </select>
          </label>
          {kind === 'school' && schools.length > 0 && (
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-cream/70">
                Link to school (optional)
              </span>
              <select
                value={schoolId}
                onChange={(e) => setSchoolId(e.target.value)}
                className="w-full rounded border border-bronze/30 bg-ink px-3 py-2 text-sm text-cream focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
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
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-cream/70">
                Link to POI (optional)
              </span>
              <select
                value={poiId}
                onChange={(e) => setPoiId(e.target.value)}
                className="w-full rounded border border-bronze/30 bg-ink px-3 py-2 text-sm text-cream focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
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
        {kind === 'school' && schools.length === 0 && (
          <p className="text-xs text-cream/40">
            No schools yet — add one above to link it to a video.
          </p>
        )}
        {kind === 'poi' && pois.length === 0 && (
          <p className="text-xs text-cream/40">
            No POIs yet — add one above to link it to a video.
          </p>
        )}
        <VideoUploader target={target} onUploaded={handleUploaded} />
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </section>
  );
}
