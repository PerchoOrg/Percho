'use client';

/**
 * NearbyPoiPanel — dedicated "Nearby" tab (Phase 78, 2026-07-15).
 *
 * Two sections:
 *   1. Generated Videos — 4 bucket cards (walkable / daily / lifestyle /
 *      commute). Each card shows the rendered CF Stream video (when ready),
 *      an English structured description synthesized from the tagged photos
 *      (for TTS later), and Generate / Regenerate / Regenerate-description
 *      controls.
 *   2. POI list — auto-discovered places grouped by bucket. Approved photos
 *      show their vision-tagged description underneath so the agent can
 *      spot-check the caption pipeline.
 *
 * Server-action contract:
 *   - Approve/reject POIs + photos → `lib/poi/actions.ts`.
 *   - Bucket-video generation + status → `lib/poi/video-actions.ts`.
 *   - Video narrative synthesis (Anthropic, manual click, English) →
 *     `regenerateBucketVideoNarrative` in `lib/poi/video-actions.ts`.
 *
 * Photos already carry `ai_tags.description` (500-char cap) written by the
 * fire-and-forget vision tagger on approve. If a photo has no description
 * yet, we show "Analyzing…" so the agent knows tagging is in flight.
 */

import { Loader2, MapPinned, ImagePlus, Check, X, ChevronLeft, ChevronRight, Video, Play, Sparkles, RefreshCw } from 'lucide-react';
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
import {
  generateBucketVideo,
  getBucketVideoStatus,
  regenerateBucketVideoNarrative,
  type BucketVideoStatus,
} from '@/lib/poi/video-actions';
import { streamIframeUrl } from '@/lib/cloudflare/stream';
import type { IntentBucket } from '@/lib/poi/types';

const BUCKET_LABELS: Record<IntentBucket, string> = {
  schools: 'Schools',
  dining: 'Dining',
  nightlife: 'Nightlife & Entertainment',
  shopping: 'Shopping',
  outdoor: 'Outdoor & Trails',
  fitness: 'Fitness & Wellness',
  kids: 'Kids & Family',
  asian_community: 'Asian Community',
  daily_errands: 'Daily Errands',
  faith: 'Faith Communities',
  work_hubs: 'Work Hubs',
  healthcare: 'Healthcare',
  pets: 'Pets',
  transit: 'Transit & Commute',
};

const BUCKET_SHORT: Record<IntentBucket, string> = {
  schools: 'Schools',
  dining: 'Dining',
  nightlife: 'Nightlife',
  shopping: 'Shopping',
  outdoor: 'Outdoor',
  fitness: 'Fitness',
  kids: 'Kids',
  asian_community: 'Asian',
  daily_errands: 'Errands',
  faith: 'Faith',
  work_hubs: 'Work',
  healthcare: 'Health',
  pets: 'Pets',
  transit: 'Transit',
};

