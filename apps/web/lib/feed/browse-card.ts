/**
 * The shape of a browse-feed card, and the pure logic for picking which of
 * its videos to play.
 *
 * These lived inside the BrowseFeed component until phase52, which meant
 * `lib/feed/browse-cards.ts` — the module that *builds* these cards — had to
 * import its own return type back out of a route component, along with
 * lib/listings/feed-load.ts and the mobile feed API route. The dependency
 * pointed the wrong way; nine modules import BrowseCard and only two of them
 * are components.
 *
 * `poolFor` and `pickVideo` come along because they are pure functions of a
 * card and carry the whole "which video does this cycle show" policy.
 */

export type BrowseSourceVideo = {
  cfVideoId: string;
  /**
   * optional 1920x1080 landscape variant of the
   * same auto-rendered reel. Set when the render worker detects ≥80%
   * landscape source photos and produces a horizontal companion video.
   * The feed player exposes a fullscreen toggle when this is present.
   */
  cfVideoIdLandscape?: string | null;
  /**
   * direct mp4 URL for demo/mock listings that
   * bypass Cloudflare Stream. When set, the Card plays this URL as a
   * plain <video src>; `cfVideoId` is ignored (typically empty). At most
   * one of {cfVideoId, externalUrl} carries a real value.
   */
  externalUrl?: string | null;
  line1: string;
  line2?: string;
  /**
   * community-video category id (12-value enum
   * from `lib/zod/community-video-categories.ts`). Set on cards in the
   * single Nearby pool so the Card overlay can render the category
   * label + blurb pill above the caption. `undefined` for hero pool.
   */
  category?: string;
};

