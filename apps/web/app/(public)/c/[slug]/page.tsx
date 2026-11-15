/**
 * /c/[slug] — buyer-facing community page.
 *
 * shipped IA + thumbnail grid + active-listings count.
 * –45.11: hero shrunk, sub-tab toggle introduced.
 * hero + grid moved into
 * <CommunityBody> client island. Hero shrunk further (5/2 mobile, 5/1
 * desktop), pill toggle row removed (videos default), and a "Live here →"
 * CTA pill in the hero's bottom-right now switches the body to the
 * active-listings grid.
 */

import { resolveCommunityCoverWithCfIds } from '@/lib/communities/cover';
import { fetchFilmPhotoCredits } from '@/lib/communities/film-credits';
import { fetchAiTourVideoByCommunity } from '@/lib/feed/ai-tour-videos';
import { fetchBrowseCardsByCommunitySlug } from '@/lib/feed/browse-cards';
import {
  fetchVerticalVideos,
  streamManifestUrl,
  streamPosterUrl,
} from '@/lib/feed/vertical-videos';
import { LISTINGS_ON_WEB } from '@/lib/listings/listings-on-web';
import { sharedPageMetadata, siteOrigin } from '@/lib/share/app-links';
import type { Row } from '@/lib/supabase/rows';
import { createClient, createUncachedServiceClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { CommunityBody } from './_components/CommunityBody';

/**
 * Every film, read once per request — the metadata wants the film's first
 * frame for the link card, and the page plays the film.
 */
const getFilms = cache(() => fetchVerticalVideos(createUncachedServiceClient()));

/**
 * The link card a shared community draws in iMessage / WhatsApp, and Safari's
 * app banner (phase335 — the iOS app shares this page; `lib/share/app-links.ts`).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: community } = await supabase
    .from('communities')
    .select('id, name, city, state, description, status')
    .eq('slug', slug)
    .maybeSingle();
  if (!community || community.status !== 'active') return { title: 'Community not found' };
  const filmUid = (await getFilms()).byCommunity.get(community.id);
  const where = community.city ? `${community.city}, ${community.state}` : community.state;
  return sharedPageMetadata({
    title: `${community.name} · ${where}`,
    description:
      community.description?.trim() || `Watch ${community.name}'s neighborhood film on Percho.`,
    path: `/c/${slug}`,
    image: filmUid ? streamPosterUrl(filmUid) : null,
    origin: siteOrigin(),
  });
}

type CommunityRow = Pick<
  Row<'communities'>,
  | 'id'
  | 'name'
  | 'slug'
  | 'city'
  | 'state'
  | 'description'
  | 'created_by'
  | 'cover_video_id'
  | 'cover_storage_path'
  | 'boundary'
  | 'nearby'
  | 'residents_count'
  | 'avg_income'
  | 'avg_age'
  | 'homeowners_pct'
  | 'attributes'
  | 'interests'
>;

interface VideoRow {
  id: string;
  cf_video_id: string;
  title: string | null;
  category: string | null;
}

export default async function CommunityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: community } = (await supabase
    .from('communities')
    .select(
      'id, name, slug, city, state, description, created_by, cover_video_id, cover_storage_path, status, residents_count, avg_income, avg_age, homeowners_pct, attributes, interests, nearby, boundary',
    )
    .eq('slug', slug)
    .maybeSingle()) as { data: (CommunityRow & { status: string }) | null };

  // inactive communities are 404 to buyers (the creating agent
  // sees them in /dashboard/communities so they can reactivate).
  if (!community || community.status !== 'active') notFound();

  const { data: memberships } = (await supabase
    .from('community_video_membership')
    .select('video_id')
    .eq('community_id', community.id)) as { data: Array<{ video_id: string }> | null };

  const videoIds = (memberships ?? []).map((m) => m.video_id);

  let videos: VideoRow[] = [];
  if (videoIds.length > 0) {
    const { data: rows } = (await supabase
      .from('community_videos')
      .select('id, cf_video_id, title, category')
      .in('id', videoIds)
      .eq('status', 'ready')
      .eq('visibility', 'public')
      // worker keeps prior renders as history with is_primary=false.
      // Only the current primary per (community, intent_bucket) should surface
      // in the grid — otherwise buyers see the same POI archetype twice.
      .eq('is_primary', true)) as { data: VideoRow[] | null };
    videos = rows ?? [];
  }

  // The community's film — the same pick the app makes (phase313). Uncached,
  // so a re-cut reaches this page (see `fetchVerticalVideos`).
  const films = await getFilms();
  const filmUid = films.byCommunity.get(community.id);
  const filmUrl = filmUid
    ? streamManifestUrl(filmUid)
    : ((await fetchAiTourVideoByCommunity()).get(community.id) ?? null);
  const film = filmUrl
    ? {
        url: filmUrl,
        poster: filmUid ? streamPosterUrl(filmUid) : null,
        credits: await fetchFilmPhotoCredits(community.id, filmUid),
      }
    : null;

  // Active listings inside this community — reuse the browse-card builder
  // so cards match the global feed shape exactly (BrowseCard type). None
  // while listings are off on the web (phase311).
  const listings = LISTINGS_ON_WEB ? await fetchBrowseCardsByCommunitySlug(community.slug) : [];

  // resolve `nearby` — each entry carries a `slug` from Nextdoor
  // (i.e. nextdoor_slug), plus name/city/state/lat/lng. We look up which of
  // those neighborhoods we've actually seeded (status=active) so we can render
  // real /c/[slug] links; unresolved names still show as static labels.
  type NearbyRaw = { name: string; slug?: string; city?: string; state?: string };
  const rawNearby = Array.isArray(community.nearby)
    ? (community.nearby as NearbyRaw[]).slice(0, 6)
    : [];
  const nearbyNdSlugs = rawNearby.map((n) => n.slug).filter((s): s is string => !!s);
  let nearbyLookup = new Map<
    string,
    { slug: string; name: string; city: string | null; state: string }
  >();
  if (nearbyNdSlugs.length > 0) {
    const { data: nrows } = (await supabase
      .from('communities')
      .select('slug, name, city, state, nextdoor_slug')
      .in('nextdoor_slug', nearbyNdSlugs)
      .eq('status', 'active')) as {
      data: Array<{
        slug: string;
        name: string;
        city: string | null;
        state: string;
        nextdoor_slug: string;
      }> | null;
    };
    nearbyLookup = new Map((nrows ?? []).map((r) => [r.nextdoor_slug, r]));
  }
  const nearbyCards = rawNearby.map((n) => {
    const hit = n.slug ? nearbyLookup.get(n.slug) : undefined;
    return {
      name: hit?.name ?? n.name,
      city: hit?.city ?? n.city ?? null,
      state: hit?.state ?? n.state ?? community.state,
      href: hit ? `/c/${hit.slug}` : null,
    };
  });

  // Hero cover.
  const firstReadyVideo = videos[0] ?? null;
  const coverVideoCfId = community.cover_video_id
    ? (videos.find((v) => v.id === community.cover_video_id)?.cf_video_id ?? null)
    : null;
  const heroCover = resolveCommunityCoverWithCfIds({
    cover_video_id: community.cover_video_id,
    cover_video_cf_id: coverVideoCfId,
    cover_storage_path: community.cover_storage_path,
    fallback_video_cf_id: firstReadyVideo?.cf_video_id ?? null,
    name: community.name,
    boundary:
      (community.boundary as import('@/lib/communities/logo-cover').BoundaryGeoJSON | null) ?? null,
  });

  const heroCoverUrl = heroCover ? heroCover.url : null;

  // The community's city, when it has a page (phase335): a buyer who arrives
  // on a shared link goes on from here to the city and its other communities.
  let cityHref: string | null = null;
  if (community.city) {
    const { data: city } = await supabase
      .from('cities')
      .select('slug')
      .ilike('name', community.city.trim())
      .eq('state', community.state)
      .eq('status', 'active')
      .not('profile', 'is', null)
      .limit(1)
      .maybeSingle();
    cityHref = city ? `/city/${city.slug}` : null;
  }

  return (
    <CommunityBody
      community={{
        id: community.id,
        name: community.name,
        slug: community.slug,
        city: community.city,
        state: community.state,
        description: community.description,
        residents_count: community.residents_count ?? null,
        avg_income: community.avg_income ?? null,
        avg_age: community.avg_age ?? null,
        homeowners_pct: community.homeowners_pct ?? null,
        attributes: community.attributes ?? null,
        interests: community.interests ?? null,
      }}
      heroCoverUrl={heroCoverUrl}
      boundary={
        (community.boundary as import('@/lib/geo/point-in-polygon').GeoJsonPolygonLike | null) ??
        null
      }
      nearby={nearbyCards}
      videos={videos}
      listings={listings}
      film={film}
      cityHref={cityHref}
    />
  );
}
