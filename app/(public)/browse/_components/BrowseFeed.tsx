'use client';

/**
 * BrowseFeed — vertical scroll-snap discovery feed across listings.
 *
 * Like VideoFeed, but each card is a *different* listing's hero video, and
 * the right rail nudges the user toward the full listing page (View home →)
 * or contacting that listing's agent (mailto / tel).
 *
 * Mount window = ±1 around the active card to keep memory bounded for long
 * sessions. Heart-pop animation propagated from parent via likeAnimKey.
 */

import { hlsUrl, thumbnailUrl } from '@/lib/cloudflare/stream';
import Hls from 'hls.js';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

export type BrowseCard = {
  id: string;
  cfVideoId: string;
  kind: string;
  title: string | null;
  listing: {
    id: string;
    slug: string;
    address: string;
    city: string;
    state: string;
    price: number | null;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
  };
  agent: {
    slug: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
};

function HeartIcon({ filled, size = 26 }: { filled?: boolean; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
    >
      <path d="M12 21s-7.5-4.55-9.5-9.5C1.13 8.36 3.36 5 6.5 5c1.87 0 3.5 1 5 2.5C13 6 14.63 5 16.5 5c3.14 0 5.37 3.36 4 6.5C19.5 16.45 12 21 12 21z" />
    </svg>
  );
}

function HomeIcon({ size = 22 }: { size?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d="M12 3l9 8h-3v9h-4v-6h-4v6H6v-9H3l9-8z" />
    </svg>
  );
}

function ShareIcon({ size = 22 }: { size?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z" />
    </svg>
  );
}

function MessageIcon({ size = 22 }: { size?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d="M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h10c.55 0 1-.45 1-1z" />
    </svg>
  );
}

function PlayIcon({ size = 32 }: { size?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function formatPrice(n: number | null): string {
  if (n == null) return '';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

function ActionButton({
  onClick,
  href,
  label,
  active,
  badge,
  children,
}: {
  onClick?: () => void;
  href?: string;
  label: string;
  active?: boolean;
  badge?: string | number;
  children: React.ReactNode;
}) {
  const cls = `flex h-12 w-12 items-center justify-center rounded-full border backdrop-blur transition ${
    active
      ? 'border-gold/70 bg-gold/20 text-gold'
      : 'border-cream/20 bg-ink/40 text-cream hover:border-cream/50'
  }`;
  const inner = (
    <div className="flex flex-col items-center gap-1">
      <span className="relative">
        <span className={cls}>{children}</span>
        {badge ? (
          <span className="-right-1 -top-1 absolute rounded-full bg-gold px-1.5 py-0.5 font-semibold text-[9px] text-ink leading-none tabular-nums">
            {badge}
          </span>
        ) : null}
      </span>
      <span className="font-medium text-[10px] text-cream/80">{label}</span>
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block" aria-label={label}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className="block" aria-label={label}>
      {inner}
    </button>
  );
}

interface CardProps {
  card: BrowseCard;
  shouldMount: boolean;
  isActive: boolean;
  cardRef: (el: HTMLElement | null) => void;
}

function Card({ card, shouldMount, isActive, cardRef }: CardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [paused, setPaused] = useState(true);

  let poster: string | null = null;
  try {
    poster = thumbnailUrl(card.cfVideoId);
  } catch {
    poster = null;
  }

  useEffect(() => {
    if (!shouldMount) return;
    const video = videoRef.current;
    if (!video) return;

    let src: string;
    try {
      src = hlsUrl(card.cfVideoId);
    } catch {
      return;
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
    } else if (Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 20, maxMaxBufferLength: 30 });
      hls.loadSource(src);
      hls.attachMedia(video);
      hlsRef.current = hls;
    } else {
      video.src = src;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.removeAttribute('src');
      video.load();
    };
  }, [shouldMount, card.cfVideoId]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isActive && shouldMount) {
      v.muted = true;
      v.play()
        .then(() => setPaused(false))
        .catch(() => setPaused(true));
    } else {
      v.pause();
      setPaused(true);
    }
  }, [isActive, shouldMount]);

  const onTap = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play()
        .then(() => setPaused(false))
        .catch(() => {});
    } else {
      v.pause();
      setPaused(true);
    }
  };

  return (
    <section
      ref={(el) => cardRef(el)}
      className="relative h-screen w-full snap-start snap-always overflow-hidden bg-black"
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: tap-to-play */}
      <div className="absolute inset-0" onClick={onTap}>
        {shouldMount ? (
          <video
            ref={videoRef}
            poster={poster ?? undefined}
            className="h-full w-full object-cover"
            playsInline
            muted
            loop
            autoPlay={isActive}
            preload="metadata"
          />
        ) : poster ? (
          <img src={poster} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>

      {/* Top + bottom gradients for legibility */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 via-black/30 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

      {/* Top-left price + address (Playfair) */}
      <div className="absolute top-6 left-5 max-w-[70%]">
        <div className="font-serif text-3xl text-cream tracking-tight drop-shadow">
          {formatPrice(card.listing.price)}
        </div>
        <div className="mt-1 text-cream/90 text-sm leading-snug drop-shadow">
          {card.listing.address}
        </div>
        <div className="text-cream/70 text-xs">
          {card.listing.city}, {card.listing.state}
        </div>
      </div>

      {/* Play overlay when paused */}
      {paused && shouldMount && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-black/40 text-cream backdrop-blur">
            <PlayIcon size={36} />
          </div>
        </div>
      )}

      {/* Bottom-left: agent + specs */}
      <div className="absolute bottom-6 left-5 right-24 text-cream">
        <div className="flex items-center gap-2 text-cream/70 text-xs">
          {card.listing.beds != null && <span>{card.listing.beds} bd</span>}
          {card.listing.baths != null && <span>· {card.listing.baths} ba</span>}
          {card.listing.sqft != null && <span>· {card.listing.sqft.toLocaleString()} sqft</span>}
        </div>
        <Link
          href={`/a/${card.agent.slug}`}
          className="mt-1 inline-block text-cream/80 text-xs hover:text-gold"
        >
          Listed by {card.agent.name}
        </Link>
      </div>
    </section>
  );
}

