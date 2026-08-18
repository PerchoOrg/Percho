'use client';
import { listSavedListingIds, saveListing, unsaveListing } from '@/app/_actions/saved-listings';
import { getOrCreateDeviceId } from '@/lib/buyer/device-id';
import { listLiked, toggleLike as toggleLikeAction } from '@/lib/buyer/likes';
import { type BrowseCard, type Source, poolFor } from '@/lib/feed/browse-card';
import { linkForCard } from '@/lib/feed/link-for-card';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LeadModal } from '../../_components/LeadModal';
import { ActionButton } from '../../_components/feed/ActionButton';
import { FeedShell } from '../../_components/feed/FeedShell';
import { FEED_Z } from '../../_components/feed/constants';
import {
  BackArrowIcon,
  BookmarkIcon,
  CommentIcon,
  HeartIcon,
  ShareIcon,
} from '../../_components/feed/icons';
import { CommunityCarousel } from './CommunityCarousel';
import { CommunitySheet, type CommunitySheetData } from './CommunitySheet';

import { PhotoCard } from './PhotoCard';
import { VideoCard } from './VideoCard';

export function BrowseFeed({
  cards: initialCards,
  initialIndex = 0,
}: {
  cards: BrowseCard[];
  /**
   * when launched from the grid, jump straight to the clicked card.
   * Defaults to 0 (top of feed) for backwards compatibility.
   */
  initialIndex?: number;
}) {
  // true pagination. SSR ships the first page
  // (~30 cards) for fast paint; we fetch subsequent pages from
  // /api/browse/feed?offset=N as the swipe nears the end. When the API
  // returns done=true (or an empty page), we stop appending and the
  // existing infinite-loop wraps whatever we've collected so far.
  const [cards, setCards] = useState<BrowseCard[]>(initialCards);
  const [feedExhausted, setFeedExhausted] = useState(initialCards.length < 30);
  const fetchingRef = useRef(false);
  const seenIdsRef = useRef<Set<string>>(new Set(initialCards.map((c) => c.listing.id)));
  const router = useRouter();
  const searchParams = useSearchParams();
  // Back semantics fix.
  //
  // Old behavior: Back pushed router.push(backHref) which was always
  // '/browse' (or '/dashboard' if ?from=dashboard). Same destination as
  // the Search button next to it, AND a same-tab forward-nav that lost
  // the grid's scroll position — so a buyer who tapped through 30
  // listings to get here landed back at slot 0. Tianrou flagged this:
  // two buttons doing the same thing isn't a feature.
  //
  // New behavior:
  //   - If we have history within the same origin → router.back().
  //     That's exactly what the browser back button does, preserves the
  //     grid scroll, and lets a buyer browse → listing → browse linearly.
  //   - If there's no history (deep link, opened in new tab) → push the
  //     fallback href (/dashboard for from=dashboard, /browse otherwise).
  //   - Dashboard "View ↗" still passes ?from=dashboard so the fallback
  //     stays /dashboard and the agent doesn't get dumped into /browse.
  //
  // The Search button next to Back is removed in this same change —
  // it was wired to /browse with title="Search (coming soon)", which is
  // a placeholder by our no-fake-data rule. When real search lands we
  // can add it back.
  const backFallbackHref = searchParams?.get('from') === 'dashboard' ? '/dashboard' : '/browse';
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [likeAnimKey, setLikeAnimKey] = useState(0);

  // community sheet + carousel state.
  // The chip on each card opens a single shared sheet at the parent level
  // (only one card can be active at a time, so a single sheet suffices).
  // Carousel is L2 (fullscreen) and pushes/pops independently.
  const [sheetCardId, setSheetCardId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [carouselOpen, setCarouselOpen] = useState(false);
  const [carouselStartIdx, setCarouselStartIdx] = useState(0);

  // persistent saves keyed by anonymous device id.
  // Hydrated on mount from saved_listings; toggleSave fires server actions.
  // Resolved lazily on the client (localStorage requires window).
  const deviceIdRef = useRef<string | null>(null);
  useEffect(() => {
    void (async () => {
      const id = getOrCreateDeviceId();
      deviceIdRef.current = id;
      try {
        const [ids, likedIds] = await Promise.all([
          listSavedListingIds({ deviceId: id }),
          listLiked({ deviceId: id, kind: 'listing' }),
        ]);
        if (ids.length > 0) {
          setSaved(Object.fromEntries(ids.map((lid: string) => [lid, true])));
        }
        if (likedIds.length > 0) {
          setLiked(Object.fromEntries(likedIds.map((lid: string) => [lid, true])));
        }
      } catch (err) {
        console.error('[BrowseFeed] saved hydrate failed', err);
      }
    })();
  }, []);

  // per-card source + cycle index. key = listing.id
  const [sourceByCard, setSourceByCard] = useState<Record<string, Source>>({});
  const [cycleByCard, setCycleByCard] = useState<Record<string, number>>({});
  // Value is never read — the Card owns its own play/pause state (see the
  // `domPaused` note below). Only the setter is used, to force-pause the
  // underlying video when a sheet takes focus.
  const [, setPausedActive] = useState(true);
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

  // → swipe expansion.
  // First, fetch more real pages from /api/browse/feed until the DB is
  // exhausted. Only after that do we fall back to looping the collected
  // cards for infinite swipe. Trigger next-page fetch when the buyer is
  // within 5 cards of the current tail.
  const [loops, setLoops] = useState(1);
  const totalCards = cards.length === 0 ? 0 : cards.length * loops;

  useEffect(() => {
    if (feedExhausted) return;
    if (fetchingRef.current) return;
    if (cards.length === 0) return;
    if (activeIndex < cards.length - 5) return;

    fetchingRef.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/browse/feed?offset=${cards.length}&limit=30`);
        if (!res.ok) {
          setFeedExhausted(true);
          return;
        }
        const body = (await res.json()) as { cards: BrowseCard[]; done: boolean };
        const fresh = (body.cards ?? []).filter((c) => !seenIdsRef.current.has(c.listing.id));
        for (const c of fresh) seenIdsRef.current.add(c.listing.id);
        if (fresh.length > 0) setCards((prev) => [...prev, ...fresh]);
        if (body.done || fresh.length === 0) setFeedExhausted(true);
      } catch {
        setFeedExhausted(true);
      } finally {
        fetchingRef.current = false;
      }
    })();
  }, [activeIndex, cards.length, feedExhausted]);

  useEffect(() => {
    if (!feedExhausted) return;
    if (cards.length === 0) return;
    if (activeIndex >= (loops - 1) * cards.length && loops < 50) {
      setLoops((l) => l + 1);
    }
  }, [activeIndex, loops, cards.length, feedExhausted]);

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

  // when launched from the grid with ?start=<id>, jump to that
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

    const deviceId = deviceIdRef.current;
    if (!deviceId) return;
    void (async () => {
      const result = await toggleLikeAction({
        deviceId,
        kind: 'listing',
        targetId: id,
        liked: !wasLiked,
      });
      if (!result.ok) {
        console.error('[BrowseFeed] like toggle failed', result.error);
        setLiked((m) => ({ ...m, [id]: wasLiked }));
      }
    })();
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
    const url = `${window.location.origin}${linkForCard(active)}`;
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

  const _hasNearby = (active?.categoryVideos.length ?? 0) > 0;

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
      // in Nearby mode the swipe gesture is now
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

  // desktop wheel/trackpad cycles the Nearby pool.
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
    <FeedShell
      scrollerRef={scrollerRef}
      cards={Array.from({ length: totalCards }, (_, idx) => {
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
          <VideoCard
            key={`${card.id}-${idx}`}
            card={card}
            source={cardSource}
            cycleIdx={cardCycle}
            shouldMount={Math.abs(idx - activeIndex) <= 1}
            isActive={isThisActive}
            cardRef={(el) => setCardRef(idx, el)}
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
    >
      {/* Right rail — Xiaohongshu / TikTok pattern.
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
       * inside PhotoCard caption is preserved.
       *
       * rail reverted back up to ~6rem from
       * the safe-area baseline. had lowered it to
       * `max(1rem, safe-area)` to align with the caption block, but
       * owner feedback after living with it: the buttons sat too low,
       * thumb reach was awkward and they crowded the caption. Caption
       * stays at `bottom: 1rem` — only the rail moves up. */}
      <div
        className={`absolute right-3 ${FEED_Z.rail} flex flex-col items-center gap-3`}
        style={{ bottom: 'max(1rem, calc(env(safe-area-inset-bottom) + 0.5rem))' }}
      >
        {/* community chip replaced with a circular
         * ActionButton at the top of the rail — same visual weight as
         * Like/Save/Contact/Share so the whole column reads as one design.
         * Uses ActionButton's built-in badge to show video count in red.
         * Owner: "不好看 做成一个圆形加数字 不要文字了 放在 like 上面". */}
        {/* show Nearby button when EITHER the listing
         * belongs to a community OR it has any listing-scoped nearby videos
         *. Before
         * this, listings with community_id=null had 0-video visibility even
         * with 5 ready nearby videos in categoryVideos. */}
        {(active?.community || (active && active.categoryVideos.length > 0)) && (
          <ActionButton
            label="Nearby"
            onClick={() => {
              setSheetCardId(active.id);
              setSheetOpen(true);
              setPausedActive(true);
            }}
            badge={
              (active.community?.videoCount ?? active.categoryVideos.length) > 0
                ? (active.community?.videoCount ?? active.categoryVideos.length)
                : undefined
            }
            badgeColor="red"
          >
            <span aria-hidden="true" className="text-[20px] leading-none">
              🏘️
            </span>
          </ActionButton>
        )}
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
        {/* Share moved from top-header right-slot into
         * the bottom of the right rail. Frees the top-right for the community
         * chip (笑云 feedback: chip in the top-left was invisible), and puts
         * social/outbound actions in one column. */}
        <ActionButton label="Share" onClick={onShare}>
          <ShareIcon />
        </ActionButton>
        {/* right-rail "Nearby" button removed. The
         * top-left community chip already opens the same set of community
         * videos via CommunitySheet → CommunityCarousel — keeping both
         * surfaces was the duplication the chip was meant to replace.
         * /nearby tab in bottom nav was folded
         * into Explore sub-nav (Recommended | Nearby) — radius search
         * lives at /browse?tab=nearby. */}
        {/* phase34a (2026-06-17): right-rail mute button removed.
         * Volume is controlled by the device's system volume keys —
         * keeps the rail clean and avoids a redundant control. The
         * `muted` state is retained internally for the autoplay-blocked
         * fallback (browser blocks unmuted autoplay → start muted →
         * first interaction unmutes). */}
      </div>

      {/* centered NEARBY label removed — the
       * gold category pill on each card already tells the user they're
       * in the Nearby pool, and the right-rail Nearby button is in its
       * active gold state, so the standalone label was redundant. */}

      {/* Top header — Xiaohongshu video pattern.        * Share button moved out of the top-right and into the bottom of
       * the right rail (see below). The community chip now occupies the
       * top-right slot instead. Only Back remains here. When viewing a
       * b-roll source, Back first returns to hero; on the hero we do
       * router.back() if there's history (preserves grid scroll), else
       * push the fallback. */}
      <div
        className={`absolute inset-x-0 top-0 ${FEED_Z.topbar} flex items-center justify-between px-3 pt-3`}
      >
        <button
          type="button"
          onClick={() => {
            if (activeSource !== 'hero') {
              switchSource('hero');
              return;
            }
            // history.length > 1 means there's at least one prior entry
            // we can pop back to. window.history.length is 1 on a fresh
            // tab / deep link, in which case we use the fallback.
            if (typeof window !== 'undefined' && window.history.length > 1) {
              router.back();
            } else {
              router.push(backFallbackHref);
            }
          }}
          aria-label={activeSource !== 'hero' ? 'Back to listing video' : 'Back'}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-surface/20 bg-ink/55 text-surface backdrop-blur-md transition-colors hover:border-surface hover:text-surface"
          style={{ touchAction: 'manipulation' }}
        >
          <BackArrowIcon />
        </button>
        {/* Right slot intentionally empty — community chip renders at
         * top-3 right-3 inside the Card, above the right rail. */}
      </div>

      {/* the bottom Like/Save/Contact bar moved
       * into the right rail above. The caption block on the Card now
       * extends to the safe-area, giving an immersive bottom edge. */}

      {/* "Swipe up for more" hint removed —
       * gesture is self-evident on a TikTok-style feed and the text was
       * crowding the bottom edge over the caption. */}

      {active && (
        <LeadModal
          open={leadOpen}
          onClose={() => setLeadOpen(false)}
          agent={{ name: active.agent.name }}
          listing={{ address: active.listing.address }}
          listingId={active.listing.id}
        />
      )}

      {/* (V1 redo): community sheet (L1) + fullscreen carousel (L2).
       * Resolved once at parent level — `sheetCardId` selects which card's
       * community/data flows into the sheet. Sheet → carousel transition
       * keeps the sheet mounted underneath so closing the carousel returns
       * the user to L0 (listing video) per V1 spec — the sheet is a transient
       * lookup, not a stable anchor. */}
      {(() => {
        const sheetCard = sheetCardId ? (cards.find((c) => c.id === sheetCardId) ?? null) : null;
        // community-less listings still get a sheet
        // when they have listing-scoped nearby videos. Fall back to listing
        // address/city/state so the header renders something meaningful.
        const sheetData: CommunitySheetData | null = sheetCard
          ? sheetCard.community
            ? {
                slug: sheetCard.community.slug,
                name: sheetCard.community.name,
                city: sheetCard.community.city,
                state: sheetCard.community.state,
                description: sheetCard.community.description,
                videoCount: sheetCard.community.videoCount,
                listingCount: sheetCard.community.listingCount,
                videos: sheetCard.categoryVideos,
              }
            : sheetCard.categoryVideos.length > 0
              ? {
                  slug: sheetCard.listing.slug,
                  name: 'Nearby',
                  city: sheetCard.listing.city,
                  state: sheetCard.listing.state,
                  description: null,
                  videoCount: sheetCard.categoryVideos.length,
                  listingCount: 0,
                  videos: sheetCard.categoryVideos,
                }
              : null
          : null;
        return (
          <>
            <CommunitySheet
              open={sheetOpen && !carouselOpen}
              data={sheetData}
              onClose={() => {
                setSheetOpen(false);
                setSheetCardId(null);
              }}
              onOpenCarousel={(idx) => {
                setCarouselStartIdx(idx);
                setCarouselOpen(true);
              }}
            />
            <CommunityCarousel
              open={carouselOpen}
              videos={sheetCard?.categoryVideos ?? []}
              startIndex={carouselStartIdx}
              backLabel={sheetCard?.listing.address ?? ''}
              onClose={() => {
                // Close carousel AND sheet — V1 spec: "‹ Back" goes to L0,
                // skipping the sheet so the user lands back on the listing
                // video without an extra dismiss step.
                setCarouselOpen(false);
                setSheetOpen(false);
                setSheetCardId(null);
              }}
              // rail handlers target the parent
              // listing (the user's anchor). Reuses the same callbacks the
              // main listing feed uses, so Like/Save state is consistent
              // whether the buyer taps the rail on L0 or in the carousel.
              // Per owner: "if exploring listing then going to see the
              // community videos, contact listing owner".
              onShare={onShare}
              onToggleLike={toggleLike}
              onToggleSave={toggleSave}
              onContact={openContact}
              liked={isLiked}
              saved={isSaved}
            />
          </>
        );
      })()}
    </FeedShell>
  );
}
