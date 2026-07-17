/**
 * BGM Storage helpers — the render-worker background-music library
 * lives in a public Supabase Storage bucket called `bgm`, laid out as:
 *
 *   bgm/
 *     warm-acoustic/*.mp3
 *     modern-corporate/*.mp3
 *     luxury-ambient/*.mp3
 *     chill-electronic/*.mp3
 *     cinematic/*.mp3
 *
 * Phase 104 (2026-07-17): bucket created, admin-tab viewer added.
 * Phase 105 (2026-07-17): Storage is now canonical for the admin UI
 * (add/delete goes through Storage; manifest.json is only used by the
 * render worker for its local mp3 cache — kept in sync via
 * `scripts/render-worker/pull-bgm.sh`).
 */

export const BGM_BUCKET = 'bgm';

/** The five vibe buckets, in canonical display order. */
export const BGM_VIBES = [
  'warm-acoustic',
  'modern-corporate',
  'luxury-ambient',
  'chill-electronic',
  'cinematic',
] as const;

export type BgmVibe = (typeof BGM_VIBES)[number];

export function isBgmVibe(v: string): v is BgmVibe {
  return (BGM_VIBES as readonly string[]).includes(v);
}

/** Per-vibe descriptive copy (mirrored from docs/bgm/vibe-map.md). */
export const BGM_VIBE_META: Record<BgmVibe, { label: string; blurb: string; fit: string }> = {
  'warm-acoustic': {
    label: 'Warm Acoustic',
    blurb: 'Acoustic guitar, ukulele, hand percussion. Cozy, human.',
    fit: 'Single family, cabin, farmhouse, family homes.',
  },
  'modern-corporate': {
    label: 'Modern Corporate',
    blurb: 'Clean piano + light pads, uplifting but restrained.',
    fit: 'Townhome, condo, new construction, modern homes.',
  },
  'luxury-ambient': {
    label: 'Luxury Ambient',
    blurb: 'Sparse piano, soft strings, spacious reverb.',
    fit: '$2M+, estates, high-end condos.',
  },
  'chill-electronic': {
    label: 'Chill Electronic',
    blurb: 'Organic electronic, mellow beats (not lo-fi jazz).',
    fit: 'Urban condo, loft, downtown.',
  },
  cinematic: {
    label: 'Cinematic',
    blurb: 'Sweeping strings + piano, no drops.',
    fit: 'Waterfront, view lots, hero shots.',
  },
};

/** Public streaming URL for a track in the `bgm` bucket. */
export function bgmPublicUrl(vibe: string, file: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? '';
  return `${base}/storage/v1/object/public/${BGM_BUCKET}/${encodeURIComponent(
    vibe,
  )}/${encodeURIComponent(file)}`;
}

/** "07-amazing-plan.mp3" → "Amazing Plan" (strip numeric prefix + Title Case). */
export function prettyTrackTitle(file: string): string {
  const stem = file.replace(/\.mp3$/i, '').replace(/^\d+-/, '');
  return stem
    .split('-')
    .map((w) => (w.length > 0 ? (w[0] ?? '').toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Slugify an uploaded filename into a storage-safe basename WITHOUT extension.
 * "My Fav Track!.mp3" → "my-fav-track"
 */
export function slugifyBgmFilename(original: string): string {
  const stem = original.replace(/\.[^.]+$/, '');
  const slug = stem
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'track';
}
