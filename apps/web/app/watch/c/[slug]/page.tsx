/**
 * /watch/c/[slug] — a shared community: its film, then the app (phase336; see
 * `WatchFilm`). The full page stays at `/c/<slug>` for the website.
 *
 * The film is the one `/c/<slug>` and the app play: the assembled tour, else
 * the AI tour (`fetchVerticalVideos`, uncached so a re-cut shows — phase312).
 */
import { fetchFilmPhotoCredits } from '@/lib/communities/film-credits';
import { fetchAiTourVideoByCommunity } from '@/lib/feed/ai-tour-videos';
import {
  fetchVerticalVideos,
  streamManifestUrl,
  streamPosterUrl,
} from '@/lib/feed/vertical-videos';
import { APP_STORE_URL, sharedPageMetadata, siteOrigin } from '@/lib/share/app-links';
import { createClient, createUncachedServiceClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { WatchFilm } from '../../_components/WatchFilm';

type PageParams = { slug: string };

/** The community and its film's stream uid — read once for metadata and page. */
const getCommunity = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data: community } = await supabase
    .from('communities')
    .select('id, name, slug, city, state, description, status')
    .eq('slug', slug)
    .maybeSingle();
  if (!community || community.status !== 'active') return null;
  const films = await fetchVerticalVideos(createUncachedServiceClient());
  return { community, filmUid: films.byCommunity.get(community.id) };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const hit = await getCommunity(slug);
  if (!hit) return { title: 'Community not found' };
  const { community, filmUid } = hit;
  const where = community.city ? `${community.city}, ${community.state}` : community.state;
  return sharedPageMetadata({
    title: `${community.name} · ${where}`,
    description:
      community.description?.trim() || `Watch ${community.name}'s neighborhood film on Percho.`,
    path: `/watch/c/${community.slug}`,
    image: filmUid ? streamPosterUrl(filmUid) : null,
    origin: siteOrigin(),
  });
}

export default async function WatchCommunityPage({ params }: { params: Promise<PageParams> }) {
  const { slug } = await params;
  const hit = await getCommunity(slug);
  if (!hit) notFound();
  const { community, filmUid } = hit;

  const url = filmUid
    ? streamManifestUrl(filmUid)
    : ((await fetchAiTourVideoByCommunity()).get(community.id) ?? null);
  const credits = url ? await fetchFilmPhotoCredits(community.id, filmUid) : [];
  const where = community.city ? `${community.city}, ${community.state}` : community.state;

  return (
    <WatchFilm
      eyebrow={`Community · ${where}`}
      name={community.name}
      line={null}
      film={url ? { url, poster: filmUid ? streamPosterUrl(filmUid) : null } : null}
      credits={credits}
      appStoreUrl={APP_STORE_URL}
    />
  );
}
