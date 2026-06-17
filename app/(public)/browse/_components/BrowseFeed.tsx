'use client';
import { listSavedListingIds, saveListing, unsaveListing } from '@/app/_actions/saved-listings';
import { getOrCreateDeviceId } from '@/lib/buyer/device-id';
import { hlsUrl, thumbnailUrl } from '@/lib/cloudflare/stream';
import Hls from 'hls.js';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LeadModal } from '../../_components/LeadModal';

export type BrowseSourceVideo = {
  cfVideoId: string;
  line1: string;
  line2?: string;
  /**
   * Phase 28 (2026-06-14): community-video category id (12-value enum
   * from `lib/zod/community-video-categories.ts`). Set on cards in the
   * single Nearby pool so the Card overlay can render the category
   * label + blurb pill above the caption. `undefined` for hero pool.
   */
  category?: string;
};

export type BrowseCard = {
  id: string;
  /**
   * Phase 10 (2026-06-12): listings can be photo-only (no ready video).
   * `mediaKind` discriminates how the grid renders the cover; the swipe
   * feed filters to `mediaKind === 'video'` because the immersive feed
   * is video-only by design ("TikTok for Homebuying" framing).
   *   - 'video' → use `hero.cfVideoId` for poster/HLS.
   *   - 'photo' → use `heroPhotoUrl` directly. `hero.cfVideoId` is empty.
   */
  mediaKind: 'video' | 'photo';
  hero: { cfVideoId: string };
  /** Set when mediaKind === 'photo'. Public Supabase Storage URL. */
  heroPhotoUrl?: string;
  /**
   * Phase 20 (2026-06-13): full photo URL list for the photo branch of the
   * detail page. Only set when mediaKind === 'photo' AND we want a swipeable
   * carousel (not just a grid cover). `/browse` grid leaves this undefined.
   * Order matches `listing_photos.sort_order`. First entry is the cover.
   */
  photos?: string[];
  /**
   * Optional richer hero pool — when set, the 'hero' source cycles through
   * these videos (horizontal swipe / repeat-tap Hero source on the rail).
   * Used by `/v/[agent]/[listing]` to expose multi-walkthrough listings;
   * `/browse` doesn't set this (single hero per card by design).
   */
  heroVideos?: BrowseSourceVideo[];
  schoolVideos?: BrowseSourceVideo[];
  nearbyVideos?: BrowseSourceVideo[];
  communityVideos?: BrowseSourceVideo[];
  /**
   * Phase 28 (2026-06-14): single Nearby pool — replaces schools /
   * pois / neighborhood splits with one feed of community videos, each
   * carrying a 12-category id. The right rail has one "Nearby" entry;
   * tapping it switches into this pool. The legacy three arrays above
   * are kept on the type so existing callers compile, but the feed
   * itself reads `categoryVideos` only.
   */
  categoryVideos: BrowseSourceVideo[];
  /**
   * Phase 20 (2026-06-13): plain-text schools / POIs for the photo branch
   * of the detail page (no community videos to switch to, so the right
   * rail is hidden — buyers see this list under the photo caption block
   * instead). `/browse` grid + video cards leave these undefined.
   */
  photoSchools?: { name: string; grades: string | null; rating: number | null }[];
  photoPois?: { name: string; distance_text: string | null }[];
  /**
   * Phase 14 (2026-06-13): present only when the card is rendered from
   * `/nearby` (computed via haversine from the buyer's location). Explore
   * cards leave it `undefined`. Used purely for an optional overlay line —
   * never affects sort order or click-through.
   */
  distance?: number;
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

type Source = 'hero' | 'nearby';

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

function NearbyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={22} height={22} fill="currentColor">
      <path d="M11 17a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM12 2a8 8 0 0 0-8 8c0 5.5 8 12 8 12s8-6.5 8-12a8 8 0 0 0-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" />
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
  activeColor,
  disabled,
  badge,
  children,
}: {
  onClick?: () => void;
  href?: string;
  label: string;
  active?: boolean;
  /**
   * Phase 28: optional accent for the active state. 'gold' (default) is
   * used by all info actions and Save; 'rose' is used by Like to match
   * Xiaohongshu / TikTok convention.
   */
  activeColor?: 'gold' | 'rose';
  disabled?: boolean;
  badge?: string | number;
  children: ReactNode;
}) {
  const activeCls =
    activeColor === 'rose'
      ? 'border-rose-400/70 bg-rose-400/20 text-rose-400'
      : 'border-gold/70 bg-gold/20 text-gold';
  const cls = `flex h-12 w-12 items-center justify-center rounded-full border backdrop-blur transition ${
    active
      ? activeCls
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
  /** Called if the browser blocks autoplay-with-sound and we fall back to muted. */
  onAutoplayBlocked?: () => void;
}

function poolFor(card: BrowseCard, source: Source): number {
  if (card.mediaKind === 'photo') {
    // Photos: swipe horizontally through the photo[] carousel. Source rail
    // is hidden in the parent — `source` is always 'hero' here.
    return Math.max(1, card.photos?.length ?? 1);
  }
  if (source === 'nearby') return card.categoryVideos.length;
  // hero: count heroVideos pool if provided, else 1 (single hero).
  return card.heroVideos && card.heroVideos.length > 0 ? card.heroVideos.length : 1;
}

function pickVideo(card: BrowseCard, source: Source, cycleIdx: number): BrowseSourceVideo {
  if (source === 'nearby' && card.categoryVideos.length > 0) {
    return card.categoryVideos[cycleIdx % card.categoryVideos.length] as BrowseSourceVideo;
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

/**
 * Phase 20 (2026-06-13): photo-only card. Same layout language as the video
 * Card (gradient overlays, bottom caption, source overlay top-left, action
 * bar handled by parent), but renders an <img> carousel instead of <video>.
 * Horizontal swipe / left-right keys cycle through `card.photos[]` via the
 * parent's existing cycleByCard plumbing — so persistence/keyboard logic
 * stays single-source-of-truth in BrowseFeed.
 */
function PhotoCard({
  card,
  cycleIdx,
  cardRef,
  onSwipe,
  poolSize,
}: {
  card: BrowseCard;
  cycleIdx: number;
  cardRef: (el: HTMLElement | null) => void;
  onSwipe: (delta: 1 | -1) => void;
  poolSize: number;
}) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const photos =
    card.photos && card.photos.length > 0
      ? card.photos
      : card.heroPhotoUrl
        ? [card.heroPhotoUrl]
        : [];
  const total = photos.length;
  const idx = total > 0 ? cycleIdx % total : 0;
  const current = photos[idx];

  const goPrev = () => onSwipe(-1);
  const goNext = () => onSwipe(1);

  return (
    <section
      ref={(el) => cardRef(el)}
      className="relative h-screen w-full snap-start snap-always overflow-hidden bg-black"
    >
      <div
        className="absolute inset-0 touch-pan-y"
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
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            e.preventDefault();
            e.stopPropagation();
            onSwipe(dx < 0 ? 1 : -1);
          }
        }}
      >
        {current && (
          <img
            src={current}
            alt={card.listing.address}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 hidden h-full w-full scale-110 object-cover opacity-60 blur-2xl md:block"
          />
        )}
        {current ? (
          <img
            src={current}
            alt={`${card.listing.address} — ${idx + 1} of ${total}`}
            className="relative h-full w-full object-cover md:object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-cream/40 text-sm">
            No photo
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 via-black/30 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/85 via-black/50 to-transparent" />

      {/* Photo counter — top-left, mirrors the source overlay slot the
       * video card uses. Hidden when there's a single photo. */}
      {poolSize > 1 && (
        <div className="absolute top-16 left-5 rounded-lg border border-cream/20 bg-ink/60 px-3 py-2 backdrop-blur">
          <div className="font-medium text-cream/90 text-xs tabular-nums">
            {idx + 1} / {total}
          </div>
          <div className="mt-1 text-[10px] text-cream/40 uppercase tracking-wider">← swipe →</div>
        </div>
      )}

      {/* Desktop-only left/right arrows. Mobile uses swipe. */}
      {poolSize > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous photo"
            className="-translate-y-1/2 absolute top-1/2 left-3 z-10 hidden h-10 w-10 items-center justify-center rounded-full border border-cream/20 bg-ink/55 text-cream backdrop-blur transition-colors hover:border-gold hover:text-gold md:flex"
            style={{ touchAction: 'manipulation' }}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next photo"
            className="-translate-y-1/2 absolute top-1/2 right-3 z-10 hidden h-10 w-10 items-center justify-center rounded-full border border-cream/20 bg-ink/55 text-cream backdrop-blur transition-colors hover:border-gold hover:text-gold md:flex"
            style={{ touchAction: 'manipulation' }}
          >
            ›
          </button>
        </>
      )}

      {/* Bottom caption — same shape as video Card. Photo cards additionally
       * surface a plain-text schools + POI strip below the description (no
       * source rail to switch into, so the info has to live in-frame). */}
      <div className="absolute bottom-20 left-4 right-4 text-cream">
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
        {((card.photoSchools?.length ?? 0) > 0 || (card.photoPois?.length ?? 0) > 0) && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-cream/70 text-[11px]">
            {card.photoSchools?.map((s) => (
              <span key={`sch:${s.name}`}>
                🏫 {s.name}
                {s.rating != null ? ` · ${s.rating}/10` : ''}
              </span>
            ))}
            {card.photoPois?.map((p) => (
              <span key={`poi:${p.name}`}>
                📍 {p.name}
                {p.distance_text ? ` · ${p.distance_text}` : ''}
              </span>
            ))}
          </div>
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
  onAutoplayBlocked,
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
      // capLevelToPlayerSize:false → don't cap quality to the player's pixel
      //   size (desktop letterbox renders smallish but we still want HD).
      // MANIFEST_PARSED → jump to the top level for first playback so users
      //   don't see the lowest-bitrate ladder rung. ABR can still downgrade
      //   on real network pressure afterwards.
      const hls = new Hls({
        maxBufferLength: 20,
        maxMaxBufferLength: 30,
        capLevelToPlayerSize: false,
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (hls.levels.length > 0) {
          hls.nextLevel = hls.levels.length - 1;
        }
      });
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
  // Try with current mute state first; if browser blocks autoplay-with-sound
  // (no sticky activation), fall back to muted and signal parent to flip
  // the global mute state so the Sound button reflects reality.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sel.cfVideoId triggers replay after source switch
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isActive && shouldMount) {
      v.muted = muted;
      v.play()
        .then(() => setPaused(false))
        .catch(() => {
          // Autoplay-with-sound was blocked. Retry muted — this always works.
          if (!v.muted) {
            v.muted = true;
            onAutoplayBlocked?.();
            v.play()
              .then(() => setPaused(false))
              .catch(() => setPaused(true));
          } else {
            setPaused(true);
          }
        });
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

  return (
    <section
      ref={(el) => cardRef(el)}
      // Phase 28.3 (2026-06-16): hoist `touch-none` from the inner div to the
      // <section> root in Nearby mode. `touch-action` is NOT inherited — it's
      // resolved per-element by the browser. With it only on the inner div,
      // touches that landed on the <video> element (its default
      // `touch-action: auto` wins) leaked vertical pans to the outer snap-y
      // scroller and skipped to the next listing — exactly the bug the
      // 28.1 commit thought it had fixed. Putting it on the section means
      // the entire subtree (video + img poster + overlays) opts out of
      // native scrolling while in Nearby mode, so the JS swipe handler
      // owns vertical gestures uncontested.
      className={`relative h-screen w-full snap-start snap-always overflow-hidden bg-black ${source === 'nearby' ? 'touch-none' : ''}`}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: tap-to-play */}
      <div
        // Hero mode keeps `touch-pan-y` so vertical pans pass through to the
        // snap-y listing scroller, and only horizontal swipes (heroVideos
        // pool) are intercepted here. Nearby's `touch-none` lives on the
        // section above (see comment).
        className={`absolute inset-0 ${source === 'nearby' ? '' : 'touch-pan-y'}`}
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
          if (source === 'nearby') {
            // Vertical swipe cycles within the nearby pool — same gesture as
            // moving between listings, so the pool feels like a feed.
            if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx) * 1.5) {
              e.preventDefault();
              e.stopPropagation();
              onSwipe(dy < 0 ? 1 : -1);
            }
            return;
          }
          // Hero: horizontal swipe cycles heroVideos (when present); vertical
          // pans fall through to the outer snap scroller for next listing.
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            e.preventDefault();
            e.stopPropagation();
            onSwipe(dx < 0 ? 1 : -1);
          }
        }}
      >
        {/* Desktop blurred backdrop — Douyin-style. Fills the letterbox
         * gutters on md+ where the video is object-contain (9:16 inside 16:9).
         * Uses the poster as a still backdrop (zero extra bandwidth: poster
         * is already loaded by the <video> tag below). Hidden on mobile where
         * object-cover already fills the viewport. */}
        {poster && (
          <img
            src={poster}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 hidden h-full w-full scale-110 object-cover opacity-60 blur-2xl md:block"
          />
        )}
        {shouldMount ? (
          <video
            ref={videoRef}
            poster={poster ?? undefined}
            className="relative h-full w-full object-cover md:object-contain"
            playsInline
            muted
            loop
            preload="metadata"
          />
        ) : poster ? (
          <img
            src={poster}
            alt=""
            className="relative h-full w-full object-cover md:object-contain"
          />
        ) : null}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 via-black/30 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/85 via-black/50 to-transparent" />

      {/* Phase 28.1 (2026-06-15): single category pill — gold-on-gold,
       * top-left. Replaces the older dark-card source overlay AND the
       * bottom-caption gold pill that duplicated this same data. Only
       * shown in Nearby mode; hero is unlabelled. Pool counter sits in
       * the same pill so the user knows their position in the feed.
       * Phase 28.2 (2026-06-15): the per-category blurb (sel.line2) is
       * dropped — the title alone reads cleaner and the blurb was
       * pushing the pill into a multi-line wrap on long captions. */}
      {source === 'nearby' && sel.category && (
        <div className="absolute top-16 left-5 z-10 inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/15 px-3 py-1 backdrop-blur">
          <span className="font-medium text-[11px] text-gold uppercase tracking-wider">
            {sel.line1}
          </span>
          {poolSize > 1 && (
            <span className="rounded-full bg-cream/15 px-1.5 py-0.5 font-medium text-[10px] text-cream/90 tabular-nums">
              {(cycleIdx % poolSize) + 1}/{poolSize}
            </span>
          )}
        </div>
      )}

      {/* Phase 28.2 (2026-06-15): desktop nav arrows for the Nearby pool.
       * Touch events don't fire on a Mac mouse, so the vertical-swipe
       * gesture is mobile-only. Up/Down arrows (md:flex) mirror the
       * PhotoCard's left/right arrow pattern. Hidden when pool ≤ 1 or
       * when not in Nearby mode. Stops propagation so the click doesn't
       * also trigger the tap-to-pause handler. */}
      {source === 'nearby' && poolSize > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSwipe(-1);
            }}
            aria-label="Previous nearby video"
            className="-translate-x-1/2 absolute top-20 left-1/2 z-10 hidden h-10 w-10 items-center justify-center rounded-full border border-cream/20 bg-ink/55 text-cream backdrop-blur transition-colors hover:border-gold hover:text-gold md:flex"
            style={{ touchAction: 'manipulation' }}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSwipe(1);
            }}
            aria-label="Next nearby video"
            className="-translate-x-1/2 absolute bottom-32 left-1/2 z-10 hidden h-10 w-10 items-center justify-center rounded-full border border-cream/20 bg-ink/55 text-cream backdrop-blur transition-colors hover:border-gold hover:text-gold md:flex"
            style={{ touchAction: 'manipulation', transform: 'translateX(-50%) rotate(180deg)' }}
          >
            ‹
          </button>
        </>
      )}

      {paused && shouldMount && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-black/40 text-cream backdrop-blur">
            <PlayIcon />
          </div>
        </div>
      )}

      {/* Bottom caption block — Xiaohongshu/Douyin pattern. Phase 28
       * (2026-06-14): the bottom action bar is gone, so the caption
       * extends to the safe-area edge for an immersive look. The right
       * rail (Like / Save / Contact / Nearby / Sound) lives over the
       * gradient at right-3. */}
      <div
        className="absolute left-4 right-20 text-cream"
        style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
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
  hideNearby = false,
}: {
  cards: BrowseCard[];
  /**
   * Phase 9: when launched from the grid, jump straight to the clicked card.
   * Defaults to 0 (top of feed) for backwards compatibility.
   */
  initialIndex?: number;
  /**
   * Phase 27.5 (2026-06-16): hide the right-rail Nearby button. Used by the
   * community-scoped feed (`/browse/feed?community=<slug>`) — the user
   * already entered the feed from a single community context, so offering
   * "Nearby" (which switches the active card into its community-video
   * pool) reads as redundant noise. Defaults false (global feed shows it).
   */
  hideNearby?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Phase 28.x (2026-06-16): when opened from the agent's dashboard
  // ("View ↗"), Back returns to /dashboard instead of /browse so the
  // agent doesn't get dumped into the public explore feed.
  const backHref = searchParams?.get('from') === 'dashboard' ? '/dashboard' : '/browse';
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [likeAnimKey, setLikeAnimKey] = useState(0);

  // Phase 21 (2026-06-13): persistent saves keyed by anonymous device id.
  // Hydrated on mount from saved_listings; toggleSave fires server actions.
  // Resolved lazily on the client (localStorage requires window).
  const deviceIdRef = useRef<string | null>(null);
  useEffect(() => {
    void (async () => {
      const id = getOrCreateDeviceId();
      deviceIdRef.current = id;
      try {
        const ids = await listSavedListingIds({ deviceId: id });
        if (ids.length > 0) {
          setSaved(Object.fromEntries(ids.map((lid: string) => [lid, true])));
        }
      } catch (err) {
        console.error('[BrowseFeed] saved hydrate failed', err);
      }
    })();
  }, []);

  // per-card source + cycle index. key = listing.id
  const [sourceByCard, setSourceByCard] = useState<Record<string, Source>>({});
  const [cycleByCard, setCycleByCard] = useState<Record<string, number>>({});
  const [pausedActive, setPausedActive] = useState(true);
  // Global mute state. We optimistically start UNMUTED — if the user arrived
  // via a click on the Landing "Explore" CTA (or any in-app navigation), the
  // browser's sticky activation lets us autoplay with sound. If the user
  // landed directly on /browse/feed (e.g. via a shared link in a new tab),
  // the browser will reject autoplay-with-sound and the Card's catch handler
  // calls setMuted(true) to fall back to muted playback. In either case the
  // bottom-bar Sound button reflects the actual state.
  const [muted, setMuted] = useState(false);
  // Set when autoplay-with-sound was blocked and we fell back to muted. The
  // next genuine user gesture (tap/swipe/keydown) on the feed flips us back
  // to unmuted — TikTok-style "first interaction enables sound" so users
  // don't have to find the Sound button.
  const wasAutoplayBlockedRef = useRef(false);
  useEffect(() => {
    if (!muted || !wasAutoplayBlockedRef.current) return;
    const unmuteOnce = () => {
      wasAutoplayBlockedRef.current = false;
      setMuted(false);
    };
    window.addEventListener('pointerdown', unmuteOnce, { once: true, passive: true });
    window.addEventListener('keydown', unmuteOnce, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unmuteOnce);
      window.removeEventListener('keydown', unmuteOnce);
    };
  }, [muted]);
  const [leadOpen, setLeadOpen] = useState(false);
  const cardRefs = useRef<Map<number, HTMLElement>>(new Map());
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Phase 27.9 (2026-06-16): infinite swipe — repeat the cards array as the
  // user nears the end. Keyed-by-listing.id state (saved / liked / source /
  // cycle) is intentionally shared across loop copies; a buyer landing on
  // copy #2 of the same listing sees its existing Like / Save state. Cap
  // 50 loops to bound DOM growth.
  const [loops, setLoops] = useState(2);
  const totalCards = cards.length === 0 ? 0 : cards.length * loops;
  useEffect(() => {
    if (cards.length === 0) return;
    if (activeIndex >= (loops - 1) * cards.length && loops < 50) {
      setLoops((l) => l + 1);
    }
  }, [activeIndex, loops, cards.length]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-attach on totalCards growth
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
  }, [totalCards]);

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
    const wasSaved = !!saved[id];
    // Optimistic flip; revert on server failure.
    setSaved((m) => ({ ...m, [id]: !wasSaved }));

    const deviceId = deviceIdRef.current;
    if (!deviceId) return; // hydration race; user likely double-tapped before mount fetch

    void (async () => {
      const result = await (wasSaved
        ? unsaveListing({ deviceId, listingId: id })
        : saveListing({ deviceId, listingId: id }));
      if (!result.ok) {
        console.error('[BrowseFeed] save toggle failed', result.error);
        // revert optimistic flip
        setSaved((m) => ({ ...m, [id]: wasSaved }));
      }
    })();
  }, [active, saved]);

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

  const hasNearby = (active?.categoryVideos.length ?? 0) > 0;

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
      // Phase 28.1 (2026-06-15): in Nearby mode the swipe gesture is now
      // vertical, so accept ArrowUp/Down as the keyboard equivalent.
      // Left/Right are kept as a desktop power-user fallback.
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setCycleByCard((c) => {
          const cur = c[id] ?? 0;
          return { ...c, [id]: (cur + 1) % pool };
        });
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
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

  // Phase 28.2 (2026-06-15): desktop wheel/trackpad cycles the Nearby pool.
  // Without this, wheeling on a Mac scrolls the outer snap-y feed and jumps
  // to the next listing — the same UX bug the user reported. We intercept
  // wheel only while in Nearby mode, debounce by ignoring sub-threshold deltas
  // and a 350ms cool-down, and step through the pool by ±1.
  const wheelLockRef = useRef<number>(0);
  useEffect(() => {
    if (activeSource !== 'hero') {
      const root = scrollerRef.current;
      if (!root || !active) return;
      const id = active.listing.id;
      const pool = poolFor(active, activeSource);
      if (pool <= 1) return;
      const onWheel = (e: WheelEvent) => {
        if (Math.abs(e.deltaY) < 8) return;
        e.preventDefault();
        const now = Date.now();
        if (now - wheelLockRef.current < 350) return;
        wheelLockRef.current = now;
        const delta = e.deltaY > 0 ? 1 : -1;
        setCycleByCard((c) => {
          const cur = c[id] ?? 0;
          return { ...c, [id]: (((cur + delta) % pool) + pool) % pool };
        });
      };
      root.addEventListener('wheel', onWheel, { passive: false });
      return () => root.removeEventListener('wheel', onWheel);
    }
  }, [active, activeSource]);

  return (
    <div className="relative mx-auto h-screen w-full overflow-hidden bg-black md:w-[min(430px,calc(100vh*9/16))] md:shadow-2xl md:shadow-black/50">
      {/* Desktop: constrain feed to a phone-width portrait column centered on the
       * page. Mobile (default): full viewport. The outer body bg-ink fills the
       * surrounding desktop gutters — keeps a single immersive surface but stops
       * the video from stretching into a desktop-wide letterbox banner. */}
      {/* Logo + Back nav cluster lives top-right (see below). */}
      <div
        ref={scrollerRef}
        className="h-full w-full snap-y snap-mandatory overflow-y-scroll overscroll-contain"
        style={{ scrollSnapType: 'y mandatory' }}
      >
        {Array.from({ length: totalCards }, (_, idx) => {
          const card = cards[idx % cards.length];
          if (!card) return null;
          const id = card.listing.id;
          const cardSource = sourceByCard[id] ?? 'hero';
          const cardCycle = cycleByCard[id] ?? 0;
          const isThisActive = idx === activeIndex;
          if (card.mediaKind === 'photo') {
            return (
              <PhotoCard
                key={`${card.id}-${idx}`}
                card={card}
                cycleIdx={cardCycle}
                cardRef={(el) => setCardRef(idx, el)}
                poolSize={poolFor(card, cardSource)}
                onSwipe={(delta) => {
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
          }
          return (
            <Card
              key={`${card.id}-${idx}`}
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
              onAutoplayBlocked={() => {
                wasAutoplayBlockedRef.current = true;
                setMuted(true);
              }}
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

      {/* Right rail — Xiaohongshu / TikTok pattern (Phase 28, 2026-06-14).
       * All primary CTAs live here for an immersive bottom-edge: Like /
       * Save / Contact / Nearby (+ Sound for video). The bottom action
       * bar is gone; the caption block below extends to the safe-area.
       *
       * Nearby: switches into the single 12-category community-video pool.
       * Disabled (greyed) when the listing has no community videos. The
       * Card overlay renders a per-video category pill (label + blurb)
       * read from COMMUNITY_VIDEO_CATEGORIES on the client.
       *
       * Photo cards: same Like/Save/Contact/Nearby — only Sound is
       * hidden because there's no <video> to mute. Schools/POIs strip
       * inside PhotoCard caption is preserved (Phase 20). */}
      <div
        className="absolute right-3 z-20 flex flex-col items-center gap-3"
        style={{ bottom: 'max(6rem, calc(env(safe-area-inset-bottom) + 5rem))' }}
      >
        <div key={likeAnimKey} className={likeAnimKey > 0 ? 'heart-pop' : ''}>
          <ActionButton label="Like" onClick={toggleLike} active={isLiked} activeColor="rose">
            <HeartIcon filled={isLiked} />
          </ActionButton>
        </div>
        <ActionButton label="Save" onClick={toggleSave} active={isSaved}>
          <BookmarkIcon filled={isSaved} />
        </ActionButton>
        <ActionButton label="Contact" onClick={openContact}>
          <CommentIcon />
        </ActionButton>
        {!hideNearby && (
          <ActionButton
            label="Nearby"
            onClick={() => switchSource(activeSource === 'nearby' ? 'hero' : 'nearby')}
            active={activeSource === 'nearby'}
            disabled={!hasNearby}
            badge={hasNearby && active ? active.categoryVideos.length : undefined}
          >
            <NearbyIcon />
          </ActionButton>
        )}
        {/* phase34a (2026-06-17): right-rail mute button removed.
         * Volume is controlled by the device's system volume keys —
         * keeps the rail clean and avoids a redundant control. The
         * `muted` state is retained internally for the autoplay-blocked
         * fallback (browser blocks unmuted autoplay → start muted →
         * first interaction unmutes). */}
      </div>

      {/* Phase 28.1 (2026-06-15): centered NEARBY label removed — the
       * gold category pill on each card already tells the user they're
       * in the Nearby pool, and the right-rail Nearby button is in its
       * active gold state, so the standalone label was redundant. */}

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
              router.push(backHref);
            }
          }}
          aria-label={activeSource !== 'hero' ? 'Back to listing video' : 'Back'}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-cream/20 bg-ink/55 text-cream backdrop-blur-md transition-colors hover:border-gold hover:text-gold"
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
            className="flex h-11 w-11 items-center justify-center rounded-full border border-cream/20 bg-ink/55 text-cream/70 backdrop-blur-md transition-colors hover:border-gold hover:text-gold"
            style={{ touchAction: 'manipulation' }}
          >
            <SearchIcon />
          </button>
          <button
            type="button"
            onClick={onShare}
            aria-label="Share listing"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-cream/20 bg-ink/55 text-cream backdrop-blur-md transition-colors hover:border-gold hover:text-gold"
            style={{ touchAction: 'manipulation' }}
          >
            <ShareIcon />
          </button>
        </div>
      </div>

      {/* Phase 28 (2026-06-14): the bottom Like/Save/Contact bar moved
       * into the right rail above. The caption block on the Card now
       * extends to the safe-area, giving an immersive bottom edge. */}

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
