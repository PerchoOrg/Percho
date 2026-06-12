'use client';
import { hlsUrl, thumbnailUrl } from '@/lib/cloudflare/stream';
import Hls from 'hls.js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LeadModal } from '../../_components/LeadModal';

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
    /**
     * Multi-paragraph description (Phase 9). Each entry is one paragraph;
     * rendered as the bottom caption (Xiaohongshu-style), expandable on tap.
     */
    description: string[];
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

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function BookmarkIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={26}
      height={26}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={26}
      height={26}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function BackArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={22}
      height={22}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
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

/**
 * Big, high-contrast button used in the bottom action bar (Like / Save /
 * Contact). Larger tap target than the right-rail ActionButton because
 * these are the primary CTAs in the new bottom-bar pattern.
 */
function BottomBarButton({
  onClick,
  label,
  active,
  activeColor = 'text-gold',
  children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  /** Tailwind text class used when active=true (e.g. 'text-rose-400'). */
  activeColor?: string;
  children: ReactNode;
}) {
  const tone = active ? activeColor : 'text-cream';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={!!active}
      className={`flex flex-col items-center gap-0.5 ${tone} transition-colors`}
      style={{ touchAction: 'manipulation' }}
    >
      {children}
      <span className="font-medium text-[10px] tracking-wide opacity-80">{label}</span>
    </button>
  );
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
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/85 via-black/50 to-transparent" />

      {/* Source overlay (schools/nearby/community) — kept top-left so the
       * bottom area is fully owned by the Xiaohongshu-style caption block. */}
      {overlayLine1 && (
        <div className="absolute top-16 left-5 max-w-[70%] rounded-lg border border-cream/20 bg-ink/60 px-3 py-2 backdrop-blur">
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

      {/* Bottom caption block — Xiaohongshu/Douyin pattern. Sits above the
       * action bar (BrowseFeed renders the action bar at the very bottom).
       * Right-side rail is reserved for Schools/Nearby/Area/Sound. */}
      <div className="absolute bottom-20 left-4 right-20 text-cream">
        <div className="font-serif text-2xl text-cream leading-tight tracking-tight drop-shadow">
          {formatPrice(card.listing.price)}
        </div>
        <div className="mt-1 text-cream text-sm leading-snug drop-shadow">
          {card.listing.address}
        </div>
        <div className="text-cream/80 text-xs">
          {card.listing.city}, {card.listing.state}
        </div>
        <div className="mt-1 flex items-center gap-2 text-cream/80 text-xs">
          {card.listing.beds != null && <span>{card.listing.beds} bd</span>}
          {card.listing.baths != null && <span>· {card.listing.baths} ba</span>}
          {card.listing.sqft != null && <span>· {card.listing.sqft.toLocaleString()} sqft</span>}
        </div>
        {card.listing.description.length > 0 && (
          <DescriptionBlock paragraphs={card.listing.description} />
        )}
        <Link
          href={`/a/${card.agent.slug}`}
          className="mt-2 inline-block text-cream/80 text-xs hover:text-gold"
          onClick={(e) => e.stopPropagation()}
        >
          Listed by {card.agent.name}
        </Link>
      </div>
    </section>
  );
}

/**
 * Expandable description — collapsed shows first paragraph clamped to 2
 * lines with a "more" toggle; expanded reveals all paragraphs.
 */
function DescriptionBlock({ paragraphs }: { paragraphs: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const first = paragraphs[0] ?? '';
  const hasMore = paragraphs.length > 1 || first.length > 90;
  return (
    <div className="mt-2 text-cream/90 text-xs leading-relaxed">
      {expanded ? (
        <div className="space-y-1">
          {paragraphs.map((p, i) => (
            <p key={`${i}-${p.slice(0, 16)}`}>{p}</p>
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(false);
              }}
              className="text-cream/60 hover:text-gold"
            >
              less
            </button>
          )}
        </div>
      ) : (
        <p className="line-clamp-2">
          {first}
          {hasMore && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
              }}
              className="ml-1 text-cream/60 hover:text-gold"
            >
              ... more
            </button>
          )}
        </p>
      )}
    </div>
  );
}

