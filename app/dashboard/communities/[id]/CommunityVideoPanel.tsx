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
  // Phase 11 (2026-06-12) — geo for platform-wide nearby. Stored as strings
  // for input control; converted to numbers when building target.
  const [lat, setLat] = useState<string>('');
  const [lng, setLng] = useState<string>('');
  const [geoError, setGeoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function useMyLocation() {
    setGeoError(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError('Geolocation not available in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
      },
      (err) => {
        setGeoError(err.message || 'Could not read location.');
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

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

  const latNum = lat.trim() === '' ? undefined : Number(lat);
  const lngNum = lng.trim() === '' ? undefined : Number(lng);
  const geoOk =
    (latNum === undefined && lngNum === undefined) ||
    (typeof latNum === 'number' &&
      Number.isFinite(latNum) &&
      latNum >= -90 &&
      latNum <= 90 &&
      typeof lngNum === 'number' &&
      Number.isFinite(lngNum) &&
      lngNum >= -180 &&
      lngNum <= 180);

  const target =
    kind === 'school'
      ? {
          scope: 'community' as const,
          communityId,
          kind: 'school' as const,
          ...(schoolId ? { schoolId } : {}),
          ...(geoOk && latNum !== undefined ? { lat: latNum } : {}),
          ...(geoOk && lngNum !== undefined ? { lng: lngNum } : {}),
        }
      : kind === 'poi'
        ? {
            scope: 'community' as const,
            communityId,
            kind: 'poi' as const,
            ...(poiId ? { poiId } : {}),
            ...(geoOk && latNum !== undefined ? { lat: latNum } : {}),
            ...(geoOk && lngNum !== undefined ? { lng: lngNum } : {}),
          }
        : {
            scope: 'community' as const,
            communityId,
            kind: 'neighborhood' as const,
            ...(geoOk && latNum !== undefined ? { lat: latNum } : {}),
            ...(geoOk && lngNum !== undefined ? { lng: lngNum } : {}),
          };

  return (
    <section className="rounded border border-bronze/30 bg-ink2 p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Upload a video</h2>
        <span className="text-xs text-cream/50">{videos.length} uploaded</span>
      </div>

      {/* Primary action — keep above the fold. Defaults are sane
          (kind=neighborhood, no link, no geo) so the agent can just drop a
          file and ship; everything else is tucked into <details> below. */}
      <VideoUploader target={target} onUploaded={handleUploaded} />
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <details className="mt-4 rounded border border-bronze/20 bg-ink/50 px-3 py-2 text-sm">
        <summary className="cursor-pointer select-none text-xs uppercase tracking-wide text-cream/60 hover:text-cream">
          Categorize this video (optional)
        </summary>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-cream/70">Kind</span>
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
            <label className="block">
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
            <label className="block">
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
          {kind === 'school' && schools.length === 0 && (
            <p className="text-xs text-cream/40">
              No schools yet — add one in the editor to link it to a video.
            </p>
          )}
          {kind === 'poi' && pois.length === 0 && (
            <p className="text-xs text-cream/40">
              No POIs yet — add one in the editor to link it to a video.
            </p>
          )}
        </div>
      </details>

      <details className="mt-3 rounded border border-bronze/20 bg-ink/50 px-3 py-2 text-sm">
        <summary className="cursor-pointer select-none text-xs uppercase tracking-wide text-cream/60 hover:text-cream">
          Add location (enables Nearby)
        </summary>
        <div className="mt-3">
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={useMyLocation}
              className="rounded border border-bronze/30 px-2 py-1 text-[11px] text-cream/70 hover:border-gold hover:text-cream"
            >
              Use my current location
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] text-cream/50">Latitude</span>
              <input
                type="text"
                inputMode="decimal"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="e.g. 33.838"
                className="w-full rounded border border-bronze/30 bg-ink px-2 py-1 text-sm text-cream focus:border-gold focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-cream/50">Longitude</span>
              <input
                type="text"
                inputMode="decimal"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="e.g. -84.378"
                className="w-full rounded border border-bronze/30 bg-ink px-2 py-1 text-sm text-cream focus:border-gold focus:outline-none"
              />
            </label>
          </div>
          {!geoOk && (
            <p className="mt-2 text-[11px] text-red-400">
              Lat must be -90..90 and lng -180..180, or both empty.
            </p>
          )}
          {geoError && <p className="mt-2 text-[11px] text-red-400">{geoError}</p>}
        </div>
      </details>

      {videos.length > 0 && (
        <details className="mt-4" open>
          <summary className="cursor-pointer select-none text-xs uppercase tracking-wide text-cream/60 hover:text-cream">
            Already uploaded ({videos.length})
          </summary>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        </details>
      )}
    </section>
  );
}