const BUCKET_ORDER: IntentBucket[] = [
  'schools',
  'dining',
  'nightlife',
  'shopping',
  'outdoor',
  'fitness',
  'kids',
  'asian_community',
  'daily_errands',
  'faith',
  'work_hubs',
  'healthcare',
  'pets',
  'transit',
];

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
  const grouped: Record<IntentBucket, NearbyPoiForListing[]> = Object.fromEntries(
    BUCKET_ORDER.map((b) => [b, [] as NearbyPoiForListing[]]),
  ) as Record<IntentBucket, NearbyPoiForListing[]>;
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
        const topBuckets = BUCKET_ORDER
          .map((b) => ({ b, n: r.buckets[b] ?? 0 }))
          .filter((x) => x.n > 0)
          .sort((a, b) => b.n - a.n)
          .slice(0, 4)
          .map((x) => `${BUCKET_SHORT[x.b]} ${x.n}`)
          .join(' · ');
        setNotice(
          `Discovered ${r.discovered} new POIs (${r.reused} already known)` +
            (topBuckets ? `. Top: ${topBuckets}.` : '.'),
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
    <div className="space-y-8">
      {/* ─── Section 1: Generated Videos ──────────────────────────────────── */}
      <GeneratedVideosSection listingId={listingId} />

      {/* ─── Section 2: Nearby POI list ───────────────────────────────────── */}
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
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="text-xs font-medium uppercase tracking-wide text-muted">
                      {BUCKET_LABELS[bucket]} · {rows.length}
                    </h4>
                  </div>
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
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {photos.map((p, i) => (
          <PhotoTile
            key={p.poi_photo_id}
            storageBase={storageBase}
            bucket={bucket}
            path={p.poi_photos.storage_path}
            attribution={p.poi_photos.attribution}
            status={p.status}
            aiTags={p.poi_photos.ai_tags}
            taggedAt={p.poi_photos.tagged_at}
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
  aiTags,
  taggedAt,
  onOpen,
}: {
  storageBase: string;
  bucket: string;
  path: string;
  attribution: Record<string, unknown> | null;
  status: 'pending' | 'approved' | 'rejected';
  aiTags?: { description?: string; primary_category?: string } | null;
  taggedAt?: string | null;
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

  // Phase 78: expose the vision-tagger caption under approved photos so the
  // agent can spot-check the pipeline. Rejected/pending photos stay quiet —
  // clutter would drown the triage view.
  const showCaption = status === 'approved';
  const description = aiTags?.description?.trim() ?? '';
  const analyzing = !aiTags || (!description && !taggedAt);

  return (
    <figure className="flex flex-col gap-1.5">
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
            sizes="160px"
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
      {showCaption ? (
        <figcaption className="text-[10.5px] leading-snug text-muted">
          {description ? (
            <span className="line-clamp-3">{description}</span>
          ) : analyzing ? (
            <span className="italic text-muted/70">Analyzing…</span>
          ) : (
            <span className="italic text-muted/70">No description</span>
          )}
          {aiTags?.primary_category ? (
            <span className="ml-1 inline-flex rounded bg-line/50 px-1 text-[9px] uppercase tracking-wide text-ink2/70">
              {aiTags.primary_category}
            </span>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
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

// ─── Generated Videos section (Phase 78) ─────────────────────────────────
//
// One card per intent bucket. Each card shows:
//   - CF Stream player when the render is ready
//   - Status pill (idle / rendering / ready / failed)
//   - Structured description (intro + scene beats + closing) synthesized
//     from the photos' vision-tagged captions. Manual "Regenerate description"
//     button — never auto-fires to keep Anthropic spend predictable.
//   - Generate / Regenerate video button (unchanged wiring — enqueues a
//     `generated_videos` row, the EC2 worker picks it up).
//
// The 4-up grid stays visible even when no buckets have rendered yet, so the
// agent always sees the full slate and knows what's missing.

function GeneratedVideosSection({ listingId }: { listingId: string }) {
  return (
    <div>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-ink2">Generated videos</h3>
        <p className="text-xs text-muted">
          One 30–60s slideshow per intent bucket, stitched from approved POI photos.
          Each video comes with an English description you can send to TTS later.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {BUCKET_ORDER.map((bucket) => (
          <BucketVideoCard key={bucket} listingId={listingId} bucket={bucket} />
        ))}
      </div>
    </div>
  );
}

function BucketVideoCard({
  listingId,
  bucket,
}: {
  listingId: string;
  bucket: IntentBucket;
}) {
  const [status, setStatus] = useState<BucketVideoStatus>(null);
  const [busy, setBusy] = useState(false);
  const [narrativeBusy, setNarrativeBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [narrativeErr, setNarrativeErr] = useState<string | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [showFullScript, setShowFullScript] = useState(false);

  // Initial load + polling while render is in flight (unchanged wiring).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next = await getBucketVideoStatus(listingId, bucket);
      if (!cancelled) setStatus(next);
      return next;
    };
    load().then((s) => {
      if (cancelled) return;
      if (s?.status === 'pending' || s?.status === 'processing') {
        const t = setInterval(async () => {
          const cur = await load();
          if (
            !cur ||
            (cur.status !== 'pending' && cur.status !== 'processing')
          ) {
            clearInterval(t);
          }
        }, 5000);
        return () => clearInterval(t);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [listingId, bucket]);

  const handleGenerate = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await generateBucketVideo(listingId, bucket);
      if (!res.ok) {
        setErr(res.message);
        return;
      }
      setStatus({
        video_id: res.video_id,
        status: res.status,
        cf_stream_uid: null,
        duration_s: null,
        photo_count: res.photo_count,
        error: null,
        created_at: new Date().toISOString(),
        narrative: null,
      });
      const t = setInterval(async () => {
        const cur = await getBucketVideoStatus(listingId, bucket);
        setStatus(cur);
        if (cur && cur.status !== 'pending' && cur.status !== 'processing') {
          clearInterval(t);
        }
      }, 5000);
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerateNarrative = async () => {
    if (!status?.video_id) return;
    setNarrativeBusy(true);
    setNarrativeErr(null);
    try {
      const res = await regenerateBucketVideoNarrative(status.video_id);
      if (!res.ok) {
        setNarrativeErr(res.message);
        return;
      }
      setStatus((prev) => (prev ? { ...prev, narrative: res.narrative } : prev));
    } finally {
      setNarrativeBusy(false);
    }
  };

  const isReady = status?.status === 'ready' || status?.status === 'approved';
  const isRendering = status?.status === 'pending' || status?.status === 'processing';
  const isFailed = status?.status === 'failed';
  const narrative = status?.narrative ?? null;

  return (
    <div className="rounded-lg border border-line bg-bg p-3">
      {/* header */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4 text-ink2" aria-hidden />
          <span className="text-sm font-medium text-ink">{BUCKET_SHORT[bucket]}</span>
          <StatusPill status={status?.status ?? null} />
        </div>
        <div className="flex items-center gap-1.5">
          {isReady && status?.cf_stream_uid ? (
            <button
              type="button"
              onClick={() => setShowPlayer((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-ink hover:bg-line/40"
            >
              <Play className="h-3 w-3" />
              {showPlayer ? 'Hide' : 'Play'}
              {status.duration_s ? ` · ${Math.round(status.duration_s)}s` : ''}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy || isRendering}
            title={isReady ? 'Regenerate from current approved photos' : 'Generate video'}
            className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-ink hover:bg-line/40 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {isReady ? 'Regenerate' : 'Generate'}
          </button>
        </div>
      </div>

      {/* status/error line */}
      {isRendering ? (
        <p className="mb-2 flex items-center gap-1 text-[11px] text-muted">
          <Loader2 className="h-3 w-3 animate-spin" />
          Rendering {status?.photo_count} photos… ({status?.status})
        </p>
      ) : null}
      {(isFailed || err) ? (
        <p
          className="mb-2 truncate text-[11px] text-red-600"
          title={status?.error ?? err ?? ''}
        >
          {isFailed ? 'Failed: ' : ''}
          {err ?? status?.error ?? ''}
        </p>
      ) : null}

      {/* inline player */}
      {isReady && status?.cf_stream_uid && showPlayer ? (
        <div className="mb-3 aspect-[9/16] w-full max-w-[280px] overflow-hidden rounded-lg border border-line bg-black">
          <iframe
            src={streamIframeUrl(status.cf_stream_uid)}
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
            allowFullScreen
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        </div>
      ) : null}

      {/* narrative / description block */}
      <div className="rounded border border-line/70 bg-surface p-2.5">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
            Description (English · for TTS)
          </span>
          <button
            type="button"
            onClick={handleRegenerateNarrative}
            disabled={narrativeBusy || !status?.video_id || (!isReady && !isFailed)}
            title={
              !status?.video_id
                ? 'Generate the video first'
                : narrative
                  ? 'Regenerate description from tagged photos'
                  : 'Generate a description from tagged photos'
            }
            className="inline-flex items-center gap-1 rounded-md border border-line bg-bg px-2 py-0.5 text-[10.5px] text-ink hover:bg-line/40 disabled:opacity-40"
          >
            {narrativeBusy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            {narrative ? 'Regenerate' : 'Generate'}
          </button>
        </div>
        {narrativeErr ? (
          <p className="mb-1 text-[11px] text-red-600">{narrativeErr}</p>
        ) : null}
        {narrative ? (
          <div className="space-y-1.5 text-[11.5px] leading-relaxed text-ink2">
            {narrative.intro ? (
              <p className="italic">{narrative.intro}</p>
            ) : null}
            {narrative.scenes && narrative.scenes.length > 0 ? (
              <ol className="list-decimal space-y-0.5 pl-4 text-ink2/90">
                {narrative.scenes.map((s, i) => (
                  <li key={`${i}-${s.poi_name}`}>
                    <span className="font-medium text-ink">{s.poi_name}</span>
                    {s.beat ? <span className="text-ink2/80"> — {s.beat}</span> : null}
                  </li>
                ))}
              </ol>
            ) : null}
            {narrative.closing ? (
              <p className="italic text-ink2/90">{narrative.closing}</p>
            ) : null}
            {narrative.voiceover ? (
              <details
                open={showFullScript}
                onToggle={(e) => setShowFullScript((e.currentTarget as HTMLDetailsElement).open)}
                className="mt-2 border-t border-line/60 pt-1.5"
              >
                <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-muted hover:text-ink2">
                  Voiceover script ({narrative.voiceover.split(/\s+/).length} words)
                </summary>
                <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-ink">
                  {narrative.voiceover}
                </p>
              </details>
            ) : null}
          </div>
        ) : (
          <p className="text-[11px] italic text-muted">
            {isReady
              ? 'Click Generate to synthesize a description from the tagged photos.'
              : isRendering
                ? 'Description generates once the render finishes.'
                : 'Generate the video first.'}
          </p>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="rounded-full bg-line/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
        Not started
      </span>
    );
  }
  const styles: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    processing: 'bg-amber-100 text-amber-800',
    ready: 'bg-green-100 text-green-800',
    approved: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    rejected: 'bg-red-100 text-red-800',
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${styles[status] ?? 'bg-line/40 text-muted'}`}
    >
      {status}
    </span>
  );
}
