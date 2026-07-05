'use client';

/**
 * CaptionCard — the floating glass caption + a11y bottom sheet used by
 * both the photo Card and the video Card in BrowseFeed.
 *
 * Phase 74 (2026-07-05):
 *   Owner ask: current left-bottom text block sits directly on the photo/
 *   video with nothing but a `drop-shadow`, so on light hero frames the
 *   contrast drops well below WCAG AA. The description also expanded
 *   inline and covered the media.
 *
 *   New shape (variant C — floating glass):
 *     - Compact frosted-glass card holds price / address / specs / agent.
 *     - "More ↑" button opens a light bottom-sheet with the full
 *       description, schools/POIs (photo cards), and an agent card.
 *       Sheet surface is #FBF8F3 with #0E1116 text ≈ 15.9:1 (AAA).
 *     - Sheet drapes over the media instead of expanding inline, so the
 *       photo/video is fully visible while collapsed.
 *
 *   Type sizes are lifted to WCAG AA: price 28px semibold serif,
 *   address 15px semibold, specs 13px medium, description 14px regular.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Listing = {
  address: string;
  city: string;
  state: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  description: string[];
};

type Agent = {
  slug: string;
  name: string;
};

type School = { name: string; grades: string | null; rating: number | null };
type Poi = { name: string; distance_text: string | null };

export function CaptionCard({
  listing,
  agent,
  schools,
  pois,
  formatPrice,
}: {
  listing: Listing;
  agent: Agent;
  schools?: School[];
  pois?: Poi[];
  /** Same helper BrowseFeed uses; passed in so we don't fork the format. */
  formatPrice: (n: number | null) => string;
}) {
  const [open, setOpen] = useState(false);
  const hasDescription = listing.description.length > 0;
  const firstDesc = listing.description[0] ?? '';
  const hasSchools = (schools?.length ?? 0) > 0;
  const hasPois = (pois?.length ?? 0) > 0;

  // Lock body scroll while sheet is open so the feed pager doesn't hijack
  // the sheet's own scroll gestures.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* Floating glass caption. `right-20` reserves the right rail for
       * Like/Save/Contact/Share icons — matches video Card layout. */}
      <div
        className="absolute right-20 left-4 z-30"
        style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div
          className="rounded-2xl border border-cream/10 bg-ink/60 px-4 py-3 text-cream shadow-[0_10px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl backdrop-saturate-150"
          style={{ WebkitBackdropFilter: 'blur(24px) saturate(1.5)' }}
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <div className="font-serif font-semibold text-2xl leading-none tracking-tight">
              {formatPrice(listing.price)}
            </div>
            <div className="font-medium text-[13px] text-cream/80 leading-tight tracking-wide">
              {[
                listing.beds != null ? `${listing.beds} bd` : null,
                listing.baths != null ? `${listing.baths} ba` : null,
                listing.sqft != null ? `${listing.sqft.toLocaleString()} sqft` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          <div className="mt-1 font-semibold text-[15px] leading-snug">
            {listing.address}
          </div>
          <div className="font-medium text-[13px] text-cream/75 leading-snug">
            {listing.city}, {listing.state}
          </div>

          {hasDescription && (
            <div className="mt-2 line-clamp-1 text-[14px] text-cream/90 leading-snug">
              {firstDesc}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between gap-2 border-cream/10 border-t pt-2">
            <Link
              href={`/a/${agent.slug}`}
              className="inline-flex items-center gap-2 font-medium text-[13px] text-cream/85 hover:text-cream"
              onClick={(e) => e.stopPropagation()}
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full bg-cream/20 font-semibold text-[10px]"
                aria-hidden
              >
                {(agent.name[0] ?? 'A').toUpperCase()}
              </span>
              Listed by {agent.name}
            </Link>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(true);
              }}
              className="inline-flex items-center gap-1 rounded-full font-semibold text-[13px] text-cream hover:opacity-80"
              aria-haspopup="dialog"
              aria-expanded={open}
            >
              More <span aria-hidden>↑</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom sheet — light surface (#FBF8F3) + ink text = 15.9:1 (AAA). */}
      {open && (
        <div
          className="absolute inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label={`Details for ${listing.address}`}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label="Close details"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute right-0 bottom-0 left-0 flex max-h-[82%] flex-col rounded-t-3xl bg-[#FBF8F3] text-ink shadow-[0_-20px_60px_rgba(0,0,0,0.4)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Grabber */}
            <div
              className="mx-auto mt-2.5 h-[5px] w-10 flex-shrink-0 rounded-full bg-black/20"
              aria-hidden
            />
            {/* Header */}
            <div className="flex flex-shrink-0 items-baseline justify-between gap-3 border-black/[.08] border-b px-5 pt-3 pb-3">
              <div className="font-serif font-semibold text-[26px] leading-none">
                {formatPrice(listing.price)}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="-mr-2 rounded-lg px-2 py-1 font-medium text-[22px] text-black/60 leading-none hover:bg-black/[.05]"
              >
                ✕
              </button>
            </div>
            {/* Body */}
            <div className="flex-1 overflow-auto px-5 pt-4 pb-8">
              <div className="font-semibold text-[17px] leading-snug">
                {listing.address}
              </div>
              <div className="mt-0.5 font-medium text-[15px] text-black/65 leading-snug">
                {listing.city}, {listing.state}
              </div>

              {hasDescription && (
                <section className="mt-5">
                  <h3 className="font-semibold text-[12px] text-black/60 uppercase tracking-[0.06em]">
                    About this home
                  </h3>
                  <div className="mt-2 space-y-2.5 text-[15px] leading-relaxed">
                    {listing.description.map((p, i) => (
                      <p key={`${i}-${p.slice(0, 16)}`}>{p}</p>
                    ))}
                  </div>
                </section>
              )}

              {(hasSchools || hasPois) && (
                <section className="mt-5">
                  <h3 className="font-semibold text-[12px] text-black/60 uppercase tracking-[0.06em]">
                    Nearby
                  </h3>
                  <div className="mt-2 flex flex-col gap-2">
                    {schools?.map((s) => (
                      <div
                        key={`sch:${s.name}`}
                        className="flex items-center justify-between gap-3 rounded-xl bg-black/[.04] px-3 py-2.5 text-[14px]"
                      >
                        <span>🏫 {s.name}</span>
                        {s.rating != null && (
                          <span className="font-semibold tabular-nums">
                            {s.rating}/10
                          </span>
                        )}
                      </div>
                    ))}
                    {pois?.map((p) => (
                      <div
                        key={`poi:${p.name}`}
                        className="flex items-center justify-between gap-3 rounded-xl bg-black/[.04] px-3 py-2.5 text-[14px]"
                      >
                        <span>📍 {p.name}</span>
                        {p.distance_text && (
                          <span className="font-medium text-black/60">
                            {p.distance_text}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="mt-5">
                <h3 className="font-semibold text-[12px] text-black/60 uppercase tracking-[0.06em]">
                  Listed by
                </h3>
                <Link
                  href={`/a/${agent.slug}`}
                  className="mt-2 flex items-center gap-3 rounded-2xl bg-black/[.04] p-3 hover:bg-black/[.06]"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#c4a584] font-semibold text-[16px] text-white">
                    {(agent.name[0] ?? 'A').toUpperCase()}
                  </span>
                  <div>
                    <div className="font-semibold text-[15px]">{agent.name}</div>
                    <div className="mt-0.5 font-medium text-[13px] text-black/60">
                      Vicinity Realty
                    </div>
                  </div>
                </Link>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
