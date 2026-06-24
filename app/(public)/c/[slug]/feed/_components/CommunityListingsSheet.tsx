/**
 * CommunityListingsSheet — Scenario B · L2
 *
 * Phase 34b (V1 redo, 2026-06-17). Bottom sheet that opens when the buyer
 * taps the "🏠 N homes here" chip on a community video feed. Vertical
 * scrollable list of every published listing in the community. Tapping
 * a row opens L3 (CommunityListingCarousel) at that listing.
 *
 * Content rule (no fake data): only schema-real fields render — price,
 * beds, baths, sqft, address. If a value is null it is simply omitted.
 *
 * UX:
 * - Backdrop mask dismisses.
 * - Esc closes (desktop a11y).
 * - Body scroll locked while open.
 * - Header `×` is ≥ 44×44.
 */
'use client';

import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { useEffect } from 'react';
import type { CommunityListingItem } from '../CommunityVideoFeed';

interface Props {
  open: boolean;
  communityName: string;
  listings: CommunityListingItem[];
  onClose: () => void;
  onOpenListing: (startIndex: number) => void;
}

function formatPrice(n: number | null): string {
  if (n == null) return '';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

function formatBedBathSqft(l: CommunityListingItem): string {
  const parts: string[] = [];
  if (l.beds != null) parts.push(`${l.beds} bd`);
  if (l.baths != null) parts.push(`${l.baths} ba`);
  if (l.sqft != null) parts.push(`${l.sqft.toLocaleString()} sqft`);
  return parts.join(' · ');
}

export function CommunityListingsSheet({
  open,
  communityName,
  listings,
  onClose,
  onOpenListing,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <button
        type="button"
        aria-label="Close listings"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity ${
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Homes in ${communityName}`}
        className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl border-line border-t bg-bg text-ink shadow-2xl transition-transform duration-300 ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-surface/30" />
        </div>

        <div className="flex items-start justify-between gap-3 px-4 pb-3">
          <div className="min-w-0">
            <h2 className="font-serif text-xl leading-tight">Homes in {communityName}</h2>
            <p className="mt-0.5 text-[12px] text-ink2">
              {listings.length} {listings.length === 1 ? 'active listing' : 'active listings'}
              {listings.length > 0 && ' · sorted by newest'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink2 transition-colors hover:bg-surface/10 hover:text-ink"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          {listings.length === 0 ? (
            <div className="px-4 py-12 text-center text-[13px] text-ink2">
              No homes for sale in this community yet.
            </div>
          ) : (
            <ul className="divide-y divide-cream/10">
              {listings.map((l, idx) => {
                let poster: string | null = null;
                if (l.heroCfVideoId) {
                  try {
                    poster = thumbnailUrl(l.heroCfVideoId);
                  } catch {
                    poster = null;
                  }
                }
                if (!poster && l.heroPhotoUrl) poster = l.heroPhotoUrl;

                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => onOpenListing(idx)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface/5"
                    >
                      <div className="relative aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-lg bg-surface ring-1 ring-line">
                        {poster ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={poster}
                            alt={l.address}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted text-xs">
                            —
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        {l.price != null && (
                          <div className="font-semibold text-ink text-base">
                            {formatPrice(l.price)}
                          </div>
                        )}
                        <div className="mt-0.5 truncate text-[13px] text-ink2">{l.address}</div>
                        <div className="truncate text-[12px] text-ink2">
                          {l.city}, {l.state}
                        </div>
                        {(l.beds != null || l.baths != null || l.sqft != null) && (
                          <div className="mt-1 text-[12px] text-ink2">{formatBedBathSqft(l)}</div>
                        )}
                      </div>
                      <div className="text-muted" aria-hidden="true">
                        ›
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
