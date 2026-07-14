'use client';

/**
 * NearbyPoiPanel — Nearby POI section inside the Media tab.
 *
 * Phase 76 (2026-07-14). Companion to `MediaPanel`. Mounted below the Videos +
 * Photos sub-sections on the listing edit page.
 *
 * Flow (v0):
 *   1. Agent clicks "Discover POIs" → server discovers ≤120 places via
 *      Google Places, upserts globals, registers per-listing rows.
 *   2. Server returns bucket counts + a fresh snapshot. Panel renders POIs
 *      grouped by intent bucket (walkable / daily drive / lifestyle).
 *   3. Per POI, agent can:
 *        • Approve / reject the POI (registers a review_event)
 *        • Fetch photos (≤10 via Google Places Photo API)
 *        • Per photo: approve / reject
 *
 * All state mutations flow through server actions in `lib/poi/actions.ts`
 * which revalidate this page's path, so we `useTransition` + refetch after
 * each successful call.
 *
 * Types stay lightweight — the server action's return type flows through.
 */

import { Loader2, MapPinned, ImagePlus, Check, X } from 'lucide-react';
import Image from 'next/image';
import { useState, useTransition } from 'react';
import {
  discoverPoisForListing,
  fetchPhotosForPoi,
  loadNearbyPoisForListing,
  setListingPhotoStatus,
  setListingPoiStatus,
  type NearbyPoiForListing,
} from '@/lib/poi/actions';
import type { IntentBucket } from '@/lib/poi/types';

const BUCKET_LABELS: Record<IntentBucket, string> = {
  walkable: 'Walkable (≤0.5 mi)',
  daily_drive: 'Daily drive (≤2 mi)',
  lifestyle: 'Lifestyle (≤5 mi)',
  commute: 'Commute',
};

const BUCKET_ORDER: IntentBucket[] = ['walkable', 'daily_drive', 'lifestyle', 'commute'];

interface Props {
  listingId: string;
  initialPois: NearbyPoiForListing[];
  /** Public Supabase storage host, so we can render photos by storage_path. */
  supabaseStorageBase: string;
  /** Bucket name where poi photos live (default: "photos"). */
  photoBucket?: string;
}

