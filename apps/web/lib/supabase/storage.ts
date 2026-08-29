/**
 * Helpers for the `listing-photos` and `community-photos` Supabase
 * Storage buckets.
 *
 * listing-photos. Public bucket, public URLs.
 * community-photos. PRIVATE bucket — buyer
 * invisible. We only build storage paths here; reads go through signed
 * URLs minted server-side.
 */

const BUCKET = 'listing-photos';
const COMMUNITY_BUCKET = 'community-photos';

/**
 * A photo row as `preferredPhotoPath` needs it.
 *
 * Structural, not the generated Row type: `listing_photos` and `poi_photos`
 * carry the same four columns and both go through here.
 */
export interface EnhanceablePhotoRow {
  storage_path: string;
  enhanced_path?: string | null;
  enhanced_status?: string | null;
}

/**
 * Which file to actually serve for a photo — the enhanced one whenever it
 * exists.
 *
 * ── No approval gate (owner, 2026-08-29) ────────────────────────────────────
 *
 * The 2026-08-03 migration said the enhanced file "is NEVER used implicitly"
 * and required `enhanced_status = 'approved'`, set by hand in /admin. Owner:
 * 「no you dont need approve the enhanced one, they should be the default
 * options for any photos we are using」. So presence of the FILE is the gate;
 * only an explicitly bad outcome is skipped.
 *
 * It is a real difference, not a tidy-up. Measured on the live bucket the same
 * day: originals are 800×531, enhanced are **1600×1062** — `enhance.py` runs
 * Real-ESRGAN ×2 on any source under 2400px. An 80-photo sample of the feed
 * pool had an enhanced file for every single one.
 *
 * NOT applied to `scripts/render-worker/*.py`, which keeps its own
 * `approved_enhanced_path`. Changing what a paid render pipeline reads would
 * invalidate finished clips, and that is the owner's call to make separately.
 */
export function preferredPhotoPath(row: EnhanceablePhotoRow): string {
  const status = row.enhanced_status;
  if (status === 'rejected' || status === 'failed') return row.storage_path;
  return row.enhanced_path ?? row.storage_path;
}

/**
 * The SAME photo, rendered by Supabase at the size it will actually be drawn.
 *
 * ── Why (owner, 2026-08-29) ─────────────────────────────────────────────────
 *
 * 「the page with multiple photos are slower than others when swiping」. The
 * trade-off card draws six plates and each was fetching the full enhanced file:
 * 1600x1062 and ~310 KB, six times over — **1.86 MB and 1.7 megapixels per
 * plate to decode**, on a card the buyer may swipe past in a second.
 *
 * A plate is ~152pt wide at rest and ~210pt with its door dragged open, so 640px
 * covers it on a 3x screen with room to spare. Measured on the same photo:
 * 42,558 bytes at 640x427 against 309,616 at full size — **7.3x fewer bytes and
 * 6.2x fewer pixels**, for an image that is downsampled either way.
 *
 * Only for Supabase-hosted paths. A community hero can be a Cloudflare Stream
 * thumbnail, which this would silently 404.
 */
export function photoRenderUrl(
  storagePath: string,
  opts: { width: number; height: number; quality?: number },
): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return photoPublicUrl(storagePath);
  const params = new URLSearchParams({
    width: String(opts.width),
    height: String(opts.height),
    resize: 'cover',
    quality: String(opts.quality ?? 75),
  });
  return `${base.replace(/\/$/, '')}/storage/v1/render/image/public/${BUCKET}/${storagePath}?${params.toString()}`;
}

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
 * community photo path helper. Path convention
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
 * user avatars (agents + buyers share one bucket).
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
