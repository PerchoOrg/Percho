/**
 * CommunityListingCarousel — Scenario B · L3
 *
 * Phase 62 (2026-06-26): rewritten from a horizontal pager to a vertical
 * snap feed with the standard right-rail (Like / Save / Contact). Brings
 * this third feed surface into parity with BrowseFeed and the community
 * video feed so the buyer's interaction model is identical wherever they
 * are. Like/Save target the listing (the user's anchor at this depth);
 * Contact opens LeadModal listing-targeted, with the community owner's
 * name as the display label (lead routing is by listingId on the server).
 *
 * Constraints:
 * - No mute button (system volume keys per phase34a.T2).
 * - Tap targets ≥ 44×44.
 * - English only.
 */
'use client';

import { saveListing, unsaveListing, listSavedListingIds } from '@/app/_actions/saved-listings';
import { getOrCreateDeviceId } from '@/lib/buyer/device-id';
import { listLiked, toggleLike as toggleLikeAction } from '@/lib/buyer/likes';
import { hlsUrl, thumbnailUrl } from '@/lib/cloudflare/stream';
import Hls from 'hls.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LeadModal } from '../../../../_components/LeadModal';
import { ActionButton } from '../../../../_components/feed/ActionButton';
import { FeedShell } from '../../../../_components/feed/FeedShell';
import { FEED_RAIL_BOTTOM, FEED_Z } from '../../../../_components/feed/constants';
import {
  BackArrowIcon,
  BookmarkIcon,
  CommentIcon,
  HeartIcon,
  ShareIcon,
} from '../../../../_components/feed/icons';
import type { CommunityListingItem } from '../CommunityVideoFeed';

interface Props {
  open: boolean;
  listings: CommunityListingItem[];
  startIndex: number;
  backLabel: string;
  /** Community owner's name — used as the agent display label in LeadModal.
   *  When null, Contact is hidden (no owner to route to). */
  agentName: string | null;
  onClose: () => void;
}

