/**
 * The crawl rules, written against the page list Bellmoore Park actually
 * produced (2026-08-23).
 *
 * Its "community site" is one page on The Providence Group's CORPORATE site,
 * so following every same-origin link fetched 92 interior photos of two houses
 * for sale, 53 photos of award trophies and mortgage diagrams, and reached two
 * entirely different subdivisions.
 */

import { describe, expect, it } from 'vitest';
import { classifyPageLink, communityPageAncestor, sameOriginPageLinks } from './site-map';

const BUILDER = '/bellmoore-park';
const OWN_SITE = '/';
const u = (path: string) => `https://theprovidencegroup.com${path}`;

describe('classifyPageLink on a builder site', () => {
  it('follows the community’s own corner of the site', () => {
    expect(classifyPageLink(u('/bellmoore-park'), BUILDER)).toBe('follow');
    expect(classifyPageLink(u('/bellmoore-park/amenities'), BUILDER)).toBe('follow');
  });

  it('follows the community’s page inside the builder’s sales tree', () => {
    // THE page the owner asked for by name:
    // ".../new-homes/ga/johns-creek/bellmoore-park/6807/#photogallery - this is
    // gallery i am talking about". It is not under `/bellmoore-park` at all,
    // so only the slug rule reaches it.
    expect(classifyPageLink(u('/new-homes/ga/johns-creek/bellmoore-park/6807'), BUILDER)).toBe(
      'follow',
    );
  });

  it('does NOT follow the builder’s own portfolio gallery', () => {
    // A first pass auto-followed any path segment called `gallery`. On a
    // builder's site that is its work across every subdivision, not this one.
    expect(classifyPageLink(u('/gallery'), BUILDER)).toBe('offer');
    expect(classifyPageLink(u('/video-gallery'), BUILDER)).toBe('offer');
  });

  it('skips the builder’s corporate boilerplate outright', () => {
    for (const path of [
      '/awards',
      '/careers',
      '/contact',
      '/privacy',
      '/testimonials',
      '/warranty',
      '/lenders',
      '/promotions',
      '/incentives',
      '/design-studio',
      '/building-process',
      '/home-buying-tools',
      '/agency-policy',
      '/mortgage-timeline',
      '/about',
      '/about-green-brick-partners',
    ]) {
      expect(classifyPageLink(u(path), BUILDER), path).toBe('skip');
    }
  });

  it('skips every post under a boilerplate section, not just its index', () => {
    expect(classifyPageLink(u('/blog'), BUILDER)).toBe('skip');
    expect(classifyPageLink(u('/blog/category/johns-creek'), BUILDER)).toBe('skip');
    expect(classifyPageLink(u('/blog/north-atlantas-hidden-gems-neighborhoods'), BUILDER)).toBe(
      'skip',
    );
  });

  it('boilerplate beats the gallery allowlist', () => {
    expect(classifyPageLink(u('/blog/gallery'), BUILDER)).toBe('skip');
  });

  it('OFFERS one address, one floor plan — a segment deeper than the community', () => {
    // 92 of the 221 photos came from two of these. Unticked they cost nothing;
    // recorded, they are one click away if a page turns out to be worth it.
    for (const path of [
      '/new-homes/ga/johns-creek/bellmoore-park/6807/3060-labrouste-cove/1763081',
      '/new-homes/ga/johns-creek/bellmoore-park/6807/3070-labrouste-cove/1763082',
      '/new-homes/ga/johns-creek/bellmoore-park/6807/10005-grandview-square/1763083',
      '/new-homes/ga/johns-creek/bellmoore-park/the-calhoun/258677',
      '/new-homes/ga/johns-creek/bellmoore-park/the-mathews/258676',
    ]) {
      expect(classifyPageLink(u(path), BUILDER), path).toBe('offer');
    }
  });

  it('offers the builder’s generic sales pages', () => {
    for (const path of [
      '/new-homes',
      '/new-homes/available',
      '/new-homes/fulton-county',
      '/new-homes/home-designs',
      '/3d-tours',
      '/interactive-home-designs',
      '/st-jude-dream-home',
    ]) {
      expect(classifyPageLink(u(path), BUILDER), path).toBe('offer');
    }
  });

  it('follows the PDF page for the community itself — same shape, +1', () => {
    // Not a page of photographs, but the rule cannot tell and should not
    // pretend to; ingesting it simply finds no images.
    expect(classifyPageLink(u('/pdf/ga/johns-creek/bellmoore-park/6807'), BUILDER)).toBe('follow');
  });

  it('offers OTHER communities on the same builder site', () => {
    expect(classifyPageLink(u('/new-homes/ga/alpharetta/brookside-reserve/18010'), BUILDER)).toBe(
      'offer',
    );
    expect(classifyPageLink(u('/new-homes/ga/johns-creek/bellwyn/18782'), BUILDER)).toBe('offer');
  });

  it('offers the builder’s own home page', () => {
    expect(classifyPageLink(u('/'), BUILDER)).toBe('offer');
  });
});

