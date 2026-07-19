/**
 * Helpers for the `listing-photos` and `community-photos` Supabase
 * Storage buckets.
 *
 * Phase 10 (2026-06-12): listing-photos. Public bucket, public URLs.
 * Phase 20.2 (2026-06-13): community-photos. PRIVATE bucket — buyer
 * invisible. We only build storage paths here; reads go through signed
 * URLs minted server-side.
 */

const BUCKET = 'listing-photos';
const COMMUNITY_BUCKET = 'community-photos';

export function photoPublicUrl(storagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    // In SSR contexts we always have it; this branch is just defensive.
    return `/storage/${BUCKET}/${storagePath}`;
  }
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

export function nextPhotoStoragePath(listingId: string, fileName: string): string {
  const ext = (fileName.split('.').pop() ?? 'jpg').toLowerCase();
  const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
  // Use crypto.randomUUID — available in browsers and Node 19+.
  const id =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${listingId}/${id}.${safeExt}`;
}

export const LISTING_PHOTOS_BUCKET = BUCKET;

/**
 * Phase 20.2 (2026-06-13): community photo path helper. Path convention
 * is `{communityId}/{uuid}.{ext}` — mirrors listing-photos so the
 * storage RLS policy can scope by `split_part(name, '/', 1)`.
 */
export function nextCommunityPhotoStoragePath(communityId: string, fileName: string): string {
  const ext = (fileName.split('.').pop() ?? 'jpg').toLowerCase();
  const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
  const id =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${communityId}/${id}.${safeExt}`;
}

export const COMMUNITY_PHOTOS_BUCKET = COMMUNITY_BUCKET;

/**
 * Phase 27 (2026-06-14): user avatars (agents + buyers share one bucket).
 * Path convention: `{user_id}/{uuid}.webp`. Public bucket — anyone can
 * read by URL; storage RLS scopes writes to the caller's own user_id.
 */
const AVATARS = 'avatars';

export const AVATARS_BUCKET = AVATARS;

export function avatarPublicUrl(storagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return `/storage/${AVATARS}/${storagePath}`;
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/${AVATARS}/${storagePath}`;
}

export function nextAvatarStoragePath(userId: string): string {
  const id =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${userId}/${id}.webp`;
}

/** The 3 system-provided house presets (1 / 2 / 3 houses). */
export const AVATAR_PRESETS: readonly string[] = [
  '/avatars/preset-1.svg',
  '/avatars/preset-2.svg',
  '/avatars/preset-3.svg',
];

export function isPresetAvatar(url: string | null | undefined): boolean {
  return !!url && url.startsWith('/avatars/preset-');
}