function formatPrice(n: number | null): string {
  if (n == null) return '';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

export function CommunityListingCarousel({
  open,
  listings,
  startIndex,
  backLabel,
  agentName,
  onClose,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Map<number, HTMLElement>>(new Map());
  const [activeIndex, setActiveIndex] = useState(0);

  // Liked / saved hydrated once on open from the buyer's device.
  const [likedSet, setLikedSet] = useState<Set<string>>(() => new Set());
  const [savedSet, setSavedSet] = useState<Set<string>>(() => new Set());

  const [leadOpen, setLeadOpen] = useState(false);

  // Lock body scroll while open + Esc to close + ArrowUp/Down navigation.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowDown') {
        setActiveIndex((i) => {
          const next = Math.min(listings.length - 1, i + 1);
          scrollToIndex(next);
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        setActiveIndex((i) => {
          const next = Math.max(0, i - 1);
          scrollToIndex(next);
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, listings.length, onClose]);

  // Scroll to startIndex on open.
  useEffect(() => {
    if (!open) return;
    const target = Math.max(0, Math.min(startIndex, listings.length - 1));
    setActiveIndex(target);
    // Defer to next paint so the snap scroller is in the DOM.
    const id = requestAnimationFrame(() => scrollToIndex(target, false));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startIndex, listings.length]);

  // Hydrate liked/saved on first open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const deviceId = getOrCreateDeviceId();
      const ids = listings.map((l) => l.id);
      if (ids.length === 0) return;
      const [savedIds, likedIds] = await Promise.all([
        listSavedListingIds({ deviceId }),
        listLiked({ deviceId, kind: 'listing' }),
      ]);
      if (cancelled) return;
      const have = new Set(ids);
      setSavedSet(new Set(savedIds.filter((id) => have.has(id))));
      setLikedSet(new Set(likedIds.filter((id) => have.has(id))));
    })().catch(() => {
      /* ignore — UI starts empty, user can still toggle */
    });
    return () => {
      cancelled = true;
    };
  }, [open, listings]);

  // Intersection observer to track active index.
  useEffect(() => {
    if (!open) return;
    const root = scrollerRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        let bestIdx = -1;
        let bestRatio = 0;
        for (const e of entries) {
          if (e.intersectionRatio > bestRatio) {
            bestRatio = e.intersectionRatio;
            const idxAttr = (e.target as HTMLElement).dataset.idx;
            bestIdx = idxAttr ? Number(idxAttr) : -1;
          }
        }
        if (bestIdx >= 0 && bestRatio > 0.6) setActiveIndex(bestIdx);
      },
      { root, threshold: [0.6, 0.9] },
    );
    cardRefs.current.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [open, listings.length]);

  function scrollToIndex(idx: number, smooth = true) {
    const el = cardRefs.current.get(idx);
    if (!el) return;
    el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  }

  const setCardRef = useCallback((idx: number, el: HTMLElement | null) => {
    if (el) cardRefs.current.set(idx, el);
    else cardRefs.current.delete(idx);
  }, []);

  const active = listings[Math.min(activeIndex, listings.length - 1)] ?? null;
  const isLiked = active ? likedSet.has(active.id) : false;
  const isSaved = active ? savedSet.has(active.id) : false;

  const toggleLike = useCallback(() => {
    if (!active) return;
    const id = active.id;
    const wasLiked = likedSet.has(id);
    setLikedSet((s) => {
      const next = new Set(s);
      if (wasLiked) next.delete(id);
      else next.add(id);
      return next;
    });
    (async () => {
      try {
        const deviceId = getOrCreateDeviceId();
        await toggleLikeAction({ deviceId, kind: 'listing', targetId: id, liked: !wasLiked });
      } catch {
        // Roll back on failure.
        setLikedSet((s) => {
          const next = new Set(s);
          if (wasLiked) next.add(id);
          else next.delete(id);
          return next;
        });
      }
    })();
  }, [active, likedSet]);

  const toggleSave = useCallback(() => {
    if (!active) return;
    const id = active.id;
    const wasSaved = savedSet.has(id);
    setSavedSet((s) => {
      const next = new Set(s);
      if (wasSaved) next.delete(id);
      else next.add(id);
      return next;
    });
    (async () => {
      try {
        const deviceId = getOrCreateDeviceId();
        if (wasSaved) await unsaveListing({ deviceId, listingId: id });
        else await saveListing({ deviceId, listingId: id });
      } catch {
        setSavedSet((s) => {
          const next = new Set(s);
          if (wasSaved) next.add(id);
          else next.delete(id);
          return next;
        });
      }
    })();
  }, [active, savedSet]);

  const openContact = useCallback(() => setLeadOpen(true), []);

  const onShare = useCallback(async () => {
    if (!active) return;
    if (!active.agentSlug) return;
    const url = `${window.location.origin}/v/${active.agentSlug}/${active.slug}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: active.address, url });
        return;
      } catch {
        /* fall through to clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* swallow */
    }
  }, [active]);

  if (!open || listings.length === 0) return null;

  const total = listings.length;
  const safeActive = Math.min(activeIndex, total - 1);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${listings[safeActive]?.address ?? 'Listing'} carousel`}
      className="fixed inset-0 z-[60] bg-black"
    >
      <FeedShell
        scrollerRef={scrollerRef}
        cards={listings.map((l, i) => (
          <ListingSlide
            key={`${l.id}-${i}`}
            listing={l}
            index={i}
            shouldMount={Math.abs(i - safeActive) <= 1}
            isActive={i === safeActive}
            cardRef={(el) => setCardRef(i, el)}
          />
        ))}
      >
        {/* Top bar: back + counter */}
        <div
          className={`absolute inset-x-0 top-0 ${FEED_Z.topbar} flex items-center justify-between px-3 pt-3`}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to community"
            className="flex h-11 items-center gap-2 rounded-full border border-cream/20 bg-ink/55 pr-3 pl-2 text-cream backdrop-blur-md transition-colors hover:border-cream hover:text-cream"
            style={{ touchAction: 'manipulation' }}
          >
            <BackArrowIcon />
            <span className="flex flex-col text-left leading-tight">
              <span className="font-semibold text-[12px]">Back</span>
              <span className="max-w-[40vw] truncate text-[10px] text-cream/70">{backLabel}</span>
            </span>
          </button>
          <div className="flex h-9 items-center rounded-full border border-cream/20 bg-ink/55 px-3 font-medium text-[12px] text-cream backdrop-blur-md tabular-nums">
            {safeActive + 1} / {total}
          </div>
        </div>

        {/* Phase 63 (2026-06-26): top progress bar removed — those segmented
            ticks read as a horizontal-pager affordance, but this surface is a
            vertical snap feed (parity with Browse / Community video feed).
            The "i / N" counter in the top bar already conveys position. */}

        {/* Right rail */}
        <div
          className={`absolute right-3 ${FEED_Z.rail} flex flex-col items-center gap-3`}
          style={{ bottom: FEED_RAIL_BOTTOM }}
        >
          <ActionButton onClick={toggleLike} label="Like" active={isLiked} activeColor="rose">
            <HeartIcon filled={isLiked} />
          </ActionButton>
          <ActionButton onClick={toggleSave} label="Save" active={isSaved}>
            <BookmarkIcon filled={isSaved} />
          </ActionButton>
          {agentName && (
            <ActionButton onClick={openContact} label="Contact">
              <CommentIcon />
            </ActionButton>
          )}
          {active?.agentSlug && (
            <ActionButton onClick={onShare} label="Share">
              <ShareIcon />
            </ActionButton>
          )}
        </div>
      </FeedShell>

      {/* Lead modal — listing-targeted. Source auto-resolves to 'listing-page'. */}
      {agentName && active && (
        <LeadModal
          open={leadOpen}
          onClose={() => setLeadOpen(false)}
          agent={{ name: agentName }}
          listing={{ address: active.address }}
          listingId={active.id}
        />
      )}
    </div>
  );
}

