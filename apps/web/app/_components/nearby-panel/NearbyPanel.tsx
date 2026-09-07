'use client';

/**
 * NearbyPanel — POI triage + generated-videos UI for one entity, listing or
 * community. Which one it is comes entirely from `scope` (see `scope.ts`);
 * this file knows only "an entity with an id".
 *
 * Two sections:
 *   1. Generated Videos — one bucket card each. Rendered CF Stream video when
 *      ready, an English structured description synthesized from the tagged
 *      photos (for TTS later), and Generate / Regenerate controls.
 *   2. POI list — auto-discovered places grouped by bucket. Approved photos
 *      show their vision-tagged description underneath so the agent can
 *      spot-check the caption pipeline.
 *
 * Photos already carry `ai_tags.description` (500-char cap) written by the
 * fire-and-forget vision tagger on approve. If a photo has no description
 * yet, we show "Analyzing…" so the agent knows tagging is in flight.
 */

import type { IntentBucket } from '@/lib/poi/types';
import { startAsyncTransition } from '@/lib/utils/start-async-transition';
import { ImagePlus, Loader2, MapPinned, RefreshCw } from 'lucide-react';
import { useState, useTransition } from 'react';
import { GeneratedVideosSection } from './generated-videos';
import { PhotoReviewGrid } from './photo-review';
import { BUCKET_LABELS, BUCKET_SHORT, type NearbyPanelPoi, type NearbyPanelScope } from './scope';

const BUCKET_DEFAULT_LIMIT = 10;

interface Props {
  entityId: string;
  scope: NearbyPanelScope;
  initialPois: NearbyPanelPoi[];
  /** Public Supabase storage host, so we can render photos by storage_path. */
  supabaseStorageBase: string;
  /** Bucket name where poi photos live (default: "listing-photos"). */
  photoBucket?: string;
}

