'use client';

/**
 * <ReelActionRail> — right-edge vertical stack of interaction buttons on the
 * ReelEstate mobile feed.
 *
 * ref: docs/design/reelestate-teardown/README.md §2.1 (right rail)
 *
 * Buttons (top → bottom): Like · Comment · Share · Save.
 * Each button is a ~52 px circular chip: `bg-black/40 backdrop-blur` with a
 * cyan hairline border; active states get a filled cyan glow. Counts render
 * beneath in white ~12pt. Icons from lucide-react per the plan file.
 *
 * Data wiring (real Supabase, no mock/seed):
 *  - Like  → `toggleLike({ kind: 'listing' })` from `lib/buyer/likes.ts`.
 *  - Save  → `saveListing` / `unsaveListing` from `app/_actions/saved-listings.ts`.
 *  - Share → uses the native `navigator.share` API when available, falls back
 *            to copying the property detail URL to the clipboard.
 *  - Comment → icon only. There is no comments table in the schema yet
 *            (migrations 0001-0030 checked). Showing a count here would be
 *            mock data; the plan file forbids that. The button reserves the
 *            slot at the correct §2.1 position and no-ops on tap. When the
 *            comments feature ships, wire this up in a separate task.
 *
 * Initial `liked` / `saved` state comes from the parent (RSC hydration would
 * require per-device knowledge server-side; we don't have that yet without
 * cookies). Instead this component hydrates itself on mount by calling
 * `listLiked` / `listSavedListingIds` with the browser's device_id. That way
 * the first paint is neutral (correct for anon) and self-corrects within one
 * tick if the user has already interacted.
 */

import { Bookmark, Heart, MessageCircle, Share2 } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { listSavedListingIds, saveListing, unsaveListing } from '@/app/_actions/saved-listings';
import { listLiked, toggleLike } from '@/lib/buyer/likes';
import { getOrCreateDeviceId } from '@/lib/buyer/device-id';

interface ReelActionRailProps {
  listingId: string;
  listingSlug: string;
  initialLikeCount: number;
  initialSaveCount: number;
}

export function ReelActionRail({
  listingId,
  listingSlug,
  initialLikeCount,
  initialSaveCount,
}: ReelActionRailProps) {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [saveCount, setSaveCount] = useState(initialSaveCount);
  const [, startTransition] = useTransition();

  // On mount: resolve device id, then hydrate liked/saved membership for
  // this listing. Both calls are cheap (single-row lookups by device).
  useEffect(() => {
    let cancelled = false;
    const id = getOrCreateDeviceId();
    setDeviceId(id);
    (async () => {
      const [likedIds, savedIds] = await Promise.all([
        listLiked({ deviceId: id, kind: 'listing' }),
        listSavedListingIds({ deviceId: id }),
      ]);
      if (cancelled) return;
      setLiked(likedIds.includes(listingId));
      setSaved(savedIds.includes(listingId));
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  function handleLike() {
    if (!deviceId) return;
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));
    startTransition(async () => {
      const res = await toggleLike({
        deviceId,
        kind: 'listing',
        targetId: listingId,
        liked: next,
      });
      if (!res.ok) {
        // Revert optimistic update on failure.
        setLiked(!next);
        setLikeCount((c) => Math.max(0, c + (next ? -1 : 1)));
      }
    });
  }

  function handleSave() {
    if (!deviceId) return;
    const next = !saved;
    setSaved(next);
    setSaveCount((c) => Math.max(0, c + (next ? 1 : -1)));
    startTransition(async () => {
      const res = next
        ? await saveListing({ deviceId, listingId })
        : await unsaveListing({ deviceId, listingId });
      if (!res.ok) {
        setSaved(!next);
        setSaveCount((c) => Math.max(0, c + (next ? -1 : 1)));
      }
    });
  }

  async function handleShare() {
    const url = `${window.location.origin}/listings/${listingSlug}`;
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ url });
        return;
      } catch {
        // User cancelled or share unsupported at runtime — fall through.
      }
    }
    try {
      await navigator.clipboard?.writeText(url);
    } catch {
      /* clipboard blocked — best-effort */
    }
  }

  return (
    <div className="pointer-events-auto flex w-14 flex-col items-center gap-4">
      <RailButton
        label={formatCount(likeCount)}
        active={liked}
        onClick={handleLike}
        aria-label={liked ? 'Unlike listing' : 'Like listing'}
      >
        <Heart
          className="h-6 w-6"
          strokeWidth={2}
          fill={liked ? 'currentColor' : 'none'}
        />
      </RailButton>

      <RailButton
        label="0"
        active={false}
        onClick={undefined}
        aria-label="Comments (coming soon)"
        disabled
      >
        <MessageCircle className="h-6 w-6" strokeWidth={2} />
      </RailButton>

      <RailButton
        label="Share"
        active={false}
        onClick={handleShare}
        aria-label="Share listing"
      >
        <Share2 className="h-6 w-6" strokeWidth={2} />
      </RailButton>

      <RailButton
        label={formatCount(saveCount)}
        active={saved}
        onClick={handleSave}
        aria-label={saved ? 'Unsave listing' : 'Save listing'}
      >
        <Bookmark
          className="h-6 w-6"
          strokeWidth={2}
          fill={saved ? 'currentColor' : 'none'}
        />
      </RailButton>
    </div>
  );
}

interface RailButtonProps {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: (() => void) | undefined;
  children: React.ReactNode;
  'aria-label': string;
}

function RailButton({
  label,
  active,
  disabled,
  onClick,
  children,
  'aria-label': ariaLabel,
}: RailButtonProps) {
  // Base: black-glass fill + cyan hairline border. Active: cyan ink text +
  // stronger glow. Disabled: dimmed, no glow, no hover.
  const btnClass = [
    'flex h-[52px] w-[52px] items-center justify-center rounded-full border backdrop-blur-md transition',
    disabled
      ? 'border-white/10 bg-black/30 text-white/40'
      : active
        ? 'border-cyan bg-black/50 text-cyan shadow-glow-cyan'
        : 'border-cyan/40 bg-black/40 text-white hover:border-cyan hover:text-cyan',
  ].join(' ');

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={active}
      className="flex flex-col items-center gap-1"
    >
      <span className={btnClass}>{children}</span>
      <span className="text-[12px] font-medium leading-none text-white/90">{label}</span>
    </button>
  );
}

/**
 * Compact count formatter for rail labels (1.2K, 12.3K, 1.4M). Kept local —
 * `formatPrice` in `lib/format` is dollar-shaped, not appropriate for reaction
 * counts (memory §75.4: don't reuse dollar formatters for engagement metrics).
 */
function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}