function ListingSlide({
  listing,
  index,
  shouldMount,
  isActive,
  cardRef,
}: {
  listing: CommunityListingItem;
  index: number;
  shouldMount: boolean;
  isActive: boolean;
  cardRef: (el: HTMLElement | null) => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const poster = useMemo(() => {
    let p: string | null = null;
    if (listing.heroCfVideoId) {
      try {
        p = thumbnailUrl(listing.heroCfVideoId);
      } catch {
        /* fall through */
      }
    }
    if (!p) p = listing.heroPhotoUrl ?? null;
    return p;
  }, [listing.heroCfVideoId, listing.heroPhotoUrl]);

  useEffect(() => {
    if (!shouldMount) return;
    const v = ref.current;
    if (!v) return;
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    v.removeAttribute('src');
    v.load();
    if (!listing.heroCfVideoId) return;
    let src: string;
    try {
      src = hlsUrl(listing.heroCfVideoId);
    } catch {
      return;
    }
    if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = src;
    } else if (Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 20 });
      hls.loadSource(src);
      hls.attachMedia(v);
      hlsRef.current = hls;
    }
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [shouldMount, listing.heroCfVideoId]);

  // Play active card; pause others. Try unmuted, fall back to muted.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (isActive) {
      v.muted = false;
      v.play().catch(() => {
        v.muted = true;
        void v.play().catch(() => {
          /* swallow */
        });
      });
    } else {
      v.pause();
    }
  }, [isActive]);

  const hasVideo = !!listing.heroCfVideoId;
  const bbs: string[] = [];
  if (listing.beds != null) bbs.push(`${listing.beds} bd`);
  if (listing.baths != null) bbs.push(`${listing.baths} ba`);
  if (listing.sqft != null) bbs.push(`${listing.sqft.toLocaleString()} sqft`);

  return (
    <section
      ref={cardRef}
      data-idx={index}
      className="relative h-[100dvh] w-full snap-start snap-always bg-black"
    >
      {hasVideo && shouldMount ? (
        <video
          ref={ref}
          // biome-ignore lint/a11y/useMediaCaption: HLS source has no caption track.
          poster={poster ?? undefined}
          className="h-full w-full bg-black object-contain"
          playsInline
          loop
          preload="metadata"
        />
      ) : poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt={listing.address} className="h-full w-full bg-black object-contain" />
      ) : null}

      {/* Bottom overlay: price + address + bbs (real fields only). */}
      <div
        className={`absolute inset-x-0 bottom-0 ${FEED_Z.caption} bg-gradient-to-t from-black/85 via-black/45 to-transparent px-5 pt-16 pb-10 pr-20`}
      >
        {listing.price != null && (
          <div className="font-serif text-2xl text-cream leading-tight drop-shadow">
            {formatPrice(listing.price)}
          </div>
        )}
        <div className="mt-1 text-[14px] text-cream/85 drop-shadow">{listing.address}</div>
        <div className="text-[12px] text-cream/70 drop-shadow">
          {listing.city}, {listing.state}
        </div>
        {bbs.length > 0 && (
          <div className="mt-1.5 text-[12px] text-cream/70 drop-shadow">{bbs.join(' · ')}</div>
        )}
      </div>
    </section>
  );
}
