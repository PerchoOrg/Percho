/**
 * /watch/city/[slug] — a shared city: its film, then the app (phase336; see
 * `WatchFilm`). The full page stays at `/city/<slug>` for the website.
 */
import { fetchCityDetail } from '@/lib/cities/detail';
import { APP_STORE_URL, sharedPageMetadata, siteOrigin } from '@/lib/share/app-links';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { WatchFilm } from '../../_components/WatchFilm';

type PageParams = { slug: string };

const getCity = cache(fetchCityDetail);

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const city = await getCity(slug);
  if (!city) return { title: 'City not found' };
  return sharedPageMetadata({
    title: `${city.name}, ${city.state}`,
    description: city.tagline,
    path: `/watch/city/${city.slug}`,
    image: city.posterUrl ?? null,
    origin: siteOrigin(),
  });
}

export default async function WatchCityPage({ params }: { params: Promise<PageParams> }) {
  const { slug } = await params;
  const city = await getCity(slug);
  if (!city) notFound();

  const where = [city.county ? `${city.county} County` : null, city.state]
    .filter(Boolean)
    .join(', ');
  return (
    <WatchFilm
      eyebrow={`City · ${where}`}
      name={city.name}
      line={city.tagline}
      film={city.videoUrl ? { url: city.videoUrl, poster: city.posterUrl ?? null } : null}
      // Google contributors by name; Commons authors too — a CC BY file asks
      // for the author wherever it is shown. Their licences and links are on
      // the city's full page.
      credits={[...city.credits.google, ...city.credits.commons.map((c) => c.author)]}
      appStoreUrl={APP_STORE_URL}
    />
  );
}