export function BrowseFeed({ cards }: { cards: BrowseCard[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [likeAnimKey, setLikeAnimKey] = useState(0);
  const cardRefs = useRef<Map<number, HTMLElement>>(new Map());
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > 0.6) {
            const idxAttr = (e.target as HTMLElement).dataset.idx;
            if (idxAttr) setActiveIndex(Number(idxAttr));
          }
        }
      },
      { root, threshold: [0.6] },
    );
    // biome-ignore lint/complexity/noForEach: Map iteration is cleanest with forEach
    cardRefs.current.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const setCardRef = useCallback((idx: number, el: HTMLElement | null) => {
    if (!el) {
      cardRefs.current.delete(idx);
      return;
    }
    el.dataset.idx = String(idx);
    cardRefs.current.set(idx, el);
  }, []);

  const active = cards[activeIndex];
  const activeListing = active?.listing;
  const activeAgent = active?.agent;
  const isLiked = active ? !!liked[active.listing.id] : false;

  const toggleLike = useCallback(() => {
    if (!active) return;
    const id = active.listing.id;
    const wasLiked = !!liked[id];
    setLiked((m) => ({ ...m, [id]: !wasLiked }));
    if (!wasLiked) setLikeAnimKey((n) => n + 1);
  }, [active, liked]);

  const onShare = useCallback(async () => {
    if (!active) return;
    const url = `${window.location.origin}/v/${active.agent.slug}/${active.listing.slug}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: active.listing.address, url });
        return;
      } catch {
        /* fall through to clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      alert('Link copied');
    } catch {
      window.prompt('Copy link', url);
    }
  }, [active]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      <div
        ref={scrollerRef}
        className="h-full w-full snap-y snap-mandatory overflow-y-scroll overscroll-contain"
        style={{ scrollSnapType: 'y mandatory' }}
      >
        {cards.map((card, idx) => (
          <Card
            key={card.id}
            card={card}
            shouldMount={Math.abs(idx - activeIndex) <= 1}
            isActive={idx === activeIndex}
            cardRef={(el) => setCardRef(idx, el)}
          />
        ))}
      </div>

      {/* Right rail */}
      <div className="absolute right-3 bottom-24 z-20 flex flex-col items-center gap-3">
        <div key={likeAnimKey} className={likeAnimKey > 0 ? 'heart-pop' : ''}>
          <ActionButton label="Like" onClick={toggleLike} active={isLiked}>
            <HeartIcon filled={isLiked} />
          </ActionButton>
        </div>
        {activeAgent && activeListing && (
          <ActionButton label="View home" href={`/v/${activeAgent.slug}/${activeListing.slug}`}>
            <HomeIcon />
          </ActionButton>
        )}
        <ActionButton label="Share" onClick={onShare}>
          <ShareIcon />
        </ActionButton>
        {activeAgent && (activeAgent.email || activeAgent.phone) && (
          <ActionButton
            label="Contact"
            href={
              activeAgent.email
                ? `mailto:${activeAgent.email}?subject=${encodeURIComponent(
                    `Interested in ${activeListing?.address ?? 'your listing'}`,
                  )}`
                : `tel:${activeAgent.phone ?? ''}`
            }
          >
            <MessageIcon />
          </ActionButton>
        )}
      </div>

      {/* Card progress dots (cap to ~10 visible to avoid clutter) */}
      {cards.length > 1 && cards.length <= 12 && (
        <div className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 gap-1">
          {cards.map((c, i) => (
            <span
              key={c.id}
              className={`h-1 rounded-full transition-all ${
                i === activeIndex ? 'w-6 bg-cream' : 'w-3 bg-cream/30'
              }`}
            />
          ))}
        </div>
      )}

      {/* First-card scroll cue */}
      {activeIndex === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 z-10 text-center">
          <span className="text-[10px] text-cream/50 uppercase tracking-widest">
            Swipe up for more
          </span>
        </div>
      )}
    </div>
  );
}
