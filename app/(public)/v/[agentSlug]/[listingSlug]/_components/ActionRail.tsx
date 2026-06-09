'use client';

/**
 * ActionRail — right-side floating action column on the public listing page.
 *
 * V1 lean version (per Phase 3 plan): Heart, Share, Contact only.
 * - Heart: local state only in 3.3 — Phase 5 wires real saves.
 * - Share: navigator.share() with copy-to-clipboard fallback.
 * - Contact: opens placeholder alert — Phase 3.6 replaces with LeadModal.
 *
 * Demo's dislike + filter chips dropped: those drove ML-recommendation
 * mechanics that don't exist in V1 backend.
 */

import type { FeedAgent, FeedListing } from './types';

type Props = {
  liked: boolean;
  onToggleLike: () => void;
  listing: FeedListing;
  agent: FeedAgent;
};

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      width={24}
      height={24}
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      width={22}
      height={22}
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.59 13.51l6.83 3.98" />
      <path d="M15.41 6.51l-6.82 3.98" />
    </svg>
  );
}

function ContactIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      width={22}
      height={22}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function ActionRail({ liked, onToggleLike, listing, agent }: Props) {
  async function handleShare() {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const shareData = {
      title: `${listing.address} · ${listing.city}, ${listing.state}`,
      text: `Check out this listing from ${agent.name}`,
      url,
    };
    try {
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        await navigator.share(shareData);
        return;
      }
    } catch {
      // user cancelled or share failed — fall through to clipboard.
    }
    try {
      await navigator.clipboard?.writeText(url);
    } catch {
      // clipboard blocked — silent. Phase 3.7 may add a toast.
    }
  }

  function handleContact() {
    // Phase 3.6 replaces with LeadModal (UI-only); Phase 5 wires the POST.
    if (typeof window !== 'undefined') {
      window.alert('Contact form lands in Phase 3.6');
    }
  }

  const buttonBase =
    'flex h-12 w-12 items-center justify-center rounded-full border bg-black/55 backdrop-blur-md shadow-lg transition-colors';

  return (
    <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
      <div className="pointer-events-auto flex flex-col gap-4">
        <button
          type="button"
          aria-label={liked ? 'Unsave listing' : 'Save listing'}
          aria-pressed={liked}
          onClick={onToggleLike}
          className={`${buttonBase} ${liked ? 'border-gold bg-gold/90 text-ink' : 'border-white/15 text-cream hover:text-gold'}`}
        >
          <HeartIcon filled={liked} />
        </button>
        <button
          type="button"
          aria-label="Share listing"
          onClick={handleShare}
          className={`${buttonBase} border-white/15 text-cream hover:text-gold`}
        >
          <ShareIcon />
        </button>
        <button
          type="button"
          aria-label="Contact agent"
          onClick={handleContact}
          className={`${buttonBase} border-white/15 text-cream hover:text-gold`}
        >
          <ContactIcon />
        </button>
      </div>
    </div>
  );
}
