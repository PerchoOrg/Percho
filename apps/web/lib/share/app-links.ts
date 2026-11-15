/**
 * Shared community and city links (phase335): what iOS needs to open them in
 * the app, and what a chat app needs to draw them as a card.
 *
 * The iOS app shares `www.percho.co/watch/c/<slug>` and `/watch/city/<slug>`.
 * A buyer with the app lands in it — iOS reads `appleAppSiteAssociation()`
 * from `/.well-known/apple-app-site-association` and the app claims
 * `www.percho.co` in its `associatedDomains`. A buyer without it gets the film
 * alone and a button to the app (`app/watch/`, phase336; the owner did not
 * want a shared link to open the full web page).
 */
import type { Metadata } from 'next';

/** Apple Developer team (`docs/ios-release.md`) and the app's bundle id (`app.json`). */
const APP_ID = '5C84L6M8HT.co.percho.app';

/** The App Store id `eas submit` uses (`apps/mobile/eas.json`). */
export const APP_STORE_ID = '6806748456';
export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;

/**
 * The association file. Only the pages the app has a screen for go to it:
 * a shared film (`/watch/…`), a community (`/c/<slug>`, and its video feed,
 * which the app shows as the community page) and a city. Everything else
 * stays on the web.
 */
export function appleAppSiteAssociation() {
  return {
    applinks: {
      details: [
        {
          appIDs: [APP_ID],
          components: [
            { '/': '/watch/*', comment: 'A shared community or city film' },
            { '/': '/c/*', comment: 'A community' },
            { '/': '/city/*', comment: 'A city' },
          ],
        },
      ],
    },
  };
}

/**
 * A shared page's metadata: the link card iMessage and WhatsApp draw (title,
 * one line, the film's first frame), and Safari's Smart App Banner, whose
 * `app-argument` is the page itself so the app — if the banner opens it —
 * lands on the same place.
 */
export function sharedPageMetadata(page: {
  title: string;
  description: string;
  /** Site-relative, e.g. `/c/northbrooke`; resolved against `metadataBase`. */
  path: string;
  image: string | null;
  /** Absolute origin for the banner's argument, which is not resolved. */
  origin: string;
}): Metadata {
  const images = page.image ? [{ url: page.image }] : undefined;
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: page.path },
    openGraph: {
      type: 'website',
      siteName: 'Percho',
      title: page.title,
      description: page.description,
      url: page.path,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title: page.title,
      description: page.description,
      ...(images ? { images: images.map((i) => i.url) } : {}),
    },
    other: {
      'apple-itunes-app': `app-id=${APP_STORE_ID}, app-argument=${page.origin}${page.path}`,
    },
  };
}

/** Where shared links point. Production is `www` (the apex 308s to it). */
export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.percho.co').replace(/\/$/, '');
}
