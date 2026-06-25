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

import {
  listSavedCommunityIds,
  saveCommunity,
  unsaveCommunity,
} from '@/app/_actions/saved-communities';
import { getOrCreateDeviceId } from '@/lib/buyer/device-id';
import { listLiked, toggleLike as toggleLikeAction } from '@/lib/buyer/likes';
import { hlsUrl, thumbnailUrl } from '@/lib/cloudflare/stream';

import {
  COMMUNITY_VIDEO_CATEGORIES,
  type CommunityVideoCategoryId,
} from '@/lib/zod/community-video-categories';
import Hls from 'hls.js';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LeadModal } from '../../../_components/LeadModal';
import { ActionButton } from '../../../_components/feed/ActionButton';
import { FeedShell } from '../../../_components/feed/FeedShell';
import { FEED_RAIL_BOTTOM, FEED_Z } from '../../../_components/feed/constants';
import {
  BackArrowIcon,
  BookmarkIcon,
  CommentIcon,
  HeartIcon,
  ShareIcon,
} from '../../../_components/feed/icons';
import { CommunityListingCarousel } from './_components/CommunityListingCarousel';
import { CommunityListingsSheet } from './_components/CommunityListingsSheet';

export type CommunityFeedVideo = {
  id: string;
  cfVideoId: string;
  title: string | null;
  category: string | null;
};

/**
 * Phase 34b (V1 redo, 2026-06-17): Scenario B data shape — listings
 * surfaced via the top-left "homes here" chip on the community feed.
 * Hero is a video if available, photo as fallback. Real fields only;
 * nulls render as omissions, not placeholders.
 */
export type CommunityListingItem = {
  id: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  heroCfVideoId: string | null;
  heroPhotoUrl: string | null;
};