describe('classifyPageLink when the site IS the community', () => {
  it('follows everything that is not boilerplate — unchanged behaviour', () => {
    const a = (p: string) => `https://aberdeencommunity.org${p}`;
    expect(classifyPageLink(a('/'), OWN_SITE)).toBe('follow');
    expect(classifyPageLink(a('/amenities'), OWN_SITE)).toBe('follow');
    expect(classifyPageLink(a('/pool'), OWN_SITE)).toBe('follow');
    expect(classifyPageLink(a('/swim-tennis'), OWN_SITE)).toBe('follow');
  });

  it('still drops the boilerplate every site has', () => {
    expect(classifyPageLink('https://aberdeencommunity.org/contact', OWN_SITE)).toBe('skip');
    expect(classifyPageLink('https://aberdeencommunity.org/privacy', OWN_SITE)).toBe('skip');
  });
});

describe('sameOriginPageLinks with a prefix', () => {
  const html = `
    <a href="/bellmoore-park/amenities">Amenities</a>
    <a href="/gallery">Gallery</a>
    <a href="/careers">Careers</a>
    <a href="/new-homes/ga/johns-creek/bellmoore-park/6807/3060-labrouste-cove/1763081">A home</a>
  `;

  it('drops skips, and marks the rest follow or offer', () => {
    const links = sameOriginPageLinks(html, u('/bellmoore-park'), 40, BUILDER);
    expect(
      links.map((l) => [l.url.replace('https://theprovidencegroup.com', ''), l.verdict]),
    ).toEqual([
      ['/bellmoore-park/amenities', 'follow'],
      ['/gallery', 'offer'],
      ['/new-homes/ga/johns-creek/bellmoore-park/6807/3060-labrouste-cove/1763081', 'offer'],
    ]);
  });

  it('is unjudged when no prefix is given', () => {
    const links = sameOriginPageLinks(html, u('/bellmoore-park'));
    expect(links).toHaveLength(4);
    expect(links.every((l) => l.verdict === undefined)).toBe(true);
  });
});

describe('communityPageAncestor', () => {
  it('derives the gallery page from a house that hangs off it', () => {
    // This is the whole point: `/bellmoore-park` links straight to individual
    // homes, so the page the owner asked for by name was never discovered at
    // all. It is reached by walking back up from its children.
    expect(
      communityPageAncestor(
        u('/new-homes/ga/johns-creek/bellmoore-park/6807/3060-labrouste-cove/1763081'),
        BUILDER,
      ),
    ).toBe(u('/new-homes/ga/johns-creek/bellmoore-park/6807'));
  });

  it('derives it from a floor plan too', () => {
    expect(
      communityPageAncestor(
        u('/new-homes/ga/johns-creek/bellmoore-park/the-calhoun/258677'),
        BUILDER,
      ),
    ).toBe(u('/new-homes/ga/johns-creek/bellmoore-park/the-calhoun'));
  });

  it('returns null when there is nothing to walk back to', () => {
    // Already the community page.
    expect(
      communityPageAncestor(u('/new-homes/ga/johns-creek/bellmoore-park/6807'), BUILDER),
    ).toBeNull();
    expect(communityPageAncestor(u('/bellmoore-park'), BUILDER)).toBeNull();
    // Another subdivision — its slug is not ours.
    expect(
      communityPageAncestor(u('/new-homes/ga/alpharetta/brookside-reserve/18010'), BUILDER),
    ).toBeNull();
    // No slug to key on when the site IS the community.
    expect(communityPageAncestor(u('/gallery'), OWN_SITE)).toBeNull();
  });
});
