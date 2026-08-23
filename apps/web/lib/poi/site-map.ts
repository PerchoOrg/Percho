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

export interface PageLink {
  url: string;
  label: string;
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
export function sameOriginPageLinks(html: string, pageUrl: string, max = 40): PageLink[] {
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
    found.set(key, { url: key, label: labelForPath(key) });
    if (found.size >= max) break;
  }
  return [...found.values()];
}
