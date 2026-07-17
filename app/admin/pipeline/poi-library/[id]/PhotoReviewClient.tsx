'use client';

/**
 * PhotoReviewClient — mobile-review-triage-ui pattern for global
 * poi_photos.status. Grid tile → fullscreen lightbox → big Approve /
 * Reject at bottom, auto-advance to next pending, keyboard shortcuts
 * (A / X / ← / → / Esc), swipe navigation.
 *
 * Decisions commit optimistically via setGlobalPhotoStatus. On error
 * we roll back the row's status locally and surface a toast-shaped
 * error line at the top of the lightbox.
 */

import { type GlobalPhotoDecision, setGlobalPhotoStatus } from '@/lib/poi/admin-photo-actions';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Photo = {
  id: string;
  storage_path: string;
  status: 'pending' | 'approved' | 'rejected';
  width_px: number | null;
  height_px: number | null;
  ai_score: number | null;
  ai_tags: Record<string, unknown> | null;
  applicable_buckets: string[] | null;
  attribution: Record<string, unknown> | null;
  reviewed_at: string | null;
  tagged_at: string | null;
};

export function PhotoReviewClient({
  storageBase,
  bucket,
  photos: initial,
}: {
  storageBase: string;
  bucket: string;
  photos: Photo[];
}) {
  const [photos, setPhotos] = useState<Photo[]>(initial);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = useCallback(
    async (idx: number, decision: GlobalPhotoDecision) => {
      const target = photos[idx];
      if (!target) return;
      const prevStatus = target.status;

      // Optimistic update
      setPhotos((rows) => rows.map((r, i) => (i === idx ? { ...r, status: decision } : r)));
      setBusy(true);
      setError(null);

      const res = await setGlobalPhotoStatus(target.id, decision);
      setBusy(false);

      if (!res.ok) {
        setError(res.message ?? 'Update failed');
        setPhotos((rows) => rows.map((r, i) => (i === idx ? { ...r, status: prevStatus } : r)));
        return;
      }

      // Auto-advance to next unresolved photo (or close if none left).
      setOpenIdx((cur) => {
        if (cur == null) return cur;
        for (let j = cur + 1; j < photos.length; j += 1) {
          if (photos[j]?.status === 'pending') return j;
        }
        return null;
      });
    },
    [photos],
  );

  const current = openIdx != null ? photos[openIdx] : null;
  const hasPrev = openIdx != null && openIdx > 0;
  const hasNext = openIdx != null && openIdx < photos.length - 1;

  // Keyboard shortcuts
  useEffect(() => {
    if (openIdx == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenIdx(null);
      else if (e.key === 'ArrowLeft' && hasPrev) setOpenIdx(openIdx - 1);
      else if (e.key === 'ArrowRight' && hasNext) setOpenIdx(openIdx + 1);
      else if ((e.key === 'a' || e.key === 'A') && !busy) decide(openIdx, 'approved');
      else if ((e.key === 'x' || e.key === 'X') && !busy) decide(openIdx, 'rejected');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openIdx, hasPrev, hasNext, busy, decide]);

  if (photos.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-ink2">
        No photos discovered yet for this POI.
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {photos.map((p, i) => (
          <PhotoTile
            key={p.id}
            photo={p}
            storageBase={storageBase}
            bucket={bucket}
            onOpen={() => setOpenIdx(i)}
          />
        ))}
      </div>

      {current && openIdx != null && (
        <Lightbox
          storageBase={storageBase}
          bucket={bucket}
          photo={current}
          index={openIdx}
          total={photos.length}
          hasPrev={hasPrev}
          hasNext={hasNext}
          busy={busy}
          error={error}
          onClose={() => setOpenIdx(null)}
          onPrev={() => setOpenIdx(openIdx - 1)}
          onNext={() => setOpenIdx(openIdx + 1)}
          onDecide={(d) => decide(openIdx, d)}
        />
      )}
    </>
  );
}

// ─── tile ────────────────────────────────────────────────────────────

function PhotoTile({
  photo,
  storageBase,
  bucket,
  onOpen,
}: {
  photo: Photo;
  storageBase: string;
  bucket: string;
  onOpen: () => void;
}) {
  const url = `${storageBase}/storage/v1/object/public/${bucket}/${photo.storage_path}`;
  const ring =
    photo.status === 'approved'
      ? 'ring-2 ring-green-500'
      : photo.status === 'rejected'
        ? 'opacity-40 ring-2 ring-red-500'
        : 'ring-1 ring-line';

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Review photo ${photo.id.slice(0, 6)}`}
      className={`group relative block overflow-hidden rounded-lg ${ring} focus:outline-none focus:ring-2 focus:ring-bronze`}
    >
      <div className="relative aspect-square">
        <Image src={url} alt="POI photo" fill sizes="200px" className="object-cover" unoptimized />
      </div>
      {photo.status !== 'pending' && (
        <span
          className={`absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full text-white ${
            photo.status === 'approved' ? 'bg-green-500' : 'bg-red-500'
          }`}
        >
          {photo.status === 'approved' ? <Check size={12} /> : <X size={12} />}
        </span>
      )}
      {typeof photo.ai_score === 'number' && (
        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-mono text-white">
          {photo.ai_score.toFixed(2)}
        </span>
      )}
    </button>
  );
}

// ─── lightbox ────────────────────────────────────────────────────────

function Lightbox({
  storageBase,
  bucket,
  photo,
  index,
  total,
  hasPrev,
  hasNext,
  busy,
  error,
  onClose,
  onPrev,
  onNext,
  onDecide,
}: {
  storageBase: string;
  bucket: string;
  photo: Photo;
  index: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDecide: (d: GlobalPhotoDecision) => void;
}) {
  const url = `${storageBase}/storage/v1/object/public/${bucket}/${photo.storage_path}`;
  const author =
    (photo.attribution as { authorAttributions?: Array<{ displayName?: string }> })
      ?.authorAttributions?.[0]?.displayName ?? '';

  const description = useMemo(() => {
    const raw = (photo.ai_tags as { description?: string } | null)?.description;
    return typeof raw === 'string' ? raw.trim() : '';
  }, [photo.ai_tags]);

  const primaryCategory = (photo.ai_tags as { primary_category?: string } | null)?.primary_category;
  const buckets = photo.applicable_buckets ?? [];

  // Swipe
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
    // biome-ignore lint/a11y/useSemanticElements: <dialog> lacks the layout controls we need for a full-viewport lightbox with safe-area padding; role="dialog" on a div is the industry pattern (used verbatim by ListingNearbyPanel.tsx).
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
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between px-4 py-3 text-white">
        <span className="text-sm tabular-nums">
          {index + 1} / {total}
        </span>
        <div className="flex items-center gap-2">
          <StatusPill status={photo.status} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white active:scale-95 hover:bg-white/20"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mb-2 rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-100">
          {error}
        </div>
      )}

      {/* Image */}
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
        {hasPrev && (
          <button
            type="button"
            onClick={onPrev}
            aria-label="Previous photo"
            className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white active:scale-95 hover:bg-white/20"
          >
            <ChevronLeft size={22} />
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            onClick={onNext}
            aria-label="Next photo"
            className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white active:scale-95 hover:bg-white/20"
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      {/* Bottom: details + decision */}
      <div className="max-h-[45vh] shrink-0 overflow-y-auto px-4 pt-3 pb-3">
        <div className="mb-3 space-y-1.5 text-xs text-white/80">
          {description && <p className="text-white">{description}</p>}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-white/60">
            {author && <span>by {author}</span>}
            {photo.width_px && photo.height_px && (
              <span>
                {photo.width_px}×{photo.height_px}
              </span>
            )}
            {typeof photo.ai_score === 'number' && <span>score {photo.ai_score.toFixed(2)}</span>}
            {primaryCategory && (
              <span className="rounded bg-white/10 px-1.5 py-0.5 uppercase tracking-wide">
                {primaryCategory}
              </span>
            )}
          </div>
          {buckets.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {buckets.map((b) => (
                <span
                  key={b}
                  className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/80"
                >
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onDecide('rejected')}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white/10 py-3.5 text-base font-medium text-white active:scale-[0.98] hover:bg-red-500/80 disabled:opacity-50"
          >
            <X size={20} />
            Reject
          </button>
          <button
            type="button"
            onClick={() => onDecide('approved')}
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

function StatusPill({ status }: { status: Photo['status'] }) {
  const cls =
    status === 'approved'
      ? 'bg-green-500/30 text-green-100'
      : status === 'rejected'
        ? 'bg-red-500/30 text-red-100'
        : 'bg-white/10 text-white/80';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase ${cls}`}>
      {status}
    </span>
  );
}
