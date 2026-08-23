import { describe, expect, it } from 'vitest';
import { labelForPath, sameOriginPageLinks } from './site-map';

const PAGE = 'https://www.bellmoorepark.com/amenities/';

describe('sameOriginPageLinks', () => {
  it('takes the nav bar (siblings) and in-page links (children)', () => {
    const html = `
      <nav>
        <a href="/">Home</a>
        <a href="/amenities/">Amenities</a>
        <a href="/floor-plans/">Floor Plans</a>
        <a href="/contact-us">Contact</a>
      </nav>
      <a href="swim-tennis/">Swim &amp; Tennis</a>
    `;
    expect(sameOriginPageLinks(html, PAGE)).toEqual([
      { url: 'https://www.bellmoorepark.com/', label: 'Home' },
      { url: 'https://www.bellmoorepark.com/floor-plans', label: 'Floor Plans' },
      { url: 'https://www.bellmoorepark.com/contact-us', label: 'Contact Us' },
      { url: 'https://www.bellmoorepark.com/amenities/swim-tennis', label: 'Swim Tennis' },
    ]);
  });

  it('never returns the page it was given', () => {
    // Three spellings of the same page: with and without the trailing slash,
    // and with a tracking query. A site links to itself constantly.
    const html = `
      <a href="/amenities/">this page</a>
      <a href="/amenities">same page</a>
      <a href="https://www.bellmoorepark.com/amenities/?utm_source=nav">same again</a>
    `;
    expect(sameOriginPageLinks(html, PAGE)).toEqual([]);
  });

  it('drops off-site links', () => {
    const html = `
      <a href="https://facebook.com/bellmoore">Facebook</a>
      <a href="https://forsyth.k12.ga.us/">The school</a>
      <a href="/gallery/">Gallery</a>
    `;
    expect(sameOriginPageLinks(html, PAGE)).toEqual([
      { url: 'https://www.bellmoorepark.com/gallery', label: 'Gallery' },
    ]);
  });

  it('treats www and the bare host as one site', () => {
    const html = '<a href="https://bellmoorepark.com/gallery/">Gallery</a>';
    expect(sameOriginPageLinks(html, PAGE)).toEqual([
      { url: 'https://bellmoorepark.com/gallery', label: 'Gallery' },
    ]);
  });

  it('drops files, mail and script hrefs', () => {
    const html = `
      <a href="/plans/lot-42.pdf">Plot plan</a>
      <a href="/photos/pool.jpg">Pool</a>
      <a href="mailto:hoa@bellmoorepark.com">Email us</a>
      <a href="tel:+17705551212">Call</a>
      <a href="javascript:void(0)">Menu</a>
      <a href="#top">Back to top</a>
      <a href="/gallery/">Gallery</a>
    `;
    expect(sameOriginPageLinks(html, PAGE)).toEqual([
      { url: 'https://www.bellmoorepark.com/gallery', label: 'Gallery' },
    ]);
  });

  it('collapses query-string and fragment variants of one page', () => {
    const html = `
      <a href="/gallery/?page=1">1</a>
      <a href="/gallery/?page=2">2</a>
      <a href="/gallery/#pool">Pool</a>
    `;
    expect(sameOriginPageLinks(html, PAGE)).toHaveLength(1);
  });

  it('stops at the cap rather than enqueueing a directory', () => {
    const html = Array.from({ length: 90 }, (_, i) => `<a href="/p${i}/">p${i}</a>`).join('');
    expect(sameOriginPageLinks(html, PAGE)).toHaveLength(40);
    expect(sameOriginPageLinks(html, PAGE, 5)).toHaveLength(5);
  });

  it('survives a malformed page URL and a malformed href', () => {
    expect(sameOriginPageLinks('<a href="/x/">x</a>', 'not a url')).toEqual([]);
    expect(sameOriginPageLinks('<a href="http://">broken</a><a href="/x/">x</a>', PAGE)).toEqual([
      { url: 'https://www.bellmoorepark.com/x', label: 'X' },
    ]);
  });
});

describe('labelForPath', () => {
  it('names a page after its last path segment', () => {
    expect(labelForPath('https://x.org/amenities/swim-tennis/')).toBe('Swim Tennis');
    expect(labelForPath('https://x.org/about_us')).toBe('About Us');
    expect(labelForPath('https://x.org/gallery.html')).toBe('Gallery');
  });

  it('calls the root Home', () => {
    expect(labelForPath('https://x.org/')).toBe('Home');
    expect(labelForPath('https://x.org')).toBe('Home');
    expect(labelForPath('nonsense')).toBe('Home');
  });
});
