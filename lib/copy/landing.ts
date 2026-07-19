/**
 * Single source of truth for marketing copy on the public Landing page.
 *
 * The tagline is referenced in multiple places (Landing hero, social embed
 * meta tags eventually, possibly the dashboard onboarding). Keeping it here
 * means a brand decision change is one edit, not a grep-and-replace.
 */
export const LANDING_TAGLINE = 'TikTok for Homebuying';
export const LANDING_SUBTITLE = 'Listings that feel like a place, not a spreadsheet.';

// Pexels free-stock luxury home tour clip used as the hero background video.
// Hot-linked — no Vercel egress.
export const LANDING_HERO_VIDEO =
  'https://videos.pexels.com/video-files/7578548/7578548-uhd_2560_1440_30fps.mp4';

// Unsplash fallback poster for the <video> tag's `poster` attribute (shows
// before video buffers / on slow connections / when autoplay is blocked).
export const LANDING_HERO_POSTER =
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=80';