export type BrowseCard = {
  id: string;
  /**
   * listings can be photo-only (no ready video).
   * `mediaKind` discriminates how the grid renders the cover; the swipe
   * feed filters to `mediaKind === 'video'` because the immersive feed
   * is video-only by design ("TikTok for Homebuying" framing).
   *   - 'video' → use `hero.cfVideoId` for poster/HLS.
   *   - 'photo' → use `heroPhotoUrl` directly. `hero.cfVideoId` is empty.
   */
  mediaKind: 'video' | 'photo';
  hero: { cfVideoId: string; cfVideoIdLandscape?: string | null; externalUrl?: string | null };
  /** Set when mediaKind === 'photo'. Public Supabase Storage URL. */
  heroPhotoUrl?: string;
  /**
   * grid thumbnail override sourced from
   * `listings.cover_url`. When the agent picks "Set as cover" on either
   * a photo or a video, this URL flows through. Grid consumers (`/browse`,
   * `/saved`, `/nearby`, `/c/[slug]`) prefer this over the
   * mediaKind-derived hero so the cover the agent picked actually shows
   * up on the buyer side. The swipe feed (`mediaKind`) is unchanged on
   * purpose — picking a photo cover for a video listing still lets the
   * buyer enter the video swipe; only the grid card is re-skinned.
   */
  gridCoverUrl?: string;
  /**
   * full photo URL list for the photo branch of the
   * detail page. Only set when mediaKind === 'photo' AND we want a swipeable
   * carousel (not just a grid cover). `/browse` grid leaves this undefined.
   * Order matches `listing_photos.sort_order`. First entry is the cover.
   */
  photos?: string[];
  /**
   * How many photos the listing actually has, regardless of media kind.
   *
   * Distinct from `photos` above, which is only populated for the photo-only
   * carousel branch. The redline's listing card puts a "⊕ N Photos" pill on the
   * hero, and that needs a count even for a video-led listing. Read from the
   * same `listing_photos` rows the hero already comes from, so it costs no
   * extra query. Absent when the listing has no photo rows at all (1 of 260).
   */
  photoCount?: number;
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
   * single Nearby pool — replaces schools /
   * pois / neighborhood splits with one feed of community videos, each
   * carrying a 12-category id. The right rail has one "Nearby" entry;
   * tapping it switches into this pool. The legacy three arrays above
   * are kept on the type so existing callers compile, but the feed
   * itself reads `categoryVideos` only.
   */
  categoryVideos: BrowseSourceVideo[];
  /**
   * plain-text schools / POIs for the photo branch
   * of the detail page (no community videos to switch to, so the right
   * rail is hidden — buyers see this list under the photo caption block
   * instead). `/browse` grid + video cards leave these undefined.
   */
  photoSchools?: { name: string; grades: string | null; rating: number | null }[];
  photoPois?: { name: string; distance_text: string | null }[];
  /**
   * present only when the card is rendered from
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
    zip: string | null;
    price: number | null;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    /**
     * Coordinates, when the row is geocoded. Feeds the mobile card's locality
     * map thumbnail (2026-07-28 card structure); web ignores them.
     */
    lat?: number | null;
    lng?: number | null;
    /** Pre-rendered locality map tile (public Storage URL); mobile card only. */
    mapUrl?: string | null;
    /**
     * Multi-paragraph description. Each entry is one paragraph;
     * rendered as the bottom caption (Xiaohongshu-style), expandable on tap.
     */
    description: string[];
    /**
     * provenance for externally-sourced listings.
     * Internal (agent-owned) listings leave both null. When `source === 'fmls'`,
     * the listing belongs to an external MLS agent (see `agent` below for the
     * verbatim FMLS attribution) and the detail-page link uses
     * `/v/fmls/{sourceId}` — NOT `/v/{agent.slug}/{listing.slug}` because
     * external listings have no Percho agent slug.
     */
    source?: string | null;
    sourceId?: string | null;
  };
  agent: {
    /**
     * For internal listings: the Percho agent's slug (used to build
     * `/v/{slug}/{listingSlug}` and `/a/{slug}`).
     * For external listings: empty string — the card should route
     * via `linkFor(card)` which checks `listing.source` and skips agent.slug.
     * Never render `/a/{agent.slug}` when the agent has no Percho account.
     */
    slug: string;
    /** External listings: verbatim FMLS list_agent name. */
    name: string;
    email: string | null;
    /** External listings: verbatim FMLS list_agent_phone (see external flag). */
    phone: string | null;
    /**
     * FMLS office (broker) name — set only for external listings.
     * Rendered as "Listed by {name} · {office}" in CaptionCard, no link.
     */
    office?: string | null;
    /**
     * true when this listing is externally-sourced (FMLS import).
     * Caption card renders name+office as plain text (no /a/{slug} link)
     * and the phone is intentionally not shown (see phase 94 decision log).
     */
    isExternal?: boolean;
  };
  /**
   * set when the listing belongs to a community.
   * BrowseFeed renders a top-left chip per V1 prototype Scenario A; tapping
   * the chip opens CommunitySheet (L1) — does NOT navigate. videoCount is
   * the fan-out community-video pool size; listingCount is the number of
   * published listings in this community (real, used for sheet header).
   */
  community?: {
    slug: string;
    name: string;
    city: string | null;
    state: string;
    description: string | null;
    videoCount: number;
    listingCount: number;
  };
};

export type Source = 'hero' | 'nearby';

export function poolFor(card: BrowseCard, source: Source): number {
  if (card.mediaKind === 'photo') {
    // Photos: swipe horizontally through the photo[] carousel. Source rail
    // is hidden in the parent — `source` is always 'hero' here.
    return Math.max(1, card.photos?.length ?? 1);
  }
  if (source === 'nearby') return card.categoryVideos.length;
  // hero: count heroVideos pool if provided, else 1 (single hero).
  return card.heroVideos && card.heroVideos.length > 0 ? card.heroVideos.length : 1;
}

export function pickVideo(card: BrowseCard, source: Source, cycleIdx: number): BrowseSourceVideo {
  if (source === 'nearby' && card.categoryVideos.length > 0) {
    return card.categoryVideos[cycleIdx % card.categoryVideos.length] as BrowseSourceVideo;
  }
  // hero: use heroVideos pool if provided, else fall back to single hero.
  if (card.heroVideos && card.heroVideos.length > 0) {
    return card.heroVideos[cycleIdx % card.heroVideos.length] as BrowseSourceVideo;
  }
  return {
    cfVideoId: card.hero.cfVideoId,
    cfVideoIdLandscape: card.hero.cfVideoIdLandscape ?? null,
    externalUrl: card.hero.externalUrl ?? null,
    line1: card.listing.address,
    line2: `${card.listing.city}, ${card.listing.state}`,
  };
}
