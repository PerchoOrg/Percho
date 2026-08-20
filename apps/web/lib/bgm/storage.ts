/**
 * BGM Storage helpers — the render-worker background-music library
 * lives in a public Supabase Storage bucket called `bgm`, laid out as:
 *
 *   bgm/
 *     warm-acoustic/*.mp3
 *     modern-corporate/*.mp3
 *     luxury-ambient/*.mp3
 *     chill-electronic/*.mp3
 * _state/state.json ← rejected-track sidecar (soft-delete)
 *
 * bucket created, admin-tab viewer added.
 * Storage is now canonical for the admin UI
 * (add/delete goes through Storage; manifest.json is only used by the
 * render worker for its local mp3 cache — kept in sync via
 * `scripts/render-worker/pull-bgm.sh`).
 * `cinematic` vibe removed (owner: "too somber");
 * per-track "delete" replaced with soft **reject** (mp3 stays in Storage
 * for a possible restore; worker skips downloading it).
 */

export const BGM_BUCKET = 'bgm';

/**
 * The four vibe buckets, in canonical display order.
 *
 * `cinematic` removed — owner rated the whole bucket "too somber".
 * Tracks were deleted from Storage; the folder is no longer created
 * for new tracks. If you resurrect a similar vibe later, pick a new
 * name to avoid confusion with the archived files.
 */
export const BGM_VIBES = [
  'warm-acoustic',
  'modern-corporate',
  'luxury-ambient',
  'chill-electronic',
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
};

/**
 * State sidecar path in Storage. Content: { "rejected": ["<vibe>/<file>.mp3", …] }.
 * Rejected tracks stay in Storage but the render worker skips downloading them
 * (see `scripts/render-worker/pull-bgm.sh`). Admin UI shows them dimmed with
 * an "Approve" toggle to bring them back.
 */
export const BGM_STATE_PATH = '_state/state.json';

/**
 * How a track is used, which is the one thing the two products cannot share.
 *
 * A community tour now carries narration over most of its length, so its music
 * has to be a BED: steady, mid-range clear, never surging. A listing video has
 * no voice on it, so its music can LEAD — it is allowed shape and dynamics,
 * and a bed under it would be limp.
 *
 * Owner 2026-08-20 asked whether music should be shared between listings and
 * communities or customised. The character (the vibe) is shared; this is not.
 * Modelling it as a tag rather than four more buckets keeps one library.
 */
export const BGM_ROLES = ['bed', 'lead'] as const;
export type BgmRole = (typeof BGM_ROLES)[number];

/**
 * What a track is, so the planner can choose one instead of rolling dice.
 *
 * Owner 2026-08-20: "each generated music should have a name to reflect its
 * vibe, and better to have some tags as well so easy for assembly to choose."
 * A filename like `ai-warm-20260820-8eb4.mp3` says when it was made and
 * nothing about how it sounds.
 */
export type BgmTrackMeta = {
  /** Human title, e.g. "Porch Light". Shown in the admin, not a filename. */
  title: string;
  vibe: BgmVibe;
  role: BgmRole;
  /** Free-form descriptors the planner matches on: "calm", "sunlit", "piano". */
  tags: string[];
  /** 'lyria' | 'import' | 'upload' — where it came from. */
  source: string;
  created_at: string;
};

export type BgmState = {
  schema_version: 1;
  rejected: string[];
  /** Keyed by "<vibe>/<file>.mp3". Absent for tracks predating the field. */
  meta?: Record<string, BgmTrackMeta>;
  /**
   * Generated but not yet reviewed. Treated exactly like `rejected` by the
   * render worker — a track nobody has listened to must not be able to reach
   * a customer's film.
   *
   * Added 2026-08-20 with AI generation. Until then every track in the bucket
   * had been chosen by a human before it got there, so "in Storage" and
   * "approved" were the same thing; a generate button breaks that, and the
   * owner asked for the gate explicitly: "ai generation, review and
   * approve/reject process".
   */
  pending?: string[];
  updated_at: string;
};

export function emptyBgmState(): BgmState {
  return {
    schema_version: 1,
    rejected: [],
    pending: [],
    meta: {},
    updated_at: new Date().toISOString(),
  };
}

/** A track the render worker may use: present, reviewed, and not rejected. */
export function isPlayable(path: string, state: BgmState): boolean {
  return !state.rejected.includes(path) && !(state.pending ?? []).includes(path);
}

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
    // biome-ignore lint/suspicious/noMisleadingCharacterClass: stripping the combining-diacritic block after NFKD is exactly the intent
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'track';
}
