'use client';

/**
 * CommunityBody — client island that owns both the hero (so a CTA pill can sit
 * absolute inside it) and the videos/listings grid below.
 *
 * Phase 45.28 (2026-06-21, owner immersion pass):
 *   - Hero shrunk: aspect-[16/7] → aspect-[5/2] mobile (~9% shorter),
 *     md:aspect-[21/5] → md:aspect-[5/1] desktop (~16% shorter).
 *   - Removed the [Community Videos | Active Listings] pill toggle row —
 *     videos render by default so the grid butts directly against the hero
 *     for a more immersive feel.
 *   - Added a "Live here →" CTA pill at the hero's bottom-right; clicking it
 *     switches the body to the listings grid. A subtle "← Community videos"
 *     text link above the listings grid provides the return path.
 *   - Hero moved out of page.tsx into this client island so the CTA can
 *     drive the videos/listings tab state without a route round-trip.
 *
 * Phase 47.2 (2026-06-21): videos + listings grids refactored on top of
 * GridFrame + GridCard / ListingGrid so /c/[slug] matches /browse,
 * /communities, /dashboard, /dashboard/communities, /saved, /nearby — all
 * grid surfaces now share aspect-[3/4], gap-1 md:gap-1.5, and identical
 * caption/badge styling. Inline aspect-square card markup deleted.
 */

import type { BrowseCard } from '@/app/(public)/browse/_components/BrowseFeed';
import { GridCard, GridCardCaption } from '@/app/_components/GridCard';
import { GridFrame } from '@/app/_components/GridFrame';
import { ListingGrid, type ListingGridItem } from '@/app/_components/ListingGrid';
import type { GeoJsonPolygonLike } from '@/lib/geo/point-in-polygon';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { track } from '@/lib/events/track';
import {
  COMMUNITY_VIDEO_CATEGORIES,
  type CommunityVideoCategoryId,
} from '@/lib/zod/community-video-categories';
import { HeroControl } from '@/app/dashboard/_components/HeroControl';
import { useEffect, useState } from 'react';
import { CommunityBoundaryMap } from './CommunityBoundaryMap';

const CATEGORY_META = new Map(COMMUNITY_VIDEO_CATEGORIES.map((m) => [m.id, m] as const));

type CommunityVideo = {
  id: string;
  cf_video_id: string;
  title: string | null;
  category: string | null;
};

type Tab = 'videos' | 'listings';

