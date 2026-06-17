'use client';

/**
 * CommunityVideoFeed — TikTok-style swipe feed for the videos that
 * belong to a single community (Phase 27.7, 2026-06-16).
 *
 * Why a separate component instead of reusing BrowseFeed:
 * BrowseFeed is built around `BrowseCard` (listing + agent + nearby
 * pool + lead modal). Community videos have none of those — they're
 * neighborhood content (school run, walk-the-block, eating-out, …)
 * with no per-video CTA. A focused component keeps the surface
 * small and the gesture model obvious (vertical-only, like Reels).
 *
 * Save / Like semantics: actions target the **community**, not the
 * individual video. The buyer is bookmarking the neighborhood as
 * an entry point to look for homes inside it later.
 */

import { listSavedCommunityIds, saveCommunity, unsaveCommunity } from '@/app/_actions/saved-communities';
import { getOrCreateDeviceId } from '@/lib/buyer/device-id';
import { hlsUrl, thumbnailUrl } from '@/lib/cloudflare/stream';
import {
  COMMUNITY_VIDEO_CATEGORIES,
  type CommunityVideoCategoryId,
} from '@/lib/zod/community-video-categories';
import Hls from 'hls.js';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type CommunityFeedVideo = {
  id: string;
  cfVideoId: string;
  title: string | null;
  category: string | null;
};

export type CommunityFeedCommunity = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string;
};

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

function ShareIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={22} height={22} fill="currentColor">
      <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z" />
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

function HouseIcon() {
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
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}

const CATEGORY_META = new Map(COMMUNITY_VIDEO_CATEGORIES.map((m) => [m.id, m] as const));

function categoryLabel(id: string | null): { label: string; blurb?: string } | null {
  if (!id) return null;
  const meta = CATEGORY_META.get(id as CommunityVideoCategoryId);
  if (!meta) return null;
  return { label: meta.label, blurb: meta.blurb };
}

interface VideoCardProps {
  video: CommunityFeedVideo;
  shouldMount: boolean;
  isActive: boolean;
  cardRef: (el: HTMLElement | null) => void;
  muted: boolean;
  onAutoplayBlocked: () => void;
}

