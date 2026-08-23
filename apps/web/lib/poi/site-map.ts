/**
 * The pages one click from a page, on the same site.
 *
 * The ingest step is told one URL — the community's own website — and the
 * owner's rule for it is "the default main website for the community if it
 * exists, should always be selected as default, and its sibling and child
 * subpages" (2026-08-23). A site's nav bar IS its sibling list and its
 * in-page links are its children, so both fall out of reading the anchors on
 * that one page. No sitemap.xml, no crawler, no per-site code.
 *
 * DEPTH ONE, deliberately. The pages found here are never themselves expanded
 * (see `expanded_at` in the community_photo_sources migration): a mid-sized
 * builder site is ~30 pages at depth 1 and a few hundred at depth 2, most of
 * them floor-plan PDFs and press releases, and every one of them costs a page
 * fetch plus up to 80 image downloads against a 300s function.
 */

/** Extensions that are a file to download, not a page to read. */
const NOT_A_PAGE =
  /\.(jpe?g|png|webp|avif|gif|svg|ico|pdf|docx?|xlsx?|pptx?|zip|rar|mp[34]|mov|avi|css|js|json|xml|rss)$/i;

/**
 * Hosts match on their registrable-ish form: `www.` is stripped before
 * comparing. Sites link between the two spellings constantly, and treating
 * `www.example.org` and `example.org` as different origins drops half a nav
 * bar for no reason a human would recognise.
 */
function hostKey(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

/**
 * A page's path, canonical: no hash, no query, one trailing slash policy.
 *
 * Query strings are dropped because on a real site they are almost always a
 * view of a page already in the list — `?sort=price`, `?page=2`,
 * `?utm_source=…` — and each variant would be fetched, parsed and charged for
 * separately. A site that puts genuinely distinct content behind a query
 * parameter loses those pages here; the manual box in the panel is the answer
 * for that, and it has never come up.
 */
function canonicalise(u: URL): string {
  const path = u.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
  return `${u.protocol}//${u.host}${path}`;
}

/** "/amenities/swim-tennis/" → "Swim Tennis". "/" → "Home". */
export function labelForPath(pageUrl: string): string {
  let path: string;
  try {
    path = new URL(pageUrl).pathname;
  } catch {
    return 'Home';
  }
  const last = path.split('/').filter(Boolean).pop();
  if (!last) return 'Home';
  const words = last
    .replace(/\.[a-z0-9]+$/i, '')
    .split(/[-_+%\s]+/)
    // Kept to the character set `CommunityPhotoIngest.label` allows. A label
    // becomes part of a synthetic POI's name AND of its `google_place_id`
    // (`percho:community:<id>:<label>`), so the two paths into
    // `ingestPagePhotos` — this one and the panel's box — must agree on what a
    // label may contain, or the same page ingested both ways creates two POIs.
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase());
  return words.join(' ').slice(0, 40).trim() || 'Home';
}

/**
 * Segments that are a company talking about itself, never a place.
 *
 * Matched against ANY path segment, so `/blog/category/johns-creek` and every
 * post under it go with `/blog`. These are builder-site boilerplate: the crawl
 * that pulled 53 photos of award trophies, a careers stock photo and a
 * mortgage-timeline diagram into Bellmoore Park hit all of them (2026-08-23).
 */
const BOILERPLATE_SEGMENTS = new Set([
  'about',
  'about-us',
  'accessibility',
  'account',
  'agency-policy',
  'awards',
  'blog',
  'building-process',
  'careers',
  'cart',
  'contact',
  'contact-us',
  'design-studio',
  'disclaimer',
  'faq',
  'financing',
  'home-buying-tools',
  'incentives',
  'jobs',
  'legal',
  'lenders',
  'login',
  'news',
  'our-story',
  'press',
  'privacy',
  'promotions',
  'resources',
  'reviews',
  'search',
  'sitemap',
  'specials',
  'team',
  'terms',
  'testimonials',
  'unsubscribe',
  'warranty',
]);

/** …and the prefixes, for the ones that come with a suffix. */
const BOILERPLATE_PREFIXES = ['about-', 'mortgage', 'buying-', 'home-buying'];

/**
 * What the ingest step should do with a discovered page.
 *
 *   follow  fetch it without being asked — it is the community, or its gallery
 *   offer   record it UNTICKED, so it is one click away in the panel
 *   skip    never record it
 *
 * The middle one is the point. A community's site and a builder's site are the
 * same shape to a crawler and completely different to a buyer: Bellmoore
 * Park's "community site" is one page on The Providence Group's corporate
 * site, so following every same-origin link fetched two houses' interior photo
 * sets, someone else's subdivision, and the mortgage timeline. Refusing to
 * record those would have been the opposite mistake — the owner still wants to
 * be able to reach a page we guessed wrong about.
 */
export type LinkVerdict = 'follow' | 'offer' | 'skip';

/** The community's own slug — the last segment of its site path. */
export function communitySlugOf(sitePrefix: string): string | null {
  const segs = sitePrefix.split('/').filter(Boolean);
  return segs.length > 0 ? segs[segs.length - 1]!.toLowerCase() : null;
}

/**
 * How far past the community's slug a path goes, or null if the slug is absent.
 *
 * A builder files a community twice: once as marketing (`/bellmoore-park`) and
 * once inside its sales tree
 * (`/new-homes/ga/johns-creek/bellmoore-park/6807`). The second is where the
 * photo gallery lives — owner 2026-08-23, correcting an earlier guess of mine:
 * "https://theprovidencegroup.com/new-homes/ga/johns-creek/bellmoore-park/6807/#photogallery
 * - this is gallery i am talking about". A plain prefix rule cannot see it,
 * because it is not under `/bellmoore-park` at all.
 */
