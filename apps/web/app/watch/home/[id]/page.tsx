/**
 * /watch/home/[id] — a shared home: its film, then the app (phase404.12). The
 * same page a shared neighbourhood or city opens (`WatchFilm`, phase336), for
 * the home card's share button.
 *
 * Owner, 2026-11-27: 「加房子分享」. The only homes there are to share are the
 * FMLS test listings a development build of the app shows, so this page is
 * reachable by its link alone: it is not indexed, nothing on the site links
 * to it, and the site's own listing pages stay switched off
 * (`lib/listings/listings-on-web.ts`).
 *
 * It is a listing detail view all the same, so it carries what FMLS requires
 * of one (`@percho/shared/fmls`): the FMLS number, the listing brokerage, and
 * the detail disclosure. A test listing that is not for sale says so, in the
 * words its import wrote (`scripts/admin/import-bridge-listings.ts`).
 */
import { FmlsDisclosure } from '@/app/_components/FmlsDisclosure';
import { fetchListingDetail } from '@/lib/listings/detail';
import { APP_STORE_URL, sharedPageMetadata, siteOrigin } from '@/lib/share/app-links';
import { fmlsNumberLabel } from '@percho/shared/fmls';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { WatchFilm } from '../../_components/WatchFilm';

type PageParams = { id: string };

const getHome = cache(fetchListingDetail);

const usd = (price: number | undefined) =>
  price === undefined ? null : `$${price.toLocaleString('en-US')}`;

function specs(home: { beds?: number; baths?: number; sqft?: number }): string {
  return [
    home.beds !== undefined ? `${home.beds} bd` : null,
    home.baths !== undefined ? `${home.baths} ba` : null,
    home.sqft !== undefined ? `${home.sqft.toLocaleString('en-US')} sqft` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { id } = await params;
  const home = await getHome(id);
  if (!home) return { title: 'Home not found' };
  return {
    ...sharedPageMetadata({
      title: [usd(home.price), `${home.city}, ${home.state}`].filter(Boolean).join(' · '),
      description: specs(home) || home.address,
      path: `/watch/home/${home.id}`,
      image: home.video?.posterUrl ?? null,
      origin: siteOrigin(),
    }),
    robots: { index: false, follow: false },
  };
}

export default async function WatchHomePage({ params }: { params: Promise<PageParams> }) {
  const { id } = await params;
  const home = await getHome(id);
  if (!home) notFound();

  // "FMLS test listing — status Expired, not for sale." — said where it applies.
  const notice = home.description?.find((p) => p.startsWith('FMLS test listing'));
  const courtesy = [home.listOfficeName, home.listAgentName].filter(Boolean).join(' · ');
  return (
    <WatchFilm
      eyebrow={`Home · ${home.city}, ${home.state}`}
      name={usd(home.price) ?? home.address}
      line={[specs(home), home.price !== undefined ? home.address : null]
        .filter(Boolean)
        .join(' · ')}
      film={home.video ? { url: home.video.url, poster: home.video.posterUrl } : null}
      appStoreUrl={APP_STORE_URL}
      footnote={
        <div className="space-y-1.5 text-[11px] text-white/70 leading-[1.5]">
          {notice ? <p className="font-medium text-white/90">{notice}</p> : null}
          <p>
            {[fmlsNumberLabel(home.mlsNumber), courtesy ? `Listing courtesy of ${courtesy}` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {home.mlsNumber ? (
            <FmlsDisclosure variant="detail" className="!text-white/60 !leading-[1.45]" />
          ) : null}
        </div>
      }
    />
  );
}
