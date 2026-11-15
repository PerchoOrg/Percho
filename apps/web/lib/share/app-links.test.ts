import { describe, expect, it } from 'vitest';
import { APP_STORE_ID, appleAppSiteAssociation, sharedPageMetadata } from './app-links';

describe('appleAppSiteAssociation', () => {
  it('hands communities and cities to the app, and nothing else', () => {
    const [detail] = appleAppSiteAssociation().applinks.details;
    expect(detail?.appIDs).toEqual(['5C84L6M8HT.co.percho.app']);
    expect(detail?.components.map((c) => c['/'])).toEqual(['/c/*', '/city/*']);
  });
});

describe('sharedPageMetadata', () => {
  const page = {
    title: 'Suwanee, GA',
    description: 'A railroad village that grew 8× in thirty years.',
    path: '/city/suwanee-ga',
    image: 'https://videodelivery.net/abc/thumbnails/thumbnail.jpg?time=1s',
    origin: 'https://www.percho.co',
  };

  it('gives chat apps a title, a line and the film frame', () => {
    const m = sharedPageMetadata(page);
    expect(m.openGraph?.title).toBe('Suwanee, GA');
    expect(m.openGraph?.images).toEqual([{ url: page.image }]);
    expect(m.twitter).toMatchObject({ card: 'summary_large_image' });
  });

  it("points Safari's app banner at the same page", () => {
    expect(sharedPageMetadata(page).other?.['apple-itunes-app']).toBe(
      `app-id=${APP_STORE_ID}, app-argument=https://www.percho.co/city/suwanee-ga`,
    );
  });

  it('falls back to a small card without an image', () => {
    const m = sharedPageMetadata({ ...page, image: null });
    expect(m.openGraph?.images).toBeUndefined();
    expect(m.twitter).toMatchObject({ card: 'summary' });
  });
});
