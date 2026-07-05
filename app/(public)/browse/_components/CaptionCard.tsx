'use client';

/**
 * CaptionCard — sits on top of the photo/video with no card chrome
 * (immersive), then opens a light bottom sheet with the full details.
 *
 * Phase 74.1 (2026-07-05): owner "feed 里不要这个框 要嵌入 要沉浸".
 * Redesigned per Redfin listing screenshot supplied by owner:
 *   Line 1 — full price digits ($8,750,000), NOT abbreviated M/K, bold.
 *   Line 2 — bd · ba · sqft.
 *   Line 3 — address (street), then city/state on line 4.
 * All three lines get a `drop-shadow` so text stays legible over any
 * hero frame; no floating card, no border, no backdrop-blur.
 *
 * "More ↑" opens a light bottom sheet (surface #FBF8F3, ink text
 * ~ 15.9:1 AAA) with the description, nearby schools/POIs, and a
 * plain agent link (no fake brokerage line).
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

type Agent = { slug: string; name: string };
type School = { name: string; grades: string | null; rating: number | null };
type Poi = { name: string; distance_text: string | null };

/** Full digits, e.g. 8_750_000 -> "$8,750,000". No M/K abbreviation. */
function formatPriceFull(n: number | null): string {
  if (n == null) return '';
  return `$${n.toLocaleString('en-US')}`;
}

export function CaptionCard({
  listing,
  agent,
  schools,
  pois,
}: {
  listing: Listing;
  agent: Agent;
  schools?: School[];
  pois?: Poi[];
}) {
  const [open, setOpen] = useState(false);
  const hasDescription = listing.description.length > 0;
  const hasSchools = (schools?.length ?? 0) > 0;
  const hasPois = (pois?.length ?? 0) > 0;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const specs = [
    listing.beds != null ? `${listing.beds} bd` : null,
    listing.baths != null ? `${listing.baths} ba` : null,
    listing.sqft != null ? `${listing.sqft.toLocaleString()} sqft` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      {/* Immersive caption — no card, no border, just text with a strong
       * drop-shadow. `right-20` reserves the right rail for the action
       * icons. */}
      <div
        className="absolute right-20 left-4 z-30 text-cream"
        style={{
          bottom: 'max(1rem, env(safe-area-inset-bottom))',
          textShadow: '0 2px 8px rgba(0,0,0,0.7), 0 1px 2px rgba(0,0,0,0.5)',
        }}
      >
        <div className="font-bold text-[30px] leading-none tracking-tight tabular-nums">
          {formatPriceFull(listing.price)}
        </div>
        <div className="mt-1.5 font-semibold text-[15px] leading-snug">
          {specs}
        </div>
        <div className="mt-1 font-semibold text-[15px] leading-snug">
          {listing.address}
        </div>
        <div className="font-medium text-[13px] text-cream/85 leading-snug">
          {listing.city}, {listing.state}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          className="mt-2 inline-flex items-center gap-1 font-semibold text-[13px] text-cream/95 hover:text-cream"
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          More <span aria-hidden>↑</span>
        </button>
      </div>

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
            <div
              className="mx-auto mt-2.5 h-[5px] w-10 flex-shrink-0 rounded-full bg-black/20"
              aria-hidden
            />
            <div className="flex flex-shrink-0 items-baseline justify-between gap-3 border-black/[.08] border-b px-5 pt-3 pb-3">
              <div className="font-bold text-[24px] leading-none tabular-nums">
                {formatPriceFull(listing.price)}
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
            <div className="flex-1 overflow-auto px-5 pt-4 pb-8">
              <div className="font-semibold text-[15px] leading-snug">
                {specs}
              </div>
              <div className="mt-2 font-semibold text-[17px] leading-snug">
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
                  className="mt-2 inline-flex items-center gap-3 rounded-2xl bg-black/[.04] px-3 py-2.5 hover:bg-black/[.06]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#c4a584] font-semibold text-[14px] text-white">
                    {(agent.name[0] ?? 'A').toUpperCase()}
                  </span>
                  <span className="font-semibold text-[15px]">{agent.name}</span>
                </Link>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
