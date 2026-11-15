/**
 * Wikimedia Commons as a photo source for city films (phase325). PURE: URLs
 * out, API JSON in. The I/O is `scripts/admin/city-photos.ts`.
 *
 * Why Commons: a city film is about the city as a whole, and Google Places
 * only photographs listed places. An 1897 survey map, a residential street or
 * the caboose by the tracks is not a business.
 */

export const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

/**
 * Commons serves thumbnails only at its standard widths; any other width is
 * refused (a hand-built 1600px URL fails, 2026-11-15). 1920 covers the film
 * canvas with room for a pan.
 */
const THUMB_WIDTH = 1920;

export interface CommonsFile {
  /** "File:Suwanee Caboose, Suwanee GA.jpg" */
  title: string;
  /** The file to download: the 1920px rendition, or the original when smaller. */
  downloadUrl: string;
  /** The file's page on Commons — where a credit links. */
  pageUrl: string;
  width: number;
  height: number;
  licence: string;
  author: string;
}

/**
 * Whether a film may use a file under this licence.
 *
 * Public domain, CC0 and CC BY: yes — CC BY asks only for a credit, which
 * `attribution` carries. Share-alike: NO. A film cut from a photo is an
 * adaptation of it, and share-alike would put the whole film under the same
 * licence. Non-commercial and no-derivatives fail for the obvious reasons, and
 * anything unrecognised fails closed.
 */
export function commonsLicenceOk(licence: string | null | undefined): boolean {
  const l = (licence ?? '').trim().toLowerCase();
  if (!l) return false;
  if (/\b(sa|nc|nd)\b/.test(l.replace(/[-_]/g, ' '))) return false;
  if (l === 'cc0' || l.startsWith('cc0 ') || l.startsWith('public domain') || l === 'pd') {
    return true;
  }
  return /^cc by( \d(\.\d)?)?( [a-z]{2,})?$/.test(l.replace(/-/g, ' '));
}

const stripTags = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const INFO = `prop=imageinfo&iiprop=url|size|extmetadata&iiextmetadatafilter=LicenseShortName|Artist&iiurlwidth=${THUMB_WIDTH}`;

/** Search the File namespace. */
export function commonsSearchUrl(query: string, limit = 40): string {
  return `${COMMONS_API}?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=${limit}&gsrsearch=${encodeURIComponent(query)}&${INFO}`;
}

/** Look files up by title ("File:…"). */
export function commonsTitlesUrl(titles: readonly string[]): string {
  return `${COMMONS_API}?action=query&format=json&titles=${encodeURIComponent(titles.join('|'))}&${INFO}`;
}

/** The photographs in an API response, in search order. Non-photos are dropped. */
export function parseCommonsPages(json: unknown): CommonsFile[] {
  const pages = (json as { query?: { pages?: Record<string, unknown> } } | null)?.query?.pages;
  if (!pages) return [];
  type Page = {
    title?: string;
    index?: number;
    imageinfo?: Array<{
      url?: string;
      thumburl?: string;
      descriptionurl?: string;
      width?: number;
      height?: number;
      extmetadata?: Record<string, { value?: string }>;
    }>;
  };
  const out: Array<CommonsFile & { index: number }> = [];
  for (const raw of Object.values(pages)) {
    const page = raw as Page;
    const info = page.imageinfo?.[0];
    if (!page.title || !info?.url || !/\.(jpe?g|png|webp)$/i.test(page.title)) continue;
    out.push({
      title: page.title,
      downloadUrl: info.thumburl ?? info.url,
      pageUrl: info.descriptionurl ?? '',
      width: info.width ?? 0,
      height: info.height ?? 0,
      licence: stripTags(info.extmetadata?.LicenseShortName?.value ?? ''),
      author: stripTags(info.extmetadata?.Artist?.value ?? '').slice(0, 120),
      index: page.index ?? 0,
    });
  }
  return out.sort((a, b) => a.index - b.index).map(({ index: _index, ...file }) => file);
}
