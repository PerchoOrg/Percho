/**
 * Incompetech catalog client — Kevin MacLeod's public pieces.json.
 *
 * https://incompetech.com/music/royalty-free/pieces.json is the same JSON
 * the incompetech.com "royalty-free music" search page fetches. Fields we
 * use: `uuid`, `title`, `filename`, `feel`, `bpm`, `instruments`,
 * `length`. Not all fields are documented; we type only what we consume.
 *
 * License: CC-BY 4.0 by Kevin MacLeod (incompetech.com). Attribution is
 * already handled in the render output.
 *
 * We fetch once per request from a short-lived module-level memo — the
 * admin route pings this at most a handful of times per session and the
 * catalog is ~1 MB. Not worth a Redis / KV cache.
 */

const CATALOG_URL = 'https://incompetech.com/music/royalty-free/pieces.json';
const MP3_BASE = 'https://incompetech.com/music/royalty-free/mp3-royaltyfree';

// biome-ignore lint/suspicious/noExplicitAny: pieces.json ships extra fields we don't type
export type IncompetechPiece = {
  uuid: string;
  title: string;
  filename: string;
  feel?: string;
  bpm?: string;
  instruments?: string;
  length?: string;
  genre?: string;
};

let memo: { at: number; data: IncompetechPiece[] } | null = null;
const TTL_MS = 10 * 60 * 1000;

export async function fetchIncompetechCatalog(): Promise<IncompetechPiece[]> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.data;
  const res = await fetch(CATALOG_URL, {
    headers: { 'User-Agent': 'Percho-admin/1.0' },
    // Next.js: don't cache in the fetch layer; we own the memo.
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`incompetech pieces.json HTTP ${res.status}`);
  const data = (await res.json()) as IncompetechPiece[];
  memo = { at: Date.now(), data };
  return data;
}

export function incompetechMp3Url(filename: string): string {
  // Incompetech uses percent-encoding (spaces → %20). encodeURIComponent
  // also escapes '/', which is what we want since filenames never contain
  // a slash.
  return `${MP3_BASE}/${encodeURIComponent(filename)}`;
}

/**
 * Slug used to match against existing bucket filenames — same rules as
 * user uploads: lowercase, `[a-z0-9-]`, no NN- prefix.
 */
export function pieceSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    // biome-ignore lint/suspicious/noMisleadingCharacterClass: intentional combining-mark strip
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Case-insensitive substring search across title / feel / instruments.
 * Returns pieces ranked by title-match first, capped at `limit`.
 */
export function searchCatalog(
  pieces: IncompetechPiece[],
  q: string,
  limit = 50,
): IncompetechPiece[] {
  const query = q.trim().toLowerCase();
  if (!query) return pieces.slice(0, limit);
  const titleHits: IncompetechPiece[] = [];
  const otherHits: IncompetechPiece[] = [];
  for (const p of pieces) {
    if (p.title.toLowerCase().includes(query)) titleHits.push(p);
    else if (
      (p.feel ?? '').toLowerCase().includes(query) ||
      (p.instruments ?? '').toLowerCase().includes(query) ||
      (p.genre ?? '').toLowerCase().includes(query)
    ) {
      otherHits.push(p);
    }
    if (titleHits.length >= limit) break;
  }
  return [...titleHits, ...otherHits].slice(0, limit);
}