export function NearbyPanel({
  entityId,
  scope,
  initialPois,
  supabaseStorageBase,
  photoBucket = 'listing-photos',
}: Props) {
  const [pois, setPois] = useState<NearbyPanelPoi[]>(initialPois);
  const [pending, startTransition] = useTransition();
  const [busyPois, setBusyPois] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedBuckets, setExpandedBuckets] = useState<Set<string>>(new Set());

  // ── grouping ────────────────────────────────────────────────────────────
  // Sort each bucket by rating quality (rating desc, review-count desc as
  // tiebreaker, null ratings pushed to the end). Panel then shows only the
  // top BUCKET_DEFAULT_LIMIT per bucket, with a "Show all (N)" toggle.
  const grouped: Record<string, NearbyPanelPoi[]> = Object.fromEntries(
    scope.buckets.map((b) => [b, [] as NearbyPanelPoi[]]),
  );
  // A bucket this panel has never heard of must not take the page down with
  // it. The community tour classifies POIs with a wider taxonomy (civic,
  // waterfront, other) than INTENT_BUCKETS, and writes it to the same column;
  // an unknown key used to hit `undefined.push` and crash the whole route
  // (owner 2026-08-17). Unknown buckets are collected and rendered after the
  // known ones rather than silently dropped.
  const unknownBuckets: string[] = [];
  for (const p of pois) {
    const bucket = p.intent_bucket as string;
    if (!grouped[bucket]) {
      grouped[bucket] = [];
      unknownBuckets.push(bucket);
    }
    grouped[bucket]?.push(p);
  }
  const renderBuckets: string[] = [...scope.buckets, ...unknownBuckets];
  for (const b of renderBuckets) {
    grouped[b]?.sort((a, b) => {
      const ra = a.pois.rating ?? -1;
      const rb = b.pois.rating ?? -1;
      if (rb !== ra) return rb - ra;
      return (b.pois.user_ratings_total ?? 0) - (a.pois.user_ratings_total ?? 0);
    });
  }

  const toggleBucket = (b: string) => {
    setExpandedBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      return next;
    });
  };

  // ── actions ─────────────────────────────────────────────────────────────
  const refresh = async () => {
    const fresh = await scope.loadPois(entityId);
    setPois(fresh);
  };

  const handleDiscover = () => {
    setNotice(null);
    startAsyncTransition(startTransition, async () => {
      try {
        const r = await scope.discover(entityId);
        const topBuckets = scope.buckets
          .map((b) => ({ b, n: r.buckets[b] ?? 0 }))
          .filter((x) => x.n > 0)
          .sort((a, b) => b.n - a.n)
          .slice(0, 4)
          .map((x) => `${BUCKET_SHORT[x.b]} ${x.n}`)
          .join(' · ');
        setNotice(
          `Discovered ${r.discovered} new POIs (${r.reused} already known)${topBuckets ? `. Top: ${topBuckets}.` : '.'}`,
        );
        await refresh();
      } catch (err) {
        setNotice(`Discovery failed: ${(err as Error).message}`);
      }
    });
  };

  const handleFetchPhotos = (poiId: string) => {
    if (busyPois.has(poiId)) return;
    setBusyPois((prev) => {
      const next = new Set(prev);
      next.add(poiId);
      return next;
    });
    setNotice(null);
    // Deliberately NOT wrapped in startTransition — that made every other row's
    // button `pending` and froze the panel while one POI's photos fetched.
    // Each fetch tracks its own busy state via `busyPois`, so the user can
    // click Fetch on several POIs in parallel and keep approving/rejecting
    // POIs while requests are in flight.
    void (async () => {
      try {
        const r = await scope.fetchPhotos(entityId, poiId);
        const reasons = r.skippedReasons?.length ? ` — first reason: ${r.skippedReasons[0]}` : '';
        setNotice(`Photos: +${r.fetched} new, ${r.reused} reused, ${r.skipped} skipped.${reasons}`);
        await refresh();
      } catch (err) {
        setNotice(`Photo fetch failed: ${(err as Error).message}`);
      } finally {
        setBusyPois((prev) => {
          const next = new Set(prev);
          next.delete(poiId);
          return next;
        });
      }
    })();
  };

  const handlePhotoDecision = (poiPhotoId: string, approved: boolean) => {
    // Optimistic update: flip the photo's status locally so the lightbox
    // reacts instantly. Fire the server action without startTransition so
    // the auto-advanced next photo's buttons aren't disabled during the
    // 300-800ms server roundtrip (which caused a perceived "skip a photo"
    // when the user's next tap arrived while the button was disabled).
    const nextStatus: 'approved' | 'rejected' = approved ? 'approved' : 'rejected';
    let prevSnapshot: NearbyPanelPoi[] | null = null;
    setPois((current) => {
      prevSnapshot = current;
      return current.map((poi) => ({
        ...poi,
        photos: poi.photos.map((p) =>
          p.poi_photo_id === poiPhotoId ? { ...p, status: nextStatus } : p,
        ),
      }));
    });
    void (async () => {
      try {
        await scope.setPhotoStatus(entityId, poiPhotoId, nextStatus);
      } catch (err) {
        // Roll back optimistic update on failure.
        if (prevSnapshot) setPois(prevSnapshot);
        setNotice(`Photo decision failed: ${(err as Error).message}`);
      }
    })();
  };

  // ── render ──────────────────────────────────────────────────────────────
  const totalPois = pois.length;

  return (
    <div className="space-y-8">
      {/* ─── Section 1: Generated Videos ──────────────────────────────────── */}
      <GeneratedVideosSection entityId={entityId} scope={scope} />

      {/* ─── Section 2: Nearby POI list ───────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink2">Nearby POIs ({totalPois})</h3>
            <p className="text-xs text-muted">
              Auto-discovered points of interest within 5 miles. Approve the ones you'd want a buyer
              to see in the neighborhood story.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDiscover}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-md border border-line bg-bg px-3 py-1.5 text-ink2 text-xs hover:border-ink2 hover:text-ink disabled:opacity-50"
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
            Click "Discover POIs" to search Google Places for nearby restaurants, parks, schools,
            grocery stores, cafes, and gyms.
          </p>
        ) : (
          <div className="space-y-4">
            {renderBuckets.map((bucket) => {
              const rows = grouped[bucket] ?? [];
              if (rows.length === 0) return null;
              const isExpanded = expandedBuckets.has(bucket);
              const visibleRows = isExpanded ? rows : rows.slice(0, BUCKET_DEFAULT_LIMIT);
              const hiddenCount = rows.length - visibleRows.length;
              return (
                <section key={bucket}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="text-xs font-medium uppercase tracking-wide text-muted">
                      {BUCKET_LABELS[bucket as IntentBucket] ?? bucket} · {rows.length}
                      {rows.length > BUCKET_DEFAULT_LIMIT && !isExpanded ? (
                        <span className="ml-1 text-muted/70 normal-case">
                          (top {BUCKET_DEFAULT_LIMIT} by rating)
                        </span>
                      ) : null}
                    </h4>
                  </div>
                  <ul className="space-y-2">
                    {visibleRows.map((row) => (
                      <PoiRow
                        key={row.poi_id}
                        row={row}
                        busy={busyPois.has(row.poi_id) || pending}
                        onFetchPhotos={() => handleFetchPhotos(row.poi_id)}
                        onPhotoDecide={handlePhotoDecision}
                        storageBase={supabaseStorageBase}
                        bucket={photoBucket}
                      />
                    ))}
                  </ul>
                  {rows.length > BUCKET_DEFAULT_LIMIT ? (
                    <button
                      type="button"
                      onClick={() => toggleBucket(bucket)}
                      className="mt-2 text-xs text-ink hover:underline"
                    >
                      {isExpanded
                        ? `Show top ${BUCKET_DEFAULT_LIMIT} only`
                        : `Show all ${rows.length} (${hiddenCount} more)`}
                    </button>
                  ) : null}
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
  onPhotoDecide,
  storageBase,
  bucket,
}: {
  row: NearbyPanelPoi;
  busy: boolean;
  onFetchPhotos: () => void;
  onPhotoDecide: (poiPhotoId: string, approved: boolean) => void;
  storageBase: string;
  bucket: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const photoCount = row.photos?.length ?? 0;
  const approvedPhotos = row.photos?.filter((p) => p.status === 'approved').length ?? 0;

  const distanceLabel = row.distance_m != null ? `${(row.distance_m / 1609).toFixed(1)} mi` : '—';

  return (
    <li className="rounded-lg border border-line bg-bg p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-medium text-ink">{row.pois.display_name}</span>
            <span className="text-xs text-muted">
              {row.pois.primary_type ?? '—'} · {distanceLabel}
              {row.pois.rating != null
                ? ` · ★${row.pois.rating.toFixed(1)} (${row.pois.user_ratings_total ?? 0})`
                : ''}
            </span>
          </div>
          {row.pois.formatted_address ? (
            <p className="mt-0.5 truncate text-xs text-muted">{row.pois.formatted_address}</p>
          ) : null}
          <div className="mt-1 flex items-center gap-2 text-xs text-muted">
            {photoCount > 0 ? (
              <button
                type="button"
                className="text-ink2 hover:underline"
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
            aria-label={photoCount > 0 ? 'Sync photos' : 'Fetch photos'}
            title={
              photoCount > 0 ? 'Photos already fetched — tap to sync any new ones' : 'Fetch photos'
            }
            onClick={onFetchPhotos}
            disabled={busy}
            className="rounded p-1 text-muted hover:bg-surface hover:text-ink2 disabled:opacity-40"
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : photoCount > 0 ? (
              <RefreshCw size={16} />
            ) : (
              <ImagePlus size={16} />
            )}
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
