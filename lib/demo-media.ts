/**
 * Demo media override layer.
 *
 * Why this exists
 * ---------------
 * For pre-launch demos we want every cover image, agent headshot, and hero
 * video to look like a curated luxury portfolio (Aman / Pixieset vibe). In
 * production those assets come from the real listing agent and we MUST NOT
 * substitute them — that would be misrepresentation under fair-housing /
 * truth-in-advertising rules.
 *
 * Switch
 * ------
 * Default is ON during pre-launch (visual polish for demos).
 * Before going live with real listings, set in Vercel:
 *     NEXT_PUBLIC_DEMO_MEDIA=false
 * That single flag flips every override off and the real DB media shows
 * through verbatim. The "Stock" badge in the UI also disappears
 * automatically because it's gated on the same flag.
 *
 * Curated set: Unsplash, all explicitly free for commercial use, picked
 * for warm light / modern coastal-PNW luxury, no chromatic clash with the
 * cream Aman palette. Hot-linked (no Vercel egress).
 */

export const DEMO_MEDIA_ENABLED =
  // Explicit kill-switch wins.
  process.env.NEXT_PUBLIC_DEMO_MEDIA !== 'false' &&
  process.env.NEXT_PUBLIC_DEMO_MEDIA !== '0';

/**
 * Curated luxury cover images. Unsplash CDN, free commercial use.
 * 16x10 to 4x5 friendly crops; warm tones to harmonize with cream bg.
 */
const DEMO_COVERS: readonly string[] = [
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=80', // modern white villa
  'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1600&q=80', // glass + stone modernist
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1600&q=80', // beach modern
  'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1600&q=80', // suburban estate twilight
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=80', // architectural pool
  'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1600&q=80', // wood-warm interior living
  'https://images.unsplash.com/photo-1605114704324-4f4d2cf41b32?auto=format&fit=crop&w=1600&q=80', // mid-century glass
  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1600&q=80', // classic mansion
];

/**
 * Curated agent headshot. Single placeholder for the demo agent — neutral,
 * warm-light portrait. (Real agents upload their own.)
 */
const DEMO_HEADSHOT =
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80';

/**
 * Stable hash → index so the same listing id always maps to the same demo
 * cover (no flicker between renders).
 */
function stableIndex(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % mod;
}

/**
 * Pick a curated cover for a listing if demo mode is on and the real cover
 * is missing. If demo mode is off, returns whatever was passed in
 * (preserving production truth).
 */
export function demoCoverFor(seed: string, real: string | null): string | null {
  if (!DEMO_MEDIA_ENABLED) return real;
  // Even with real cover present, in demo mode we want a curated portfolio.
  // BUT we never override URLs that look like uploaded assets in production
  // storage — guarded by the flag itself, which should be off in prod.
  return DEMO_COVERS[stableIndex(seed, DEMO_COVERS.length)] ?? real;
}

export function demoHeadshotFor(real: string | null): string | null {
  if (!DEMO_MEDIA_ENABLED) return real;
  return real ?? DEMO_HEADSHOT;
}

/**
 * Curated luxury / neighborhood video clips for swipe feed override.
 * All Pexels free commercial-use, hot-linked from videos.pexels.com.
 *
 * Two pools so we can route by context:
 *   - `home`: interior + exterior tours, the listing swipe feed
 *   - `nearby`: streetscape, dining, schools, parks (the Nearby pool)
 *
 * Picked at 720p where possible (smaller file, fast first-frame). We hash
 * the cfVideoId so the same listing always maps to the same demo clip
 * (no flicker between renders / autoplay restarts).
 */
// All URLs below validated 200 via curl HEAD (Pexels CDN is picky about
// the exact quality/fps variant — guessing breaks). If you swap a clip,
// re-verify the variant suffix or playback will silently fall back.
const DEMO_HOME_VIDEOS: readonly string[] = [
  'https://videos.pexels.com/video-files/7578548/7578548-hd_1920_1080_30fps.mp4', // modern villa drone
  'https://videos.pexels.com/video-files/7578544/7578544-hd_1920_1080_30fps.mp4', // architectural exterior
  'https://videos.pexels.com/video-files/3773486/3773486-hd_1920_1080_30fps.mp4', // pool / patio twilight
  'https://videos.pexels.com/video-files/2098989/2098989-hd_1920_1080_30fps.mp4', // bright modern interior
  'https://videos.pexels.com/video-files/2249402/2249402-hd_1920_1080_24fps.mp4', // mansion exterior
  'https://videos.pexels.com/video-files/1739010/1739010-hd_1920_1080_30fps.mp4', // contemporary living
];

const DEMO_NEARBY_VIDEOS: readonly string[] = [
  'https://videos.pexels.com/video-files/3214448/3214448-hd_1920_1080_25fps.mp4', // cafe / street
  'https://videos.pexels.com/video-files/2022395/2022395-hd_1920_1080_30fps.mp4', // restaurant interior
  'https://videos.pexels.com/video-files/3209828/3209828-hd_1920_1080_25fps.mp4', // suburban street / school
  'https://videos.pexels.com/video-files/853877/853877-hd_1920_1080_25fps.mp4',   // tree-lined park
  'https://videos.pexels.com/video-files/6963744/6963744-hd_1920_1080_25fps.mp4', // boutique / shop interior
  'https://videos.pexels.com/video-files/855564/855564-hd_1920_1080_24fps.mp4',   // park walk
];

export type DemoVideoPool = 'home' | 'nearby';

/**
 * Returns a curated MP4 URL for the given seed, or null if demo mode off.
 *
 * Callers (BrowseFeed / VideoFeed / CommunityVideoFeed) check this first;
 * if non-null, mount a plain `<video src=mp4>` instead of attaching HLS.
 * That keeps the override logic out of the HLS path entirely.
 */
export function demoVideoFor(seed: string, pool: DemoVideoPool): string | null {
  if (!DEMO_MEDIA_ENABLED) return null;
  const list = pool === 'home' ? DEMO_HOME_VIDEOS : DEMO_NEARBY_VIDEOS;
  return list[stableIndex(seed, list.length)] ?? null;
}

/**
 * Curated 4-photo album for photo-only listings (e.g. 888 Rhonda Place).
 * Walks the cover pool starting at `stableIndex(seed)` so the album feels
 * like one cohesive shoot, and different listings get distinct sets.
 */
export function demoPhotosFor(seed: string, real: string[]): string[] {
  if (!DEMO_MEDIA_ENABLED) return real;
  const start = stableIndex(seed, DEMO_COVERS.length);
  const album: string[] = [];
  for (let i = 0; i < 6; i++) {
    const url = DEMO_COVERS[(start + i) % DEMO_COVERS.length];
    if (url) album.push(url);
  }
  return album;
}