function VideoCard({
  video,
  shouldMount,
  isActive,
  cardRef,
  muted,
  onAutoplayBlocked,
}: VideoCardProps) {
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [paused, setPaused] = useState(true);

  let poster: string | null = null;
  try {
    poster = thumbnailUrl(video.cfVideoId);
  } catch {
    poster = null;
  }

  // Attach HLS.
  useEffect(() => {
    if (!shouldMount) return;
    const el = videoElRef.current;
    if (!el) return;

    let src: string;
    try {
      src = hlsUrl(video.cfVideoId);
    } catch {
      return;
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    el.removeAttribute('src');
    el.load();

    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      el.src = src;
    } else if (Hls.isSupported()) {
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
      hls.attachMedia(el);
      hlsRef.current = hls;
    } else {
      el.src = src;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [shouldMount, video.cfVideoId]);

  // Play/pause on activation; honor mute, fall back if blocked.
  useEffect(() => {
    const v = videoElRef.current;
    if (!v) return;
    if (isActive && shouldMount) {
      v.muted = muted;
      v.play()
        .then(() => setPaused(false))
        .catch(() => {
          if (!v.muted) {
            v.muted = true;
            onAutoplayBlocked();
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
  }, [isActive, shouldMount, muted, onAutoplayBlocked]);

  // Keep mute in sync.
  useEffect(() => {
    const v = videoElRef.current;
    if (!v) return;
    v.muted = muted;
  }, [muted]);

  const onTap = () => {
    const v = videoElRef.current;
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

  const cat = categoryLabel(video.category);

  return (
    <section
      ref={(el) => cardRef(el)}
      className="relative h-screen w-full snap-start snap-always overflow-hidden bg-black"
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: tap-to-play */}
      <div className="absolute inset-0 touch-pan-y" onClick={onTap}>
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
            ref={videoElRef}
            poster={poster ?? undefined}
            className="relative h-full w-full object-cover md:object-contain"
            playsInline
            muted
            loop
            preload="metadata"
          />
        ) : (
          poster && (
            <img
              src={poster}
              alt={video.title ?? 'Community video'}
              className="relative h-full w-full object-cover md:object-contain"
            />
          )
        )}
      </div>

      {/* Top + bottom gradients for legibility. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 via-black/30 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/85 via-black/50 to-transparent" />

      {/* Pause indicator. */}
      {paused && shouldMount && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-black/40 text-cream backdrop-blur">
            <svg viewBox="0 0 24 24" width={36} height={36} fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* Bottom caption — category blurb only.
       * We deliberately do NOT render `video.title`: titles default to the
       * uploaded filename (e.g. "Community_with_pool.mp4"), which leaks the
       * file artifact onto the buyer surface. The category blurb already
       * tells the buyer what they're watching ("A walk through the
       * neighborhood, block by block."). When we add curated descriptions
       * (post-V1), they replace the blurb here. */}
      <div className="absolute right-20 bottom-20 left-4 text-cream">
        {cat && (
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/15 px-3 py-1 backdrop-blur">
            <span className="font-medium text-gold text-xs">{cat.label}</span>
          </div>
        )}
        {cat?.blurb && (
          <p className="text-cream/85 text-sm leading-snug drop-shadow">{cat.blurb}</p>
        )}
      </div>
    </section>
  );
}

export function CommunityVideoFeed({
  community,
  videos,
  initialIndex = 0,
  activeListingsCount = 0,
}: {
  community: CommunityFeedCommunity;
  videos: CommunityFeedVideo[];
  initialIndex?: number;
  activeListingsCount?: number;
}) {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [muted, setMuted] = useState(false);
  const [liked, setLiked] = useState(false); // in-memory, V1
  const [saved, setSaved] = useState(false);
  // Phase 27.9 (2026-06-16): infinite swipe — render the videos array
  // multiple times. Start at 2 copies; whenever the user enters the last
  // copy we append another. Capped at 50 copies (~hundreds of cards) to
  // prevent unbounded DOM growth in marathon sessions; in practice no buyer
  // swipes past 50× the catalog.
  const [loops, setLoops] = useState(2);
  const totalCards = videos.length === 0 ? 0 : videos.length * loops;
  useEffect(() => {
    if (videos.length === 0) return;
    if (activeIndex >= (loops - 1) * videos.length && loops < 50) {
      setLoops((l) => l + 1);
    }
  }, [activeIndex, loops, videos.length]);
  const deviceIdRef = useRef<string | null>(null);
  const cardRefs = useRef<Map<number, HTMLElement>>(new Map());
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const wasAutoplayBlockedRef = useRef(false);

  // Hydrate saved state from localStorage device id on mount.
  useEffect(() => {
    void (async () => {
      try {
        const id = getOrCreateDeviceId();
        deviceIdRef.current = id;
        const ids = await listSavedCommunityIds({ deviceId: id });
        if (ids.includes(community.id)) setSaved(true);
      } catch (err) {
        console.error('[CommunityVideoFeed] saved hydrate failed', err);
      }
    })();
  }, [community.id]);

  // First-interaction unmute (TikTok-style).
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

  // Intersection observer → activeIndex. Re-runs when totalCards changes so
  // newly-appended loop copies get observed.
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
    cardRefs.current.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [totalCards]);

  // Jump to initialIndex on mount when ?start was passed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot mount jump
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

  const onAutoplayBlocked = useCallback(() => {
    wasAutoplayBlockedRef.current = true;
    setMuted(true);
  }, []);

  const onBack = useCallback(() => {
    router.push(`/c/${community.slug}`);
  }, [router, community.slug]);

  const toggleLike = useCallback(() => setLiked((v) => !v), []);

  const toggleSave = useCallback(() => {
    const wasSaved = saved;
    setSaved(!wasSaved); // optimistic
    void (async () => {
      try {
        const deviceId = getOrCreateDeviceId();
        const result = await (wasSaved
          ? unsaveCommunity({ deviceId, communityId: community.id })
          : saveCommunity({ deviceId, communityId: community.id }));
        if (!result.ok) {
          console.error('[CommunityVideoFeed] save toggle failed', result.error);
          setSaved(wasSaved);
        }
      } catch (err) {
        console.error('[CommunityVideoFeed] save toggle threw', err);
        setSaved(wasSaved);
      }
    })();
  }, [saved, community.id]);

  const onShare = useCallback(async () => {
    const url = `${window.location.origin}/c/${community.slug}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: community.name, url });
        return;
      } catch {
        /* fall through */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  }, [community.slug, community.name]);

  // Determine which cards to mount (active + neighbours).
  const mountWindow = useMemo(() => {
    const set = new Set<number>();
    for (let d = -1; d <= 1; d++) {
      const i = activeIndex + d;
      if (i >= 0 && i < totalCards) set.add(i);
    }
    return set;
  }, [activeIndex, totalCards]);

  if (videos.length === 0) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-ink text-cream/60 text-sm">
        No videos in this community yet.
      </div>
    );
  }

  return (
    <div
      ref={scrollerRef}
      className="h-screen w-full snap-y snap-mandatory overflow-y-scroll bg-black"
      style={{ scrollSnapType: 'y mandatory' }}
    >
      {Array.from({ length: totalCards }, (_, idx) => {
        const v = videos[idx % videos.length];
        if (!v) return null;
        return (
          <VideoCard
            key={`${v.id}-${idx}`}
            video={v}
            shouldMount={mountWindow.has(idx)}
            isActive={idx === activeIndex}
            cardRef={(el) => setCardRef(idx, el)}
            muted={muted}
            onAutoplayBlocked={onAutoplayBlocked}
          />
        );
      })}

      {/* Top header — Back + community name pill. */}
      <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-3 pt-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={`Back to ${community.name}`}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-cream/20 bg-ink/55 text-cream backdrop-blur-md transition-colors hover:border-gold hover:text-gold"
          style={{ touchAction: 'manipulation' }}
        >
          <BackArrowIcon />
        </button>
        <div className="rounded-full border border-cream/20 bg-ink/55 px-3 py-1.5 backdrop-blur-md">
          <span className="font-medium text-cream text-xs">{community.name}</span>
          {community.city && (
            <span className="ml-1.5 text-cream/60 text-xs">
              · {community.city}, {community.state}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onShare}
          aria-label="Share community"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-cream/20 bg-ink/55 text-cream backdrop-blur-md transition-colors hover:border-gold hover:text-gold"
          style={{ touchAction: 'manipulation' }}
        >
          <ShareIcon />
        </button>
      </div>

      {/* Right rail: Like / Save / Listings / Mute.
       * Phase 27.7 (2026-06-17): Listings becomes a 12×12 circular icon in
       * the same family as the other rail buttons, with the count rendered
       * as a gold badge on the top-right corner — visually consistent with
       * BrowseFeed's "Nearby" badge pattern (BrowseFeed.tsx:282). Placed
       * below Save: Like → Save → Listings → Mute. Same destination as
       * the badge on `/c/[slug]` (`/browse?community=<slug>`). Hidden when
       * count is 0 (no homes for sale yet). */}
       <div
         className="absolute right-3 z-20 flex flex-col items-center gap-3"
         style={{ bottom: 'max(6rem, calc(env(safe-area-inset-bottom) + 5rem))' }}
       >
         <button
           type="button"
           onClick={toggleLike}
           aria-label="Like community"
           className={`flex h-12 w-12 items-center justify-center rounded-full border backdrop-blur transition ${
             liked
               ? 'border-rose-400/70 bg-rose-400/20 text-rose-400'
               : 'border-cream/20 bg-ink/40 text-cream hover:border-cream/50'
           }`}
         >
           <HeartIcon filled={liked} />
         </button>
         <button
           type="button"
           onClick={toggleSave}
           aria-label="Save community"
           className={`flex h-12 w-12 items-center justify-center rounded-full border backdrop-blur transition ${
             saved
               ? 'border-gold/70 bg-gold/20 text-gold'
               : 'border-cream/20 bg-ink/40 text-cream hover:border-cream/50'
           }`}
         >
           <BookmarkIcon filled={saved} />
         </button>
         {activeListingsCount > 0 && (
           <button
             type="button"
             onClick={() => router.push(`/browse?community=${community.slug}`)}
             aria-label={`View ${activeListingsCount} ${activeListingsCount === 1 ? 'listing' : 'listings'} in ${community.name}`}
             className="relative flex h-12 w-12 items-center justify-center rounded-full border border-cream/20 bg-ink/40 text-cream backdrop-blur transition hover:border-gold hover:text-gold"
           >
             <HouseIcon />
             <span className="-right-1 -top-1 absolute rounded-full bg-gold px-1.5 py-0.5 font-semibold text-[9px] text-ink leading-none tabular-nums">
               {activeListingsCount}
             </span>
           </button>
         )}
         {/* phase34a (2026-06-17): right-rail mute button removed.
          * Volume is controlled by the device's system volume keys.
          * Internal `muted` state retained for autoplay-blocked fallback. */}
       </div>
    </div>
  );
}
