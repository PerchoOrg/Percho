'use client';

/**
 * CaptionCard — immersive text overlay + light bottom sheet.
 *
 * Phase 74.2 (2026-07-05): owner tuning after 74.1 landed.
 *   - Price 30 -> 26px, "有点晃眼睛"
 *   - Merge address + city/state into ONE line: "7920 NE 26th St Medina, WA"
 *   - Line 4: first ~40 chars of description + "...more" toggle
 * (schema has no zip -> we omit the trailing 98039 from owner's example.)
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Listing = {
  address: string;
  city: string;
  state: string;
  zip: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  description: string[];
};

type Agent = { slug: string; name: string };
type School = { name: string; grades: string | null; rating: number | null };
type Poi = { name: string; distance_text: string | null };

const DESCRIPTION_PREVIEW_CHARS = 40;

function formatPriceFull(n: number | null): string {
  if (n == null) return '';
  return `$${n.toLocaleString('en-US')}`;
}

function firstDescriptionLine(paragraphs: string[]): string {
  const raw = paragraphs.find((p) => p.trim().length > 0);
  if (!raw) return '';
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= DESCRIPTION_PREVIEW_CHARS) return collapsed;
  const cut = collapsed.slice(0, DESCRIPTION_PREVIEW_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd();
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
  const preview = firstDescriptionLine(listing.description);
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

  const addressLine = `${listing.address}, ${listing.city}, ${listing.state}${listing.zip ? ` ${listing.zip}` : ''}`.trim();

  const openSheet = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(true);
  };

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
        <div className="font-bold text-[26px] leading-none tracking-tight tabular-nums">
          {formatPriceFull(listing.price)}
        </div>
        <div className="mt-1.5 text-[13px] leading-snug">
          {specs}
        </div>
        <div className="mt-1 text-[13px] leading-snug">
          {addressLine}
        </div>
        {hasDescription && preview.length > 0 && (
          <div className="mt-1.5 text-[13px] text-cream/95 leading-snug">
            <span>{preview}</span>
            <button
              type="button"
              onClick={openSheet}
              className="ml-1 font-semibold text-cream/95 hover:text-cream"
              aria-haspopup="dialog"
              aria-expanded={open}
            >
              … more
            </button>
          </div>
        )}
        {(!hasDescription || preview.length === 0) && (
          <button
            type="button"
            onClick={openSheet}
            className="mt-2 inline-flex items-center gap-1 font-semibold text-[13px] text-cream/95 hover:text-cream"
            aria-haspopup="dialog"
            aria-expanded={open}
          >
            More <span aria-hidden>↑</span>
          </button>
        )}
      </div>

      {open && (
        <>
          {/* Tap-outside catcher: transparent full-screen button above the
           * sheet (z-40) that closes the sheet without triggering video's
           * tap-to-pause. Sheet sits at z-50 with stopPropagation so its
           * own clicks don't bubble here. */}
          <button
            type="button"
            aria-label="Close details"
            className="absolute inset-0 z-40 cursor-default bg-transparent"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Details for ${listing.address}`}
            className="absolute right-0 bottom-0 left-0 z-50 flex max-h-[62%] flex-col rounded-t-3xl bg-[#FBF8F3] text-ink shadow-[0_-20px_60px_rgba(0,0,0,0.4)]"
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
              <div className="text-[15px] leading-snug">
                {specs}
              </div>
              <div className="mt-2 text-[15px] leading-snug">
                {addressLine}
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

              <section className="mt-5 flex justify-end">
                <Link
                  href={`/a/${agent.slug}`}
                  className="group inline-flex items-center gap-1 text-[13px] text-black/60 transition-colors hover:text-black/90"
                >
                  <span>Listed by</span>
                  <span className="font-medium text-[#8b6b3f] underline decoration-[#c4a584]/50 decoration-1 underline-offset-[3px] group-hover:decoration-[#8b6b3f]">
                    {agent.name}
                  </span>
                  <span
                    aria-hidden
                    className="text-[#8b6b3f] transition-transform group-hover:translate-x-0.5"
                  >
                    ›
                  </span>
                </Link>
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
