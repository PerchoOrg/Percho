/**
 * CommunitySheet — Scenario A · L1
 *
 * Phase 34b (V1 redo, 2026-06-17): bottom sheet that opens when a buyer
 * taps the community chip on a listing card. Per V1 prototype the sheet
 * does NOT play videos in-place — tapping a thumbnail pushes to L2
 * (CommunityCarousel) which is fullscreen.
 *
 * Content rule (no fake data): only render fields that exist in the
 * schema today. Header (name + city/state + counts), description (if
 * any), and the community-video preview strip are real. Stat rows
 * (rating / school / commute / median / host) are deferred to phase35
 * once the migration adds the columns — until then, they're simply
 * absent rather than showing placeholder values.
 *
 * UX rules:
 * - Backdrop mask dismisses the sheet (tap outside).
 * - Header `×` close button (≥ 44×44 tap target).
 * - Esc to close (desktop accessibility).
 * - Slide-up animation via `translate-y-0` ↔ `translate-y-full`.
 * - Locked at ~85vh max so the user can still see the listing video peek
 *   behind the mask (V1 prototype keeps L0 visible underneath).
 */
'use client';

import { useEffect } from 'react';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import type { BrowseSourceVideo } from './BrowseFeed';

export type CommunitySheetData = {
  slug: string;
  name: string;
  city: string | null;
  state: string;
  description: string | null;
  videoCount: number;
  listingCount: number;
  /** From `card.categoryVideos` — used for the horizontal preview strip. */
  videos: BrowseSourceVideo[];
};

interface Props {
  open: boolean;
  data: CommunitySheetData | null;
  onClose: () => void;
  /** Called when a video thumb is tapped — parent pushes to L2 carousel. */
  onOpenCarousel: (startIndex: number) => void;
}

export function CommunitySheet({ open, data, onClose, onOpenCarousel }: Props) {
  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!data) return null;

  const locationLine = data.city ? `${data.city}, ${data.state}` : data.state;

  return (
    <>
      {/* Backdrop mask — tap to dismiss. */}
      <button
        type="button"
        aria-label="Close neighborhood details"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity ${
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      {/* Sheet body */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${data.name} neighborhood`}
        className={`fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border-line border-t bg-bg text-ink shadow-2xl transition-transform duration-300 ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Grip */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-surface/30" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 pb-3">
          <div className="min-w-0">
            <h2 className="font-serif text-xl leading-tight">{data.name}</h2>
            <p className="mt-0.5 text-[12px] text-ink2">
              {locationLine}
              {' · '}
              <span>
                {data.videoCount} {data.videoCount === 1 ? 'video' : 'videos'}
              </span>
              {data.listingCount > 0 && (
                <>
                  {' · '}
                  <span>
                    {data.listingCount} {data.listingCount === 1 ? 'home' : 'homes'}
                  </span>
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink2 transition-colors hover:bg-surface/10 hover:text-ink"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Description (real, optional) */}
        {data.description && (
          <p className="px-4 text-[13px] text-ink2 leading-relaxed">{data.description}</p>
        )}

        {/* Community videos — horizontal preview strip. */}
        {data.videos.length > 0 ? (
          <>
            <h3 className="mt-5 px-4 font-medium text-[11px] text-ink2 uppercase tracking-widest">
              Neighborhood videos · {data.videos.length}
            </h3>
            <div
              className="mt-2 flex gap-2 overflow-x-auto px-4 pb-5"
              style={{ scrollbarWidth: 'none' }}
            >
              {data.videos.map((v, idx) => {
                let poster: string | null = null;
                try {
                  poster = thumbnailUrl(v.cfVideoId);
                } catch {
                  poster = null;
                }
                return (
                  <button
                    key={`${v.cfVideoId}-${idx}`}
                    type="button"
                    onClick={() => onOpenCarousel(idx)}
                    className="group relative aspect-[9/16] w-28 shrink-0 overflow-hidden rounded-lg bg-surface ring-1 ring-line transition hover:ring-line-strong"
                    aria-label={`Play ${v.line1}`}
                  >
                    {poster && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={poster}
                        alt={v.line1}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    <div className="absolute inset-0 flex items-center justify-center text-2xl text-ink2 opacity-80 transition group-hover:opacity-100">
                      ▶
                    </div>
                    <div className="absolute right-1.5 bottom-1.5 left-1.5 truncate text-[10px] font-medium text-ink uppercase tracking-wider drop-shadow">
                      {v.line1}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="px-4 pb-5 text-[12px] text-muted">No videos yet.</div>
        )}
      </div>
    </>
  );
}
