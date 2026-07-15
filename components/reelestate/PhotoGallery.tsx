'use client';

/**
 * <PhotoGallery> — hero photo gallery for the mobile property detail screen.
 *
 * ref: docs/design/reelestate-teardown/README.md §2.3 (Property Detail — hero
 * gallery: horizontal swipe, letterbox OK, dot indicators)
 *
 * D2.2 scope:
 *  - Horizontal snap-scroll strip (one photo per slide, native CSS
 *    scroll-snap so touch swipe feels native on iOS Safari — no JS drag
 *    library needed).
 *  - `object-contain` inside a fixed-aspect frame: reelestate shows the
 *    whole photo letterboxed rather than cropping, which is the right
 *    call for listing content where cropping loses architectural detail.
 *  - Dot indicators wired to the currently-visible slide via
 *    `IntersectionObserver` on each slide (no scroll math, no rAF loop).
 *  - Single-photo listings: no dots, no scroll.
 *  - Zero-photo listings: caller decides — this component renders `null`,
 *    so the detail page falls back to its neutral hero placeholder.
 *
 * No mock data: photos come from `fetchMobileListing` (Supabase
 * `listing_photos` join, filtered to `status='ready'`, ordered by
 * `sort_order`). A miss is handled with `null` return, not a filler image.
 */
import { useEffect, useRef, useState } from 'react';
import type { MobileListingPhoto } from '@/lib/reelestate/listing';

interface PhotoGalleryProps {
  photos: MobileListingPhoto[];
  /** Fallback address string for `alt` when a photo has no `alt_text`. */
  address: string;
}

export function PhotoGallery({ photos, address }: PhotoGalleryProps) {
  const [active, setActive] = useState(0);
  const stripRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || photos.length <= 1) return;
    const slides = Array.from(strip.querySelectorAll<HTMLElement>('[data-slide]'));
    if (slides.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        // Pick the entry with the highest intersection ratio that's >0.5.
        let best: { idx: number; ratio: number } | null = null;
        for (const e of entries) {
          if (e.intersectionRatio < 0.5) continue;
          const idx = Number((e.target as HTMLElement).dataset.slide);
          if (!best || e.intersectionRatio > best.ratio) {
            best = { idx, ratio: e.intersectionRatio };
          }
        }
        if (best) setActive(best.idx);
      },
      { root: strip, threshold: [0.5, 0.75, 1] },
    );

    for (const s of slides) io.observe(s);
    return () => io.disconnect();
  }, [photos.length]);

  if (photos.length === 0) return null;

  return (
    <section
      aria-label="Property photos"
      className="relative w-full bg-black"
      // Fixed 4:3 frame — most listing photos are landscape; contain letterboxes
      // portrait photos with matching black rails per reelestate teardown.
      style={{ aspectRatio: '4 / 3' }}
    >
      <div
        ref={stripRef}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto scroll-smooth"
        style={{ scrollbarWidth: 'none' }}
      >
        {photos.map((p, i) => (
          <div
            key={p.id}
            data-slide={i}
            className="relative h-full w-full flex-shrink-0 snap-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- listing photos are user-uploaded Supabase Storage URLs; already covered by remotePatterns but next/image loses letterbox behavior with object-contain in a non-fill container. */}
            <img
              src={p.url}
              alt={p.alt ?? address}
              className="h-full w-full object-contain"
              draggable={false}
              loading={i === 0 ? 'eager' : 'lazy'}
            />
          </div>
        ))}
      </div>

      {photos.length > 1 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5"
        >
          {photos.map((p, i) => (
            <span
              key={p.id}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === active ? 'w-4 bg-white' : 'w-1.5 bg-white/50'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