export type CommunityFeedCommunity = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string;
};

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
  // Phase 55 (2026-06-25): see BrowseFeed for rationale. Only the user's
  // explicit tap-to-pause shows the central play button. Auto-paused
  // (loading, autoplay-blocked, off-screen) does not.
  const [userPaused, setUserPaused] = useState(false);

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

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    el.removeAttribute('src');
    el.load();

    let src: string;
    try {
      src = hlsUrl(video.cfVideoId);
    } catch {
      return;
    }

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
      // Fresh card — clear any stale tap-to-pause from a prior interaction.
      setUserPaused(false);
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
        .then(() => {
          setPaused(false);
          setUserPaused(false);
        })
        .catch(() => {});
    } else {
      v.pause();
      setPaused(true);
      setUserPaused(true);
    }
  };

  const cat = categoryLabel(video.category);

  return (
    <section
      ref={(el) => cardRef(el)}
      className="relative h-[100dvh] w-full snap-start snap-always overflow-hidden bg-black"
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
      {userPaused && shouldMount && (
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
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cream/40 bg-cream/15 px-3 py-1 backdrop-blur">
            <span className="font-medium text-cream text-xs">{cat.label}</span>
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
  owner = null,
  videos,
  initialIndex = 0,
  activeListingsCount = 0,
  listings = [],
}: {
  community: CommunityFeedCommunity;
  /**
   * Phase 45.18: community owner — `created_by` agent. When present,
   * the right-rail Contact button opens a LeadModal that lands a lead
   * on this agent. Null for legacy / unowned communities (no Contact).
   */
  owner?: { id: string; name: string } | null;
  videos: CommunityFeedVideo[];
  initialIndex?: number;
  activeListingsCount?: number;
  /** Phase 34b (V1 redo): listings to surface via the top-left chip. */
  listings?: CommunityListingItem[];
}) {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [muted, setMuted] = useState(false);
  const [liked, setLiked] = useState(false); // in-memory, V1
  const [saved, setSaved] = useState(false);
  // Phase 34b (V1 redo): Scenario B sheet/carousel state.
  const [listingsSheetOpen, setListingsSheetOpen] = useState(false);
  const [listingCarouselOpen, setListingCarouselOpen] = useState(false);
  const [listingCarouselStartIdx, setListingCarouselStartIdx] = useState(0);
  // Phase 45.18: Contact-the-community-owner LeadModal state.
  const [leadOpen, setLeadOpen] = useState(false);
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
        const [ids, likedIds] = await Promise.all([
          listSavedCommunityIds({ deviceId: id }),
          listLiked({ deviceId: id, kind: 'community' }),
        ]);
        if (ids.includes(community.id)) setSaved(true);
        if (likedIds.includes(community.id)) setLiked(true);
      } catch (err) {
        console.error('[CommunityVideoFeed] saved hydrate failed', err);
      }
    })();
  }, [community.id]);

  // First-interaction unmute (TikTok-style).
  // Phase 55 (2026-06-25): match BrowseFeed — also listen for `touchstart`
  // (iOS swipes can miss `pointerdown`) and proactively call play() on the
  // active <video> so audio kicks in on the first gesture instead of after
  // a few back-and-forth swipes.
  useEffect(() => {
    if (!muted || !wasAutoplayBlockedRef.current) return;
    const unmuteOnce = () => {
      wasAutoplayBlockedRef.current = false;
      setMuted(false);
      const activeEl = cardRefs.current.get(activeIndex);
      const v = activeEl?.querySelector('video');
      if (v) {
        v.muted = false;
        void v.play().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', unmuteOnce, { once: true, passive: true });
    window.addEventListener('touchstart', unmuteOnce, { once: true, passive: true });
    window.addEventListener('keydown', unmuteOnce, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unmuteOnce);
      window.removeEventListener('touchstart', unmuteOnce);
      window.removeEventListener('keydown', unmuteOnce);
    };
  }, [muted, activeIndex]);

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

  const toggleLike = useCallback(() => {
    const wasLiked = liked;
    setLiked(!wasLiked);
    void (async () => {
      try {
        const deviceId = getOrCreateDeviceId();
        const result = await toggleLikeAction({
          deviceId,
          kind: 'community',
          targetId: community.id,
          liked: !wasLiked,
        });
        if (!result.ok) {
          console.error('[CommunityVideoFeed] like toggle failed', result.error);
          setLiked(wasLiked);
        }
      } catch (err) {
        console.error('[CommunityVideoFeed] like toggle threw', err);
        setLiked(wasLiked);
      }
    })();
  }, [liked, community.id]);

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
      <div className="flex h-screen w-full items-center justify-center bg-bg text-muted text-sm">
        No videos in this community yet.
      </div>
    );
  }

  return (
    <FeedShell
      scrollerRef={scrollerRef}
      cards={Array.from({ length: totalCards }, (_, idx) => {
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
    >
      {/* Top header — Back + community name pill. */}
      <div
        className={`absolute inset-x-0 top-0 ${FEED_Z.topbar} flex items-center justify-between px-3 pt-3`}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label={`Back to ${community.name}`}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-cream/20 bg-ink/55 text-cream backdrop-blur-md transition-colors hover:border-cream hover:text-cream"
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
          className="flex h-11 w-11 items-center justify-center rounded-full border border-cream/20 bg-ink/55 text-cream backdrop-blur-md transition-colors hover:border-cream hover:text-cream"
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
      {/* Phase 45.22 (2026-06-21): rail migrated onto the shared
       * ActionButton primitive used by BrowseFeed. Pre-45.22 the rail
       * inlined bare circular buttons with no labels, which made them
       * read as "small mystery icons" against bright video frames —
       * users couldn't tell Like from Save from Contact at a glance.
       * ActionButton renders a 12x12 circle WITH a "Like"/"Save"/
       * "Contact" caption underneath, matching BrowseFeed exactly so
       * the three feed surfaces speak with one voice. */}
      <div
        className={`absolute right-3 ${FEED_Z.rail} flex flex-col items-center gap-3`}
        style={{ bottom: FEED_RAIL_BOTTOM }}
      >
        <ActionButton onClick={toggleLike} label="Like" active={liked} activeColor="rose">
          <HeartIcon filled={liked} />
        </ActionButton>
        <ActionButton onClick={toggleSave} label="Save" active={saved}>
          <BookmarkIcon filled={saved} />
        </ActionButton>
        {/* Phase 45.18 (2026-06-20): Contact button → community owner.
         * Owner rule: "if exploring community directly, contact community
         * owner". Hidden for legacy/unowned communities (no owner to
         * route to). Same speech-bubble glyph as BrowseFeed Contact so
         * the three feeds read as one product. */}
        {owner && (
          <ActionButton onClick={() => setLeadOpen(true)} label="Contact">
            <CommentIcon />
          </ActionButton>
        )}
        {/* Phase 34b.1 (V1 redo, 2026-06-17): the right-rail HouseIcon was
         * removed in favor of a top-left "🏠 N homes here" chip that
         * opens an in-place listings sheet (L2) instead of navigating
         * away to /browse. Old right-rail entry duplicated the chip's
         * affordance and broke the user's anchor (community feed). The
         * mute button was already removed in phase34a. The chip lives at
         * top-left (not bottom) to mirror the listing-card community
         * chip on /browse — same corner, same job. */}
      </div>

      {/* Top-left "homes here" chip — Scenario B · L1 trigger.
       * Positioned at top-16 (just under the top header) to mirror the
       * listing-card community chip on /browse — same corner, same job:
       * cross-collection sheet → carousel. Hidden when the community has
       * 0 listings (no fake data). Tap opens CommunityListingsSheet (L2).
       * Phase 34b.1 (2026-06-17): moved from bottom-left to top-left for
       * consistency with the listing chip the user already learned. */}
      {listings.length > 0 && (
        <button
          type="button"
          onClick={() => setListingsSheetOpen(true)}
          aria-label={`View ${listings.length} ${
            listings.length === 1 ? 'home' : 'homes'
          } in ${community.name}`}
          className={`absolute top-20 left-3 ${FEED_Z.caption} flex items-center gap-2 rounded-[10px] bg-ink/65 px-3 py-1.5 text-cream backdrop-blur-md transition-colors hover:bg-ink/75`}
          style={{ touchAction: 'manipulation' }}
        >
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cream"
            style={{ boxShadow: '0 0 6px rgba(255, 255, 255, 0.8)' }}
          />
          <span aria-hidden="true">🏠</span>
          <span className="font-medium text-[12px]">Live here</span>
        </button>
      )}

      <CommunityListingsSheet
        open={listingsSheetOpen && !listingCarouselOpen}
        communityName={community.name}
        listings={listings}
        onClose={() => setListingsSheetOpen(false)}
        onOpenListing={(idx) => {
          setListingCarouselStartIdx(idx);
          setListingCarouselOpen(true);
        }}
      />
      <CommunityListingCarousel
        open={listingCarouselOpen}
        listings={listings}
        startIndex={listingCarouselStartIdx}
        backLabel={community.name}
        onClose={() => {
          // Per V1 prototype: closing L3 returns straight to L0 (community
          // feed), not back to the sheet — sheet was a transient lookup.
          setListingCarouselOpen(false);
          setListingsSheetOpen(false);
        }}
      />
      {/* Phase 45.18: lead capture modal — community-targeted. Mounts only
       * when an owner exists; LeadModal fans out to /api/leads with
       * community_id and the route resolves agent_id server-side. */}
      {owner && (
        <LeadModal
          open={leadOpen}
          onClose={() => setLeadOpen(false)}
          agent={{ name: owner.name }}
          community={{ name: community.name }}
          communityId={community.id}
        />
      )}
    </FeedShell>
  );
}
