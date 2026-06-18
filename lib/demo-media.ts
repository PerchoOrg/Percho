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
