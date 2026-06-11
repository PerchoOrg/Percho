'use client';

/**
 * BrowseFeed — vertical scroll-snap discovery feed across listings.
 *
 * v3 (demo parity): each card carries hero + schools/nearby/community
 * b-roll videos. The right rail's Schools / Nearby / Community buttons
 * switch the *active* card's playing video to the matching source. Tapping
 * the same source again cycles to the next b-roll in that pool. Cards
 * default to hero. The button glows gold while a non-hero source is active.
 */

import { Logo } from '@/app/_components/Logo';
import { hlsUrl, thumbnailUrl } from '@/lib/cloudflare/stream';
import Hls from 'hls.js';
import Link from 'next/link';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type BrowseSourceVideo = {
  cfVideoId: string;
  line1: string;
  line2?: string;
};

export type BrowseCard = {
  id: string;
  hero: { cfVideoId: string };
  /**
   * Optional richer hero pool — when set, the 'hero' source cycles through
   * these videos (horizontal swipe / repeat-tap Hero source on the rail).
   * Used by `/v/[agent]/[listing]` to expose multi-walkthrough listings;
   * `/browse` doesn't set this (single hero per card by design).
   */
  heroVideos?: BrowseSourceVideo[];
  schoolVideos: BrowseSourceVideo[];
  nearbyVideos: BrowseSourceVideo[];
  communityVideos: BrowseSourceVideo[];
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

type Source = 'hero' | 'schools' | 'nearby' | 'community';

function HeartIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={26}
      height={26}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
    >
      <path d="M12 21s-7.5-4.55-9.5-9.5C1.13 8.36 3.36 5 6.5 5c1.87 0 3.5 1 5 2.5C13 6 14.63 5 16.5 5c3.14 0 5.37 3.36 4 6.5C19.5 16.45 12 21 12 21z" />
    </svg>
  );
}

function SchoolIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={22} height={22} fill="currentColor">
      <path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z" />
    </svg>
  );
}

function NearbyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={22} height={22} fill="currentColor">
      <path d="M11 17a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM12 2a8 8 0 0 0-8 8c0 5.5 8 12 8 12s8-6.5 8-12a8 8 0 0 0-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" />
    </svg>
  );
}

function CommunityIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={22} height={22} fill="currentColor">
      <path d="M12 3l9 8h-3v9h-4v-6h-4v6H6v-9H3l9-8z" />
    </svg>
  );
}

// HomeIcon removed (2026-06-10) — rail "Home" button retired.

function SoundOnIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={22} height={22} fill="currentColor">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05a4.5 4.5 0 0 0 2.5-4.02zM14 3.23v2.06A7 7 0 0 1 14 18.71v2.06A9 9 0 0 0 14 3.23z" />
    </svg>
  );
}

function SoundOffIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={22} height={22} fill="currentColor">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.59 3L19 9.41 17.59 8 15 10.59 12.41 8 11 9.41 13.59 12 11 14.59 12.41 16 15 13.41 17.59 16 19 14.59 16.59 12z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={22} height={22} fill="currentColor">
      <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={22} height={22} fill="currentColor">
      <path d="M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h10c.55 0 1-.45 1-1z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={36} height={36} fill="currentColor">
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
  disabled,
  badge,
  children,
}: {
  onClick?: () => void;
  href?: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  badge?: string | number;
  children: ReactNode;
}) {
  const cls = `flex h-12 w-12 items-center justify-center rounded-full border backdrop-blur transition ${
    active
      ? 'border-gold/70 bg-gold/20 text-gold'
      : disabled
        ? 'border-cream/10 bg-ink/30 text-cream/30'
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
  if (href && !disabled) {
    return (
      <Link
        href={href}
        className="block"
        aria-label={label}
        style={{ touchAction: 'manipulation' }}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      className="block"
      aria-label={label}
      style={{ touchAction: 'manipulation' }}
      disabled={disabled}
    >
      {inner}
    </button>
  );
}

interface CardProps {
  card: BrowseCard;
  source: Source;
  cycleIdx: number;
  shouldMount: boolean;
  isActive: boolean;
  cardRef: (el: HTMLElement | null) => void;
  paused: boolean;
  setPaused: (b: boolean) => void;
  onSwipe: (delta: 1 | -1) => void;
  poolSize: number;
  /** Global mute state from parent feed — propagated to <video> on every render. */
  muted: boolean;
}

function poolFor(card: BrowseCard, source: Source): number {
  if (source === 'schools') return card.schoolVideos.length;
  if (source === 'nearby') return card.nearbyVideos.length;
  if (source === 'community') return card.communityVideos.length;
  // hero: count heroVideos pool if provided, else 1 (single hero).
  return card.heroVideos && card.heroVideos.length > 0 ? card.heroVideos.length : 1;
}

function pickVideo(card: BrowseCard, source: Source, cycleIdx: number): BrowseSourceVideo {
  if (source === 'schools' && card.schoolVideos.length > 0) {
    return card.schoolVideos[cycleIdx % card.schoolVideos.length] as BrowseSourceVideo;
  }
  if (source === 'nearby' && card.nearbyVideos.length > 0) {
    return card.nearbyVideos[cycleIdx % card.nearbyVideos.length] as BrowseSourceVideo;
  }
  if (source === 'community' && card.communityVideos.length > 0) {
    return card.communityVideos[cycleIdx % card.communityVideos.length] as BrowseSourceVideo;
  }
  // hero: use heroVideos pool if provided, else fall back to single hero.
  if (card.heroVideos && card.heroVideos.length > 0) {
    return card.heroVideos[cycleIdx % card.heroVideos.length] as BrowseSourceVideo;
  }
  return {
    cfVideoId: card.hero.cfVideoId,
    line1: card.listing.address,
    line2: `${card.listing.city}, ${card.listing.state}`,
  };
}

function Card({
  card,
  source,
  cycleIdx,
  shouldMount,
  isActive,
  cardRef,
  paused,
  setPaused,
  onSwipe,
  poolSize,
  muted,
}: CardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const sel = useMemo(() => pickVideo(card, source, cycleIdx), [card, source, cycleIdx]);

  let poster: string | null = null;
  try {
    poster = thumbnailUrl(sel.cfVideoId);
  } catch {
    poster = null;
  }

  // (Re)attach HLS when mount or selected video changes.
  useEffect(() => {
    if (!shouldMount) return;
    const video = videoRef.current;
    if (!video) return;

    let src: string;
    try {
      src = hlsUrl(sel.cfVideoId);
    } catch {
      return;
    }

    // Tear down previous attachment first.
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    video.removeAttribute('src');
    video.load();

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
    };
  }, [shouldMount, sel.cfVideoId]);

  // Play/pause on active changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sel.cfVideoId triggers replay after source switch
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isActive && shouldMount) {
      v.muted = muted;
      v.play()
        .then(() => setPaused(false))
        .catch(() => setPaused(true));
    } else {
      v.pause();
      setPaused(true);
    }
  }, [isActive, shouldMount, setPaused, sel.cfVideoId]);

  // Keep <video>.muted in sync with the global mute toggle while the card
  // is mounted (parent flips it from the Sound button).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
  }, [muted]);

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

  const overlayLine1 = source === 'hero' ? null : sel.line1;
  const overlayLine2 = source === 'hero' ? null : sel.line2;

  return (
    <section
      ref={(el) => cardRef(el)}
      className="relative h-screen w-full snap-start snap-always overflow-hidden bg-black"
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: tap-to-play */}
      <div
        className="absolute inset-0 touch-pan-y"
        onClick={onTap}
        onTouchStart={(e) => {
          if (e.touches.length !== 1) return;
          const t = e.touches[0];
          if (t) touchStartRef.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          const start = touchStartRef.current;
          touchStartRef.current = null;
          if (!start) return;
          const t = e.changedTouches[0];
          if (!t) return;
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          // Treat as horizontal swipe only if |dx| dominant + threshold met
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            e.preventDefault();
            e.stopPropagation();
            onSwipe(dx < 0 ? 1 : -1);
          }
        }}
      >
        {shouldMount ? (
          <video
            ref={videoRef}
            poster={poster ?? undefined}
            className="h-full w-full object-cover"
            playsInline
            muted
            loop
            preload="metadata"
          />
        ) : poster ? (
          <img src={poster} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 via-black/30 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

      {/* Top-left price + address */}
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

      {/* Source overlay (schools/nearby/community) */}
      {overlayLine1 && (
        <div className="absolute top-28 left-5 max-w-[70%] rounded-lg border border-cream/20 bg-ink/60 px-3 py-2 backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <div className="text-cream text-sm">{overlayLine1}</div>
            {poolSize > 1 && (
              <div className="rounded-full bg-cream/15 px-2 py-0.5 font-medium text-[10px] text-cream/90 tabular-nums">
                {(cycleIdx % poolSize) + 1}/{poolSize}
              </div>
            )}
          </div>
          {overlayLine2 && <div className="mt-0.5 text-cream/70 text-xs">{overlayLine2}</div>}
          {poolSize > 1 && (
            <div className="mt-1 text-[10px] text-cream/40 uppercase tracking-wider">← swipe →</div>
          )}
        </div>
      )}

      {paused && shouldMount && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-black/40 text-cream backdrop-blur">
            <PlayIcon />
          </div>
        </div>
      )}

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

export function BrowseFeed({
  cards,
  onContact,
}: {
  cards: BrowseCard[];
  /**
   * Optional override for the Contact rail button. When set, clicking
   * Contact calls this with the active card instead of falling through to
   * mailto:/tel:. `/v/[agent]/[listing]` uses this to open LeadModal.
   */
  onContact?: (card: BrowseCard) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [likeAnimKey, setLikeAnimKey] = useState(0);
  // per-card source + cycle index. key = listing.id
  const [sourceByCard, setSourceByCard] = useState<Record<string, Source>>({});
  const [cycleByCard, setCycleByCard] = useState<Record<string, number>>({});
  const [pausedActive, setPausedActive] = useState(true);
  // Global mute state — once the user unmutes, every card stays unmuted as
  // they swipe. Browser autoplay policy forces initial muted=true; we flip
  // false on first explicit user gesture (the Sound button).
  const [muted, setMuted] = useState(true);
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
  const activeId = active?.listing.id;
  const activeSource: Source = activeId ? (sourceByCard[activeId] ?? 'hero') : 'hero';
  const activeCycle = activeId ? (cycleByCard[activeId] ?? 0) : 0;
  const isLiked = activeId ? !!liked[activeId] : false;
  void activeCycle; // kept for symmetry; per-card cycle read inside Card via cycleByCard

  const switchSource = useCallback(
    (s: Source) => {
      if (!active) return;
      const id = active.listing.id;
      setSourceByCard((prev) => {
        const cur = prev[id] ?? 'hero';
        // Same source tapped again → cycle next b-roll
        if (cur === s) {
          setCycleByCard((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
          return prev;
        }
        // New source → reset cycle
        setCycleByCard((c) => ({ ...c, [id]: 0 }));
        return { ...prev, [id]: s };
      });
    },
    [active],
  );

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
        /* fall through */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      alert('Link copied');
    } catch {
      window.prompt('Copy link', url);
    }
  }, [active]);

  const hasSchools = (active?.schoolVideos.length ?? 0) > 0;
  const hasNearby = (active?.nearbyVideos.length ?? 0) > 0;
  const hasCommunity = (active?.communityVideos.length ?? 0) > 0;

  // Keyboard: ←/→ cycle b-roll within current source, Esc returns to hero.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!active) return;
      if (e.key === 'Escape' && activeSource !== 'hero') {
        e.preventDefault();
        switchSource('hero');
        return;
      }
      if (activeSource === 'hero') return;
      const id = active.listing.id;
      const pool = poolFor(active, activeSource);
      if (pool <= 1) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCycleByCard((c) => {
          const cur = c[id] ?? 0;
          return { ...c, [id]: (cur + 1) % pool };
        });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCycleByCard((c) => {
          const cur = c[id] ?? 0;
          return { ...c, [id]: (((cur - 1) % pool) + pool) % pool };
        });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, activeSource, switchSource]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      {/* Logo + Back nav cluster lives top-right (see below). */}
      <div
        ref={scrollerRef}
        className="h-full w-full snap-y snap-mandatory overflow-y-scroll overscroll-contain"
        style={{ scrollSnapType: 'y mandatory' }}
      >
        {cards.map((card, idx) => {
          const id = card.listing.id;
          const cardSource = sourceByCard[id] ?? 'hero';
          const cardCycle = cycleByCard[id] ?? 0;
          const isThisActive = idx === activeIndex;
          return (
            <Card
              key={card.id}
              card={card}
              source={cardSource}
              cycleIdx={cardCycle}
              shouldMount={Math.abs(idx - activeIndex) <= 1}
              isActive={isThisActive}
              cardRef={(el) => setCardRef(idx, el)}
              paused={isThisActive ? pausedActive : true}
              setPaused={isThisActive ? setPausedActive : () => {}}
              poolSize={poolFor(card, cardSource)}
              muted={muted}
              onSwipe={(delta) => {
                // Horizontal swipe cycles within the current source's b-roll pool.
                const pool = poolFor(card, cardSource);
                if (pool <= 1) return;
                setCycleByCard((c) => {
                  const cur = c[id] ?? 0;
                  const next = (((cur + delta) % pool) + pool) % pool;
                  return { ...c, [id]: next };
                });
              }}
            />
          );
        })}
      </div>

      {/* Right rail */}
      <div className="absolute right-3 bottom-20 z-20 flex flex-col items-center gap-3">
        <div key={likeAnimKey} className={likeAnimKey > 0 ? 'heart-pop' : ''}>
          <ActionButton label="Like" onClick={toggleLike} active={isLiked}>
            <HeartIcon filled={isLiked} />
          </ActionButton>
        </div>
        <ActionButton
          label="Schools"
          onClick={() => switchSource('schools')}
          active={activeSource === 'schools'}
          disabled={!hasSchools}
          badge={hasSchools && active ? active.schoolVideos.length : undefined}
        >
          <SchoolIcon />
        </ActionButton>
        <ActionButton
          label="Nearby"
          onClick={() => switchSource('nearby')}
          active={activeSource === 'nearby'}
          disabled={!hasNearby}
          badge={hasNearby && active ? active.nearbyVideos.length : undefined}
        >
          <NearbyIcon />
        </ActionButton>
        <ActionButton
          label="Area"
          onClick={() => switchSource('community')}
          active={activeSource === 'community'}
          disabled={!hasCommunity}
        >
          <CommunityIcon />
        </ActionButton>
        {/* Hero reset removed (2026-06-10) — duplicated the in-feed
         * top-center "← Back" pill. The pill now reads "Back" and is the
         * sole way to dismiss the source switcher. The brand Logo top-left
         * handles "go to landing". */}
        <ActionButton
          label={muted ? 'Sound' : 'Mute'}
          onClick={() => setMuted((m) => !m)}
          active={!muted}
        >
          {muted ? <SoundOffIcon /> : <SoundOnIcon />}
        </ActionButton>
        <ActionButton label="Share" onClick={onShare}>
          <ShareIcon />
        </ActionButton>
        {active && (onContact || active.agent.email || active.agent.phone) && (
          <ActionButton
            label="Contact"
            {...(onContact
              ? { onClick: () => onContact(active) }
              : {
                  href: active.agent.email
                    ? `mailto:${active.agent.email}?subject=${encodeURIComponent(
                        `Interested in ${active.listing.address}`,
                      )}`
                    : `tel:${active.agent.phone ?? ''}`,
                })}
          >
            <MessageIcon />
          </ActionButton>
        )}
      </div>

      {/* Active source label — top center, informational only (no nav). */}
      {activeSource !== 'hero' && (
        <div className="-translate-x-1/2 absolute top-3 left-1/2 z-10 rounded-full border border-cream/20 bg-ink/60 px-3 py-1 backdrop-blur">
          <span className="text-cream/80 text-xs uppercase tracking-wider">
            {activeSource === 'schools' ? 'Schools' : activeSource === 'nearby' ? 'Nearby' : 'Area'}
          </span>
        </div>
      )}

      {/* Top-right nav cluster: [← Back] (when on a b-roll source) + [Logo] (always).
       * Side-by-side per user feedback: 'Back' returns to the hero video (in-feed
       * navigation), Logo returns to landing page (global nav). */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
        {activeSource !== 'hero' && (
          <button
            type="button"
            onClick={() => switchSource('hero')}
            aria-label="Back to listing video"
            className="flex h-9 items-center rounded-full border border-cream/20 bg-ink/55 px-3 text-cream text-xs backdrop-blur-md transition-colors hover:border-gold hover:text-gold"
            style={{ touchAction: 'manipulation' }}
          >
            ← Back
          </button>
        )}
        <Logo variant="overlay" />
      </div>

      {/* "View full listing" pill removed (2026-06-10) — user feedback:
       * "duplicate function of the same buttons below". The browse card
       * already IS the listing's hero video, and Schools/Nearby/Area/
       * Share/Contact are all reachable from the right rail; a separate
       * deep-link to /v/<agent>/<listing> read as redundant nav. Tap the
       * agent strip in the bottom-left to reach the full single-listing
       * feed if needed (handled in Card render below). */}

      {activeIndex === 0 && activeSource === 'hero' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 z-10 text-center">
          <span className="text-[10px] text-cream/50 uppercase tracking-widest">
            Swipe up for more
          </span>
        </div>
      )}
    </div>
  );
}