export function NearbyPoiPanel({
  listingId,
  initialPois,
  supabaseStorageBase,
  photoBucket = 'photos',
}: Props) {
  const [pois, setPois] = useState<NearbyPoiForListing[]>(initialPois);
  const [pending, startTransition] = useTransition();
  const [busyPoi, setBusyPoi] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ── grouping ────────────────────────────────────────────────────────────
  const grouped: Record<IntentBucket, NearbyPoiForListing[]> = {
    walkable: [],
    daily_drive: [],
    lifestyle: [],
    commute: [],
  };
  for (const p of pois) grouped[p.intent_bucket].push(p);

  // ── actions ─────────────────────────────────────────────────────────────
  const refresh = async () => {
    const fresh = await loadNearbyPoisForListing(listingId);
    setPois(fresh);
  };

  const handleDiscover = () => {
    setNotice(null);
    startTransition(async () => {
      try {
        const r = await discoverPoisForListing(listingId);
        setNotice(
          `Discovered ${r.discovered} new POIs (${r.reused} already known). ` +
            `Walkable ${r.buckets.walkable} · Daily ${r.buckets.daily_drive} · ` +
            `Lifestyle ${r.buckets.lifestyle}.`,
        );
        await refresh();
      } catch (err) {
        setNotice(`Discovery failed: ${(err as Error).message}`);
      }
    });
  };

  const handleFetchPhotos = (poiId: string) => {
    setBusyPoi(poiId);
    setNotice(null);
    startTransition(async () => {
      try {
        const r = await fetchPhotosForPoi(listingId, poiId);
        setNotice(`Photos: +${r.fetched} new, ${r.reused} reused, ${r.skipped} skipped.`);
        await refresh();
      } catch (err) {
        setNotice(`Photo fetch failed: ${(err as Error).message}`);
      } finally {
        setBusyPoi(null);
      }
    });
  };

  const handlePoiDecision = (poiId: string, approved: boolean) => {
    startTransition(async () => {
      try {
        await setListingPoiStatus(listingId, poiId, approved ? 'approved' : 'rejected');
        await refresh();
      } catch (err) {
        setNotice(`Decision failed: ${(err as Error).message}`);
      }
    });
  };

  const handlePhotoDecision = (poiPhotoId: string, approved: boolean) => {
    startTransition(async () => {
      try {
        await setListingPhotoStatus(listingId, poiPhotoId, approved ? 'approved' : 'rejected');
        await refresh();
      } catch (err) {
        setNotice(`Photo decision failed: ${(err as Error).message}`);
      }
    });
  };

  // ── render ──────────────────────────────────────────────────────────────
  const totalPois = pois.length;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink2">
            Nearby POIs ({totalPois})
          </h3>
          <p className="text-xs text-muted">
            Auto-discovered points of interest within 5 miles. Approve the ones you'd want a
            buyer to see in the neighborhood story.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDiscover}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md border border-line bg-bg px-3 py-1.5 text-ink2 text-xs hover:border-bronze hover:text-ink disabled:opacity-50"
        >
          {pending ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            <MapPinned size={14} aria-hidden />
          )}
          {totalPois === 0 ? 'Discover POIs' : 'Refresh'}
        </button>
      </div>

      {notice ? (
        <p className="mb-3 rounded border border-line bg-bg px-3 py-2 text-xs text-ink2">
          {notice}
        </p>
      ) : null}

      {totalPois === 0 ? (
        <p className="text-xs text-muted italic">
          Click "Discover POIs" to search Google Places for nearby restaurants, parks,
          schools, grocery stores, cafes, and gyms.
        </p>
      ) : (
        <div className="space-y-4">
          {BUCKET_ORDER.map((bucket) => {
            const rows = grouped[bucket];
            if (rows.length === 0) return null;
            return (
              <section key={bucket}>
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                  {BUCKET_LABELS[bucket]} · {rows.length}
                </h4>
                <ul className="space-y-2">
                  {rows.map((row) => (
                    <PoiRow
                      key={row.poi_id}
                      row={row}
                      busy={busyPoi === row.poi_id || pending}
                      onFetchPhotos={() => handleFetchPhotos(row.poi_id)}
                      onDecide={(approved) => handlePoiDecision(row.poi_id, approved)}
                      onPhotoDecide={handlePhotoDecision}
                      storageBase={supabaseStorageBase}
                      bucket={photoBucket}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── single POI row ──────────────────────────────────────────────────────

function PoiRow({
  row,
  busy,
  onFetchPhotos,
  onDecide,
  onPhotoDecide,
  storageBase,
  bucket,
}: {
  row: NearbyPoiForListing;
  busy: boolean;
  onFetchPhotos: () => void;
  onDecide: (approved: boolean) => void;
  onPhotoDecide: (poiPhotoId: string, approved: boolean) => void;
  storageBase: string;
  bucket: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const photoCount = row.photos?.length ?? 0;
  const approvedPhotos = row.photos?.filter((p) => p.status === 'approved').length ?? 0;

  const distanceLabel =
    row.distance_m != null ? `${(row.distance_m / 1609).toFixed(1)} mi` : '—';

  return (
    <li className="rounded-lg border border-line bg-bg p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-medium text-ink">
              {row.pois.display_name}
            </span>
            <span className="text-xs text-muted">
              {row.pois.primary_type ?? '—'} · {distanceLabel}
              {row.pois.rating != null
                ? ` · ★${row.pois.rating.toFixed(1)} (${row.pois.user_ratings_total ?? 0})`
                : ''}
            </span>
          </div>
          {row.pois.formatted_address ? (
            <p className="mt-0.5 truncate text-xs text-muted">
              {row.pois.formatted_address}
            </p>
          ) : null}
          <div className="mt-1 flex items-center gap-2 text-xs text-muted">
            <span
              className={
                row.status === 'approved'
                  ? 'text-green-400'
                  : row.status === 'rejected'
                    ? 'text-red-400'
                    : 'text-muted'
              }
            >
              {row.status}
            </span>
            {photoCount > 0 ? (
              <button
                type="button"
                className="text-bronze hover:underline"
                onClick={() => setExpanded((e) => !e)}
              >
                {expanded ? 'Hide' : 'Show'} {photoCount} photo
                {photoCount === 1 ? '' : 's'}
                {approvedPhotos > 0 ? ` (${approvedPhotos} ✓)` : ''}
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Approve POI"
            onClick={() => onDecide(true)}
            disabled={busy}
            className="rounded p-1 text-muted hover:bg-surface hover:text-green-400 disabled:opacity-40"
          >
            <Check size={16} />
          </button>
          <button
            type="button"
            aria-label="Reject POI"
            onClick={() => onDecide(false)}
            disabled={busy}
            className="rounded p-1 text-muted hover:bg-surface hover:text-red-400 disabled:opacity-40"
          >
            <X size={16} />
          </button>
          <button
            type="button"
            aria-label="Fetch photos"
            onClick={onFetchPhotos}
            disabled={busy}
            className="rounded p-1 text-muted hover:bg-surface hover:text-bronze disabled:opacity-40"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
          </button>
        </div>
      </div>

      {expanded && photoCount > 0 ? (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {row.photos.map((p) => (
            <PhotoTile
              key={p.poi_photo_id}
              storageBase={storageBase}
              bucket={bucket}
              path={p.poi_photos.storage_path}
              attribution={p.poi_photos.attribution}
              status={p.status}
              onDecide={(approved) => onPhotoDecide(p.poi_photo_id, approved)}
              busy={busy}
            />
          ))}
        </div>
      ) : null}
    </li>
  );
}

// ─── single photo tile (approve/reject) ──────────────────────────────────

function PhotoTile({
  storageBase,
  bucket,
  path,
  attribution,
  status,
  onDecide,
  busy,
}: {
  storageBase: string;
  bucket: string;
  path: string;
  attribution: Record<string, unknown> | null;
  status: 'pending' | 'approved' | 'rejected';
  onDecide: (approved: boolean) => void;
  busy: boolean;
}) {
  const url = `${storageBase}/storage/v1/object/public/${bucket}/${path}`;
  const author =
    (attribution as { authorAttributions?: Array<{ displayName?: string }> })
      ?.authorAttributions?.[0]?.displayName ?? '';

  const ring =
    status === 'approved'
      ? 'ring-2 ring-green-400'
      : status === 'rejected'
        ? 'opacity-40 ring-2 ring-red-400'
        : 'ring-1 ring-line';

  return (
    <div className={`group relative overflow-hidden rounded ${ring}`}>
      <div className="relative aspect-square">
        <Image
          src={url}
          alt={author ? `Photo by ${author}` : 'POI photo'}
          fill
          sizes="120px"
          className="object-cover"
          unoptimized
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/60 px-1 py-0.5 opacity-0 group-hover:opacity-100">
        <button
          type="button"
          aria-label="Approve photo"
          onClick={() => onDecide(true)}
          disabled={busy}
          className="text-green-300 hover:text-green-100 disabled:opacity-40"
        >
          <Check size={14} />
        </button>
        <span className="truncate text-[9px] text-white/70">{author}</span>
        <button
          type="button"
          aria-label="Reject photo"
          onClick={() => onDecide(false)}
          disabled={busy}
          className="text-red-300 hover:text-red-100 disabled:opacity-40"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
