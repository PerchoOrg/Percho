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

import { Loader2, MapPinned, ImagePlus, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useState, useTransition } from 'react';
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
  /** Bucket name where poi photos live (default: "listing-photos"). */
  photoBucket?: string;
}

export function NearbyPoiPanel({
  listingId,
  initialPois,
  supabaseStorageBase,
  photoBucket = 'listing-photos',
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
        const reasons = r.skippedReasons?.length
          ? ` — first reason: ${r.skippedReasons[0]}`
          : '';
        setNotice(
          `Photos: +${r.fetched} new, ${r.reused} reused, ${r.skipped} skipped.${reasons}`,
        );
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
        <PhotoReviewGrid
          photos={row.photos}
          storageBase={storageBase}
          bucket={bucket}
          onPhotoDecide={onPhotoDecide}
          busy={busy}
        />
      ) : null}
    </li>
  );
}

// ─── review grid + lightbox ──────────────────────────────────────────────

function PhotoReviewGrid({
  photos,
  storageBase,
  bucket,
  onPhotoDecide,
  busy,
}: {
  photos: NearbyPoiForListing['photos'];
  storageBase: string;
  bucket: string;
  onPhotoDecide: (poiPhotoId: string, approved: boolean) => void;
  busy: boolean;
}) {
  // Which photo index is open in the lightbox. null = closed.
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const close = useCallback(() => setOpenIdx(null), []);
  const goPrev = useCallback(
    () => setOpenIdx((i) => (i == null ? i : Math.max(0, i - 1))),
    [],
  );
  const goNext = useCallback(
    () =>
      setOpenIdx((i) => (i == null ? i : Math.min(photos.length - 1, i + 1))),
    [photos.length],
  );
  const decideCurrent = useCallback(
    (approved: boolean) => {
      if (openIdx == null) return;
      const cur = photos[openIdx];
      if (!cur) return;
      onPhotoDecide(cur.poi_photo_id, approved);
      // Auto-advance for quick triage — jump to next pending photo,
      // or close if we're at the end.
      if (openIdx < photos.length - 1) {
        setOpenIdx(openIdx + 1);
      } else {
        setOpenIdx(null);
      }
    },
    [openIdx, photos, onPhotoDecide],
  );

  // Keyboard: Esc close, arrows navigate, A approve, X reject.
  useEffect(() => {
    if (openIdx == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'a' || e.key === 'A') decideCurrent(true);
      else if (e.key === 'x' || e.key === 'X') decideCurrent(false);
    };
    window.addEventListener('keydown', onKey);
    // Prevent body scroll while lightbox is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [openIdx, close, goPrev, goNext, decideCurrent]);

  const current = openIdx != null ? photos[openIdx] : null;

  return (
    <>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {photos.map((p, i) => (
          <PhotoTile
            key={p.poi_photo_id}
            storageBase={storageBase}
            bucket={bucket}
            path={p.poi_photos.storage_path}
            attribution={p.poi_photos.attribution}
            status={p.status}
            onOpen={() => setOpenIdx(i)}
          />
        ))}
      </div>

      {current ? (
        <PhotoLightbox
          storageBase={storageBase}
          bucket={bucket}
          path={current.poi_photos.storage_path}
          attribution={current.poi_photos.attribution}
          status={current.status}
          index={openIdx ?? 0}
          total={photos.length}
          hasPrev={(openIdx ?? 0) > 0}
          hasNext={(openIdx ?? 0) < photos.length - 1}
          busy={busy}
          onClose={close}
          onPrev={goPrev}
          onNext={goNext}
          onDecide={decideCurrent}
        />
      ) : null}
    </>
  );
}

// ─── single photo tile (tap to open lightbox) ────────────────────────────

function PhotoTile({
  storageBase,
  bucket,
  path,
  attribution,
  status,
  onOpen,
}: {
  storageBase: string;
  bucket: string;
  path: string;
  attribution: Record<string, unknown> | null;
  status: 'pending' | 'approved' | 'rejected';
  onOpen: () => void;
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
    <button
      type="button"
      onClick={onOpen}
      aria-label={author ? `Review photo by ${author}` : 'Review photo'}
      className={`group relative block overflow-hidden rounded ${ring} focus:outline-none focus:ring-2 focus:ring-bronze`}
    >
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
      {status !== 'pending' ? (
        <span
          className={`absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full ${
            status === 'approved' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
          }`}
        >
          {status === 'approved' ? <Check size={12} /> : <X size={12} />}
        </span>
      ) : null}
    </button>
  );
}

// ─── fullscreen review lightbox ──────────────────────────────────────────

function PhotoLightbox({
  storageBase,
  bucket,
  path,
  attribution,
  status,
  index,
  total,
  hasPrev,
  hasNext,
  busy,
  onClose,
  onPrev,
  onNext,
  onDecide,
}: {
  storageBase: string;
  bucket: string;
  path: string;
  attribution: Record<string, unknown> | null;
  status: 'pending' | 'approved' | 'rejected';
  index: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  busy: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDecide: (approved: boolean) => void;
}) {
  const url = `${storageBase}/storage/v1/object/public/${bucket}/${path}`;
  const author =
    (attribution as { authorAttributions?: Array<{ displayName?: string }> })
      ?.authorAttributions?.[0]?.displayName ?? '';

  // Swipe-to-navigate on touch devices.
  const [touchX, setTouchX] = useState<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t) setTouchX(t.clientX);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX == null) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - touchX;
    if (Math.abs(dx) > 60) {
      if (dx < 0 && hasNext) onNext();
      else if (dx > 0 && hasPrev) onPrev();
    }
    setTouchX(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo review"
      className="fixed inset-0 z-[90] flex flex-col bg-black/95 animate-in fade-in duration-150"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Top bar: counter + close */}
      <div className="flex shrink-0 items-center justify-between px-4 py-3 text-white">
        <span className="text-sm tabular-nums">
          {index + 1} / {total}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white active:scale-95 hover:bg-white/20"
        >
          <X size={20} />
        </button>
      </div>

      {/* Image area */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <Image
          key={url}
          src={url}
          alt={author ? `Photo by ${author}` : 'POI photo'}
          fill
          sizes="100vw"
          className="object-contain"
          unoptimized
          priority
        />

        {/* Prev / next arrows (desktop; still tappable on mobile if user prefers taps to swipes) */}
        {hasPrev ? (
          <button
            type="button"
            onClick={onPrev}
            aria-label="Previous photo"
            className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white active:scale-95 hover:bg-white/20"
          >
            <ChevronLeft size={22} />
          </button>
        ) : null}
        {hasNext ? (
          <button
            type="button"
            onClick={onNext}
            aria-label="Next photo"
            className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white active:scale-95 hover:bg-white/20"
          >
            <ChevronRight size={22} />
          </button>
        ) : null}
      </div>

      {/* Bottom bar: attribution + big approve/reject */}
      <div className="shrink-0 px-4 pt-2 pb-3">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs text-white/70">
          <span className="truncate">{author ? `Photo by ${author}` : ''}</span>
          <span className="shrink-0 capitalize">
            {status === 'approved' ? (
              <span className="text-green-300">✓ approved</span>
            ) : status === 'rejected' ? (
              <span className="text-red-300">✗ rejected</span>
            ) : (
              <span>pending</span>
            )}
          </span>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onDecide(false)}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white/10 py-3.5 text-base font-medium text-white active:scale-[0.98] hover:bg-red-500/80 disabled:opacity-50"
          >
            <X size={20} />
            Reject
          </button>
          <button
            type="button"
            onClick={() => onDecide(true)}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-green-500 py-3.5 text-base font-medium text-white active:scale-[0.98] hover:bg-green-400 disabled:opacity-50"
          >
            <Check size={20} />
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