export function CommunityBody({
  community,
  heroCoverUrl,
  boundary,
  nearby,
  videos,
  listings,
}: {
  community: {
    id: string;
    name: string;
    slug: string;
    city: string | null;
    state: string;
    description: string | null;
    residents_count: string | null;
    avg_income: string | null;
    avg_age: string | null;
    homeowners_pct: string | null;
    attributes: string[] | null;
    interests: string[] | null;
  };
  heroCoverUrl: string | null;
  boundary: GeoJsonPolygonLike | null;
  nearby: Array<{ name: string; city: string | null; state: string; href: string | null }>;
  videos: CommunityVideo[];
  listings: BrowseCard[];
}) {
  const [tab, setTab] = useState<Tab>('videos');

  // Phase 50: fire one page_view per community visit so the agent's
  // Analytics tab on /dashboard/communities/[id] has data to show. The
  // events route enforces XOR(listing_id, community_id) — we only set
  // community_id here.
  useEffect(() => {
    track({ event_type: 'page_view', community_id: community.id });
  }, [community.id]);

  return (
    <div className="mx-auto max-w-6xl">
      {/* Hero — phase 45.28: 5/2 mobile, 5/1 desktop. */}
      <div className="relative aspect-[5/2] w-full overflow-hidden bg-surface md:aspect-[5/1] sm:rounded-b-xl">
        {heroCoverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroCoverUrl}
            alt={community.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-bronze/30 to-ink" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-ink/10" />
        {/* Phase 67.9: top-left ← Back chip — same HeroControl style as the
            agent dashboard hero, returning the buyer to the /communities
            grid (Explore tab). */}
        <div className="absolute left-3 top-3 z-10 sm:left-5 sm:top-5">
          <HeroControl href="/communities">← Back</HeroControl>
        </div>
        <div className="absolute inset-x-0 bottom-0 px-4 py-3 sm:px-6 sm:py-4">
          <h1 className="font-semibold text-2xl text-cream tracking-tight sm:text-3xl">
            {community.name}
          </h1>
          {/* Phase 45.28.6: CTA folds back inline (variant I1).
           *   Same line as the city, weight 600 / pure white /
           *   1.5px underline / arrow. Loud enough to land in 1s but
           *   still reads as a sentence, not chrome. State-flips to
           *   "← Walk through" on the listings tab. */}
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="text-cream/90">
              {community.city ? `${community.city}, ${community.state}` : community.state}
            </span>
            <span className="text-cream/60" aria-hidden="true">
              ·
            </span>
            <button
              type="button"
              onClick={() => setTab(tab === 'videos' ? 'listings' : 'videos')}
              className="font-semibold text-cream underline decoration-cream decoration-[1.5px] underline-offset-[3px] transition hover:decoration-cream/70"
            >
              {tab === 'videos' ? (
                <>
                  Live here <span aria-hidden="true">→</span>
                </>
              ) : (
                <>
                  <span aria-hidden="true">←</span> Walk through
                </>
              )}
            </button>
          </div>
          {community.description ? (
            <p className="mt-1 max-w-2xl text-cream/80 text-xs sm:text-sm">
              {community.description}
            </p>
          ) : null}
        </div>
      </div>

      {/* Phase 87.1 / 87.2: Nextdoor demographics + tag chips + nearby.
          Data we already have in the DB, rendered as three white-card
          sections. Anything empty collapses — we don't fabricate. */}
      <CommunityStats
        residents={community.residents_count}
        income={community.avg_income}
        age={community.avg_age}
        homeowners={community.homeowners_pct}
        attributes={community.attributes}
        interests={community.interests}
        nearby={nearby}
      />

      {/* Body — Phase 47.2: padding aligned with grid gap (px-1 md:px-1.5)
          so the outer margin matches inter-card gutters and matches
          GridPageShell elsewhere. */}
      <div className="px-1 py-4 md:px-1.5">
        {tab === 'videos' ? (
          <VideosGrid communitySlug={community.slug} videos={videos} />
        ) : (
          <ListingsGrid listings={listings} />
        )}
      </div>

      {/* Phase 87: neighborhood boundary map, so buyers can see the actual
          shape of the community they are considering. Lazy-loaded MapLibre
          + Carto Positron — no vendor token, no bill. */}
      {boundary ? (
        <div className="px-1 pb-6 md:px-1.5">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-semibold text-ink text-sm">Neighborhood map</h2>
            <span className="text-muted text-xs">Boundary from Nextdoor</span>
          </div>
          <CommunityBoundaryMap
            boundary={boundary}
            className="h-72 w-full overflow-hidden rounded-lg border border-line sm:h-96"
          />
        </div>
      ) : null}
    </div>
  );
}

function VideosGrid({
  communitySlug,
  videos,
}: {
  communitySlug: string;
  videos: CommunityVideo[];
}) {
  if (videos.length === 0) {
    return (
      <div className="rounded border border-line border-dashed bg-surface px-6 py-12 text-center">
        <p className="text-ink2 text-sm">No videos in this neighborhood yet.</p>
      </div>
    );
  }
  return (
    <GridFrame>
      {videos.map((v) => {
        const meta = v.category ? CATEGORY_META.get(v.category as CommunityVideoCategoryId) : null;
        const coverUrl = thumbnailUrl(v.cf_video_id);
        return (
          <GridCard
            key={v.id}
            href={`/c/${communitySlug}/feed?start=${v.id}`}
            coverUrl={coverUrl}
            alt={meta?.label ?? 'Neighborhood video'}
            fallback={
              <div className="grid h-full w-full place-items-center text-muted text-xs">
                No cover
              </div>
            }
            caption={
              meta ? (
                <GridCardCaption title={meta.label} sub={meta.blurb} />
              ) : (
                <span className="sr-only">Neighborhood video</span>
              )
            }
          />
        );
      })}
    </GridFrame>
  );
}

function ListingsGrid({ listings }: { listings: BrowseCard[] }) {
  if (listings.length === 0) {
    return (
      <div className="rounded border border-line border-dashed bg-surface px-6 py-12 text-center">
        <p className="text-ink2 text-sm">No active listings in this neighborhood yet.</p>
      </div>
    );
  }
  const items: ListingGridItem[] = listings.map((card) => {
    // Phase 60: agent's cover_url wins over the mediaKind hero.
    const realSrc =
      card.gridCoverUrl ??
      (card.mediaKind === 'video'
        ? thumbnailUrl(card.hero.cfVideoId)
        : (card.heroPhotoUrl as string));
    return {
      id: card.listing.id,
      href:
        card.mediaKind === 'video'
          ? `/browse/feed?start=${encodeURIComponent(card.listing.id)}`
          : `/v/${card.agent.slug}/${card.listing.slug}`,
      coverUrl: realSrc ?? null,
      price: card.listing.price,
      beds: card.listing.beds,
      baths: card.listing.baths,
      sqft: card.listing.sqft,
      address: card.listing.address,
      city: card.listing.city,
      state: card.listing.state,
      zip: card.listing.zip,
    };
  });
  return <ListingGrid items={items} />;
}

/**
 * Phase 87.1 / 87.2: community stats + tag chips + nearby.
 *
 * Layout mirrors the buyer-detail mock at
 *   videos-anytime-get-plugin.trycloudflare.com/detail.html
 * where each surface (stats grid / vibe / interests / nearby) sits in its own
 * white card so the eye can parse them independently. Nextdoor's demographic
 * values are pre-formatted strings on the row ('4,361', '$151K', '73%') — we
 * render them verbatim. Age gets a 'yrs' suffix because the raw value is
 * unit-less. Attributes and interests use different chip fills so buyers
 * can tell "what locals say" apart from "what they do".
 *
 * Every block is optional; if the whole record is bare we return null.
 */
function CommunityStats({
  residents,
  income,
  age,
  homeowners,
  attributes,
  interests,
  nearby,
}: {
  residents: string | null;
  income: string | null;
  age: string | null;
  homeowners: string | null;
  attributes: string[] | null;
  interests: string[] | null;
  nearby: Array<{ name: string; city: string | null; state: string; href: string | null }>;
}) {
  type Stat = { icon: string; label: string; value: string };
  const stats: Stat[] = [];
  if (residents) stats.push({ icon: '👥', label: 'Residents', value: residents });
  if (homeowners) stats.push({ icon: '🏠', label: 'Homeowners', value: homeowners });
  if (income) stats.push({ icon: '💵', label: 'Avg income', value: income });
  if (age) stats.push({ icon: '🎂', label: 'Median age', value: `${age} yrs` });

  const attrs = (attributes ?? []).slice(0, 10);
  const ints = (interests ?? []).slice(0, 10);
  const nrb = nearby.slice(0, 6);

  const hasAnything =
    stats.length > 0 || attrs.length > 0 || ints.length > 0 || nrb.length > 0;
  if (!hasAnything) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-3 px-4 py-5 sm:py-6">
      {stats.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-line bg-surface px-3 py-2.5"
            >
              <div className="text-muted text-xs">
                <span className="mr-1">{s.icon}</span>
                {s.label}
              </div>
              <div className="mt-0.5 font-semibold text-ink text-lg sm:text-xl">
                {s.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {attrs.length > 0 ? (
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="mb-2 font-semibold text-ink text-sm">Vibe</div>
          <div className="flex flex-wrap gap-1.5">
            {attrs.map((a) => (
              <span
                key={a}
                className="rounded-full border border-line bg-bg px-2.5 py-1 text-ink2 text-xs"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {ints.length > 0 ? (
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="mb-2 font-semibold text-ink text-sm">
            What neighbors are into
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ints.map((i) => (
              <span
                key={i}
                className="rounded-full border border-line bg-bg px-2.5 py-1 text-ink2 text-xs"
              >
                {i}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {nrb.length > 0 ? (
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="mb-2 font-semibold text-ink text-sm">
            Nearby neighborhoods
          </div>
          <div className="grid grid-cols-2 gap-2">
            {nrb.map((n) => {
              const inner = (
                <>
                  <div className="truncate font-medium text-ink text-sm">
                    {n.name}
                  </div>
                  <div className="truncate text-muted text-xs">
                    {n.city ? `${n.city}, ${n.state}` : n.state}
                  </div>
                </>
              );
              return n.href ? (
                <a
                  key={n.name}
                  href={n.href}
                  className="rounded-lg border border-line bg-bg p-2 transition hover:border-bronze"
                >
                  {inner}
                </a>
              ) : (
                <div
                  key={n.name}
                  className="rounded-lg border border-line bg-bg p-2 opacity-70"
                >
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