export function BrowseFeed({
  cards,
  initialIndex = 0,
}: {
  cards: BrowseCard[];
  /**
   * Phase 9: when launched from the grid, jump straight to the clicked card.
   * Defaults to 0 (top of feed) for backwards compatibility.
   */
  initialIndex?: number;
}) {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [likeAnimKey, setLikeAnimKey] = useState(0);
  // per-card source + cycle index. key = listing.id
  const [sourceByCard, setSourceByCard] = useState<Record<string, Source>>({});
  const [cycleByCard, setCycleByCard] = useState<Record<string, number>>({});
  const [pausedActive, setPausedActive] = useState(true);
  // Global mute state — once the user unmutes, every card stays unmuted as
  // they swipe. Browser autoplay policy forces initial muted=true; we flip
  // false on first explicit user gesture (the Sound button).
  const [muted, setMuted] = useState(true);
  const [leadOpen, setLeadOpen] = useState(false);
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

  // Phase 9: when launched from the grid with ?start=<id>, jump to that
  // card without animation on first paint. Skipped when initialIndex is 0
  // (default — natural top-of-feed entry from older deep links).
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional one-shot mount effect
  useEffect(() => {
    if (initialIndex <= 0) return;
    const root = scrollerRef.current;
    const target = cardRefs.current.get(initialIndex);
    if (!root || !target) return;
    root.scrollTo({ top: target.offsetTop, behavior: 'auto' });
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
  const isSaved = activeId ? !!saved[activeId] : false;
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

  const toggleSave = useCallback(() => {
    if (!active) return;
    const id = active.listing.id;
    setSaved((m) => ({ ...m, [id]: !m[id] }));
    // TODO V2: persist saved listings to Supabase (`saved_listings` table)
    // once auth is in place. For now, in-memory only.
  }, [active]);

  const openContact = useCallback(() => {
    setLeadOpen(true);
  }, []);

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
      // Silent copy — user requested no popup after share.
    } catch {
      /* ignore — nothing else to do without clipboard access */
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

      {/* Right rail — INFO actions only (Schools / Nearby / Area / Sound).
       * Like / Save / Comment moved to the bottom action bar (Xiaohongshu
       * pattern). Share moved to the top header. Hero-back lives top-left. */}
      <div className="absolute right-3 bottom-32 z-20 flex flex-col items-center gap-3">
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
        <ActionButton
          label={muted ? 'Sound' : 'Mute'}
          onClick={() => setMuted((m) => !m)}
          active={!muted}
        >
          {muted ? <SoundOffIcon /> : <SoundOnIcon />}
        </ActionButton>
      </div>

      {/* Active source label — top center, informational only (no nav). */}
      {activeSource !== 'hero' && (
        <div className="-translate-x-1/2 absolute top-14 left-1/2 z-10 rounded-full border border-cream/20 bg-ink/60 px-3 py-1 backdrop-blur">
          <span className="text-cream/80 text-xs uppercase tracking-wider">
            {activeSource === 'schools' ? 'Schools' : activeSource === 'nearby' ? 'Nearby' : 'Area'}
          </span>
        </div>
      )}

      {/* Top header — Xiaohongshu video pattern: [Back] ... [Search] [Share].
       * Back goes to /browse (the grid). When viewing a b-roll source, Back
       * first returns to hero, then back to grid on second tap. */}
      <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-3 pt-3">
        <button
          type="button"
          onClick={() => {
            if (activeSource !== 'hero') {
              switchSource('hero');
            } else {
              router.push('/browse');
            }
          }}
          aria-label={activeSource !== 'hero' ? 'Back to listing video' : 'Back to grid'}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-cream/20 bg-ink/55 text-cream backdrop-blur-md transition-colors hover:border-gold hover:text-gold"
          style={{ touchAction: 'manipulation' }}
        >
          <BackArrowIcon />
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push('/browse')}
            aria-label="Search listings"
            title="Search (coming soon)"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-cream/20 bg-ink/55 text-cream/70 backdrop-blur-md transition-colors hover:border-gold hover:text-gold"
            style={{ touchAction: 'manipulation' }}
          >
            <SearchIcon />
          </button>
          <button
            type="button"
            onClick={onShare}
            aria-label="Share listing"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-cream/20 bg-ink/55 text-cream backdrop-blur-md transition-colors hover:border-gold hover:text-gold"
            style={{ touchAction: 'manipulation' }}
          >
            <ShareIcon />
          </button>
        </div>
      </div>

      {/* Bottom action bar — Like / Save / Comment (Xiaohongshu pattern).
       * Comment opens the lead modal (closest existing pathway to a
       * conversation; "comments" UI itself is V2). */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-around border-cream/10 border-t bg-ink/70 px-4 pt-2 backdrop-blur-md"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div key={likeAnimKey} className={likeAnimKey > 0 ? 'heart-pop' : ''}>
          <BottomBarButton
            label="Like"
            onClick={toggleLike}
            active={isLiked}
            activeColor="text-rose-400"
          >
            <HeartIcon filled={isLiked} />
          </BottomBarButton>
        </div>
        <BottomBarButton label="Save" onClick={toggleSave} active={isSaved} activeColor="text-gold">
          <BookmarkIcon filled={isSaved} />
        </BottomBarButton>
        <BottomBarButton label="Contact" onClick={openContact}>
          <CommentIcon />
        </BottomBarButton>
      </div>

      {activeIndex === 0 && activeSource === 'hero' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-20 z-10 text-center">
          <span className="text-[10px] text-cream/50 uppercase tracking-widest">
            Swipe up for more
          </span>
        </div>
      )}

      {active && (
        <LeadModal
          open={leadOpen}
          onClose={() => setLeadOpen(false)}
          agent={{ name: active.agent.name }}
          listing={{ address: active.listing.address }}
          listingId={active.listing.id}
        />
      )}
    </div>
  );
}