export function depthPastSlug(path: string, slug: string): number | null {
  const segs = path
    .split('/')
    .filter(Boolean)
    .map((x) => x.toLowerCase());
  const i = segs.indexOf(slug);
  return i === -1 ? null : segs.length - 1 - i;
}

/**
 * One segment past the slug is the community. Two or more is one address.
 *
 * The tree, from the real site:
 *   …/bellmoore-park/6807                        the community    +1  follow
 *   …/bellmoore-park/6807/3060-labrouste-cove/1763081   one house +3  offer
 *   …/bellmoore-park/the-calhoun/258676          one floor plan   +2  offer
 *
 * This is a heuristic about how builders lay out URLs, not a law, and it is
 * the reason "deeper" is `offer` rather than `skip`: a page it gets wrong is
 * still one tick away in the panel.
 */
const MAX_DEPTH_PAST_SLUG = 1;

/**
 * PURE. `sitePrefix` is the community page's own path — `/bellmoore-park` on a
 * builder's site, `/` when the site IS the community, in which case everything
 * that is not boilerplate follows and this changes nothing.
 */
export function classifyPageLink(pageUrl: string, sitePrefix: string): LinkVerdict {
  let path: string;
  try {
    path = new URL(pageUrl).pathname;
  } catch {
    return 'skip';
  }
  const segments = path
    .split('/')
    .filter(Boolean)
    .map((s) => s.toLowerCase());

  // Boilerplate wins over everything, so `/blog/gallery` stays out.
  for (const seg of segments) {
    if (BOILERPLATE_SEGMENTS.has(seg)) return 'skip';
    if (BOILERPLATE_PREFIXES.some((pre) => seg.startsWith(pre))) return 'skip';
  }

  const prefix = sitePrefix.replace(/\/$/, '');
  // The site IS the community. Everything that is not boilerplate is fair game.
  if (!prefix || prefix === '/') return 'follow';

  if (path === prefix || path.startsWith(`${prefix}/`)) return 'follow';

  const slug = communitySlugOf(prefix);
  const depth = slug ? depthPastSlug(path, slug) : null;
  if (depth !== null && depth <= MAX_DEPTH_PAST_SLUG) return 'follow';

  // Same host, not this community's corner of it: the builder's home page, its
  // portfolio gallery, somebody else's subdivision, one house for sale.
  return 'offer';
}

/**
 * The community page a too-deep URL hangs off — `null` if there isn't one.
 *
 * Bellmoore Park's gallery page was never DISCOVERED: `/bellmoore-park` links
 * straight to the individual homes, so the crawl saw
 * `…/bellmoore-park/6807/3060-labrouste-cove/1763081` and never the `…/6807`
 * that holds the community's own photographs. Deriving the ancestor is how the
 * page the owner actually asked for gets fetched without him pasting it.
 */
export function communityPageAncestor(pageUrl: string, sitePrefix: string): string | null {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  const slug = communitySlugOf(sitePrefix.replace(/\/$/, ''));
  if (!slug) return null;
  const segs = url.pathname.split('/').filter(Boolean);
  const i = segs.findIndex((x) => x.toLowerCase() === slug);
  // Needs to be genuinely deeper, and the slug must not be the last segment.
  if (i === -1 || segs.length - 1 - i <= MAX_DEPTH_PAST_SLUG) return null;
  return `${url.protocol}//${url.host}/${segs.slice(0, i + 1 + MAX_DEPTH_PAST_SLUG).join('/')}`;
}

export interface PageLink {
  url: string;
  label: string;
  /** Only set when `sameOriginPageLinks` was given a prefix to judge against. */
  verdict?: LinkVerdict;
}

/**
 * Every same-site page `html` links to, canonical and de-duplicated.
 *
 * The page itself is NOT in the result — its caller already has it as a source
 * row and would otherwise ingest it twice.
 *
 * @param max a hard ceiling on how much one page may enqueue. 40 covers every
 *   community site seen so far; a nav bar past that is a directory, and a
 *   directory is not what this is for.
 */
export function sameOriginPageLinks(
  html: string,
  pageUrl: string,
  max = 40,
  /**
   * The community page's own path. Given one, every link comes back with a
   * `verdict` and `skip`ped links are dropped; omitted, the behaviour is what
   * it was — every same-origin page, unjudged.
   */
  sitePrefix?: string,
): PageLink[] {
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return [];
  }
  const baseHost = hostKey(base.host);
  const self = canonicalise(base);

  const found = new Map<string, PageLink>();
  for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["']/gi)) {
    const raw = (m[1] ?? '').trim();
    // `mailto:`, `tel:`, `javascript:` and bare fragments never resolve to a
    // page worth fetching, and `new URL` would happily accept the first three.
    if (!raw || raw.startsWith('#')) continue;
    let target: URL;
    try {
      target = new URL(raw, pageUrl);
    } catch {
      continue;
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') continue;
    if (hostKey(target.host) !== baseHost) continue;
    if (NOT_A_PAGE.test(target.pathname)) continue;
    const key = canonicalise(target);
    if (key === self || found.has(key)) continue;
    if (sitePrefix === undefined) {
      found.set(key, { url: key, label: labelForPath(key) });
    } else {
      const verdict = classifyPageLink(key, sitePrefix);
      if (verdict === 'skip') continue;
      found.set(key, { url: key, label: labelForPath(key), verdict });
    }
    if (found.size >= max) break;
  }
  return [...found.values()];
}
