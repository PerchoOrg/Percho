'use client';

/**
 * <AgentProfileTabs> — Reels | Properties tab bar for the mobile Agent
 * Profile screen (`/agents/[handle]`).
 *
 * ref: docs/design/reelestate-teardown/README.md §2.5
 *
 * A4.2 scope: two tabs, both rendering a 2-col grid.
 *   - `Reels` shows only listings that have at least one `listing_videos`
 *     row (`has_video`), with a small cyan "Reel" badge over the cover.
 *   - `Properties` shows every active listing by this agent.
 *
 * Client component because the tab state is local UI only. Tile visuals
 * mirror the `/listings` L3.1 grid so an agent's portfolio reads as the same
 * card the buyer sees on the global properties list (canonical 15/11/11
 * caption rig from L3.3, memory §74.14). A dedicated `<ListingTile>` isn't
 * extracted yet — this file duplicates the tile locally per CLAUDE.md §0.2
 * ("simplest thing that works, no speculative abstraction"). If a third
 * caller shows up we'll extract then.
 *
 * Data hydrated from `fetchAgentListings` (real Supabase, anon RLS,
 * `unstable_cache` 60s). Empty tab → neutral empty-state string, no seed.
 */
import Link from 'next/link';
import { useState } from 'react';
import type { AgentListingCard } from '@/lib/reelestate/agentListings';
import { formatPrice } from '@/lib/format/price';

type Tab = 'reels' | 'properties';

export function AgentProfileTabs({ listings }: { listings: AgentListingCard[] }) {
  const [tab, setTab] = useState<Tab>('reels');
  const reels = listings.filter((l) => l.has_video);
  const shown = tab === 'reels' ? reels : listings;
  const reelsCount = reels.length;
  const propsCount = listings.length;

  return (
    <section className="mt-6">
      <div
        role="tablist"
        aria-label="Agent content"
        className="flex w-full border-b border-bg-border"
      >
        <TabButton
          active={tab === 'reels'}
          count={reelsCount}
          label="Reels"
          onClick={() => setTab('reels')}
        />
        <TabButton
          active={tab === 'properties'}
          count={propsCount}
          label="Properties"
          onClick={() => setTab('properties')}
        />
      </div>

      {shown.length === 0 ? (
        <p className="mt-8 px-2 text-center text-sm text-white/50">
          {tab === 'reels' ? 'No reels yet.' : 'No active listings yet.'}
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-3">
          {shown.map((l) => (
            <li key={l.id}>
              <AgentListingTile listing={l} showReelBadge={tab === 'reels'} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TabButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 pb-2 pt-1 text-[13px] font-medium tracking-tight transition-colors ${
        active
          ? 'border-b-2 border-cyan text-white'
          : 'border-b-2 border-transparent text-white/50 hover:text-white/70'
      }`}
    >
      {label} <span className="text-white/40">{count}</span>
    </button>
  );
}

function AgentListingTile({
  listing,
  showReelBadge,
}: {
  listing: AgentListingCard;
  showReelBadge: boolean;
}) {
  const addressLine = `${listing.address}, ${listing.city}, ${listing.state}${
    listing.zip ? ` ${listing.zip}` : ''
  }`;
  const specs = [
    listing.beds != null ? `${listing.beds} bd` : null,
    listing.baths != null ? `${listing.baths} ba` : null,
    listing.sqft != null ? `${listing.sqft.toLocaleString('en-US')} sqft` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const priceLabel = formatPrice(listing.price);

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="block overflow-hidden rounded-tile border border-bg-border bg-bg-surface"
    >
      <div className="relative w-full bg-bg-elevated" style={{ aspectRatio: '4 / 5' }}>
        {listing.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- covers can be arbitrary Supabase Storage or MLS CDN URLs; kept out of next/image remote-patterns list.
          <img
            src={listing.cover_url}
            alt={listing.address}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-[11px] text-white/40">
            {listing.address}
          </div>
        )}
        {showReelBadge && listing.has_video ? (
          <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium tracking-tight text-cyan">
            Reel
          </span>
        ) : null}
      </div>
      <div className="px-3 py-2.5">
        {priceLabel ? (
          <p className="text-[15px] font-semibold leading-[15px] tabular-nums text-cyan">
            {priceLabel}
          </p>
        ) : null}
        {specs ? (
          <p className="mt-1.5 text-[11px] leading-[11px] text-white/70">{specs}</p>
        ) : null}
        <p className="mt-1 text-[11px] leading-[11px] text-white/50">{addressLine}</p>
      </div>
    </Link>
  );
}
