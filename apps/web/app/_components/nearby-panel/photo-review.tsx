'use client';

/**
 * Photo triage for one POI: a grid of tiles, and the fullscreen lightbox a
 * tile opens. Entity-agnostic — the decision callback comes from the panel.
 */

import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import type { NearbyPanelPoi } from './scope';

export function PhotoReviewGrid({
  photos,
  storageBase,
  bucket,
  onPhotoDecide,
  busy,
}: {
  photos: NearbyPanelPoi['photos'];
  storageBase: string;
  bucket: string;
  onPhotoDecide: (poiPhotoId: string, approved: boolean) => void;
  busy: boolean;
}) {
  // Which photo index is open in the lightbox. null = closed.
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const close = useCallback(() => setOpenIdx(null), []);
  const goPrev = useCallback(() => setOpenIdx((i) => (i == null ? i : Math.max(0, i - 1))), []);
  const goNext = useCallback(
    () => setOpenIdx((i) => (i == null ? i : Math.min(photos.length - 1, i + 1))),
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
  const author = photoAuthor(attribution);

  const ring =
    status === 'approved'
      ? 'ring-2 ring-green-400'
      : status === 'rejected'
        ? 'opacity-40 ring-2 ring-red-400'
        : 'ring-1 ring-line';

  // expose the vision-tagger caption under approved photos so the
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
        className={`group relative block overflow-hidden rounded ${ring} focus:outline-none focus:ring-2 focus:ring-ink2`}
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
  const author = photoAuthor(attribution);

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

/** Google Places hands attribution back as an opaque blob; we want one name. */
function photoAuthor(attribution: Record<string, unknown> | null): string {
  return (
    (attribution as { authorAttributions?: Array<{ displayName?: string }> })
      ?.authorAttributions?.[0]?.displayName ?? ''
  );
}
