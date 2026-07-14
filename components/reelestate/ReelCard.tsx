/**
 * <ReelCard> — full-bleed single-slide layout for the ReelEstate mobile feed.
 *
 * ref: docs/design/reelestate-teardown/README.md §2.1 (Reel Hero / Feed)
 *
 * F1.2 scope (this file):
 *  - Media layer: cover photo `object-cover` (video pipeline lands later; a
 *    still frame is the correct fallback for reelestate parity, README §2.1
 *    "video or first-frame photo").
 *  - Price overlay top-left (cyan gradient chip, full digits per §2.1 row 3).
 *  - Agent chip top-right (avatar ring + name).
 *  - Address block bottom-left (street on line 1, city/state[/zip] on line 2).
 *  - Right action-rail placeholder (F1.3 fills icons — this file only reserves
 *    the column so the caption block width and address wrapping match final).
 *
 * All layers sit above the media via absolute positioning inside a `relative`
 * root; each layer opts into `pointer-events-auto` since the wrapper is
 * `pointer-events-none` (parent handles scroll-snap on the section itself).
 *
 * Line-heights on the address block are intentionally NOT the canonical
 * 26/13/13/13 rig from §2.1 caption card — that's F1.4's job. Here we ship
 * the visual layout only.
 */
import type { ReelFeedListing } from '@/lib/reelestate/feed';
import { ReelActionRail } from './ReelActionRail';

interface ReelCardProps {
  listing: ReelFeedListing;
}

export function ReelCard({ listing }: ReelCardProps) {
  const cityState = `${listing.city}, ${listing.state}${listing.zip ? ` ${listing.zip}` : ''}`;
  return (
    <div className="pointer-events-none relative h-full w-full">
      <MediaLayer coverUrl={listing.cover_url} address={listing.address} />

      {/* Bottom gradient scrim so overlays stay legible over bright photos */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/80 via-black/40 to-transparent"
      />

      {/* Top-left: price chip */}
      <div className="pointer-events-auto absolute left-4 top-[calc(env(safe-area-inset-top,0px)+16px)]">
        <PriceChip price={listing.price} />
      </div>

      {/* Top-right: agent chip */}
      <div className="pointer-events-auto absolute right-4 top-[calc(env(safe-area-inset-top,0px)+16px)]">
        <AgentChip agent={listing.agent} />
      </div>

      {/* Right action rail (like / comment / share / save) */}
      <div className="pointer-events-none absolute right-3 bottom-[calc(env(safe-area-inset-bottom,0px)+140px)] flex flex-col items-center">
        <ReelActionRail
          listingId={listing.id}
          listingSlug={listing.slug}
          initialLikeCount={listing.like_count}
          initialSaveCount={listing.save_count}
        />
      </div>

      {/* Bottom-left: address block */}
      <div className="pointer-events-auto absolute left-4 right-20 bottom-[calc(env(safe-area-inset-bottom,0px)+24px)]">
        <p className="text-[20px] font-semibold leading-[26px] text-white drop-shadow">
          {listing.address}
        </p>
        <p className="mt-1 text-[13px] leading-[13px] text-white/75">{cityState}</p>
      </div>
    </div>
  );
}

function MediaLayer({ coverUrl, address }: { coverUrl: string | null; address: string }) {
  if (!coverUrl) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-bg-surface">
        <p className="px-6 text-center text-xs text-white/40">{address}</p>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- covers can be arbitrary Supabase Storage or MLS CDN URLs; keep out of next/image remote-patterns list.
    <img
      src={coverUrl}
      alt={address}
      loading="lazy"
      decoding="async"
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

function PriceChip({ price }: { price: number | null }) {
  if (price == null) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-grad-cta px-3 py-1.5 text-[15px] font-bold tracking-chip text-white shadow-glow-cyan">
      {formatPriceFull(price)}
    </span>
  );
}

function AgentChip({ agent }: { agent: ReelFeedListing['agent'] }) {
  if (!agent) return null;
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-black/40 px-2 py-1 backdrop-blur-md">
      <span className="relative block h-7 w-7 overflow-hidden rounded-full ring-2 ring-white/80">
        {agent.headshot_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- headshots come from user-supplied Supabase Storage URLs; not in next/image remote-patterns.
          <img
            src={agent.headshot_url}
            alt={agent.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-bg-elevated text-[10px] font-semibold text-white/80">
            {agent.name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </span>
      <span className="pr-1 text-[13px] font-semibold text-white">{agent.name}</span>
    </span>
  );
}

/**
 * Feed chip variant: full digits per README §2.1 row 3 ("Full digits, no K/M").
 * The canonical K/M `formatPrice` lives in caption-card contexts (§2.2 grid);
 * this hero-feed chip intentionally overrides.
 */
function formatPriceFull(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}
