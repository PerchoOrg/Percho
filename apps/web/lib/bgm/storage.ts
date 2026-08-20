/**
 * BGM Storage helpers — the render-worker background-music library lives in a
 * public Supabase Storage bucket called `bgm`.
 *
 *   bgm/
 *     acoustic/*.mp3
 *     piano/*.mp3
 *     electronic/*.mp3
 *     _state/state.json   ← review state + per-track metadata
 *
 * THE FOLDER IS THE PALETTE, NOT THE TAXONOMY (2026-08-20).
 *
 * It used to be warm-acoustic / modern-corporate / luxury-ambient /
 * chill-electronic, which baked a USE CASE into the folder name —
 * "modern-corporate" describes a stock-music aisle and "luxury-ambient" a
 * price bracket, so changing which listings got which music meant renaming
 * Storage. Worse, the mapping never existed: every render, listing and
 * community alike, called `pick_bgm()` and drew at random from warm-acoustic.
 * The taxonomy was documentation, not mechanism, which is why replacing it
 * cost nothing.
 *
 * Now the folder says only what the music is made of, and everything that
 * varies — how energetic it is, whether it can carry a film or must sit under
 * a voice — is a tag. Mapping rules live in `select.ts`, per product, and can
 * change without moving a file.
 */
export const BGM_BUCKET = 'bgm';

/**
 * The three palettes, in display order. What the music is made of.
 *
 * Three rather than four because the old fourth was a duplicate wearing a
 * different label: "modern-corporate" (clean piano and pads) and
 * "luxury-ambient" (sparse felt piano) are the same instruments at different
 * energies, and energy is a tag now.
 */
export const BGM_VIBES = ['acoustic', 'piano', 'electronic'] as const;

export type BgmVibe = (typeof BGM_VIBES)[number];

export function isBgmVibe(v: string): v is BgmVibe {
  return (BGM_VIBES as readonly string[]).includes(v);
}

/**
 * How much the music moves. The axis that used to be smuggled into the folder
 * name, and the one that separates a restrained high-end film from a warm
 * entry-level one built out of the same instruments.
 */
export const BGM_ENERGIES = ['still', 'gentle', 'moving'] as const;
export type BgmEnergy = (typeof BGM_ENERGIES)[number];

/** Per-palette descriptive copy. Says what it sounds like, not what it is for. */
export const BGM_VIBE_META: Record<BgmVibe, { label: string; blurb: string; fit: string }> = {
  acoustic: {
    label: 'Acoustic',
    blurb: 'Guitar, ukulele, hand percussion, upright bass. Warm and human.',
    fit: 'Established neighbourhoods, family homes, anything with trees in it.',
  },
  piano: {
    label: 'Piano',
    blurb: 'Felt piano, soft strings, air. Considered; the range runs from sparse to bright.',
    fit: 'High-end and new-build. Sparse at the top of a market, brighter below it.',
  },
  electronic: {
    label: 'Electronic',
    blurb: 'Mellow analog synth, soft filtered beat, warm sub bass. Contemporary.',
    fit: 'Urban and walkable — lofts, downtown, communities with nightlife.',
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
 * How a track is used. Follows THE FILM, not the product.
 *
 * A narrated film needs a BED: steady, mid-range clear, never surging, because
 * a swell fights the voice and the ducking compressor rides the voice rather
 * than the music. A film with no voice on it can take a LEAD, which is allowed
 * shape and dynamics; a bed under it would be limp.
 *
 * Community tours are narrated and listing videos are not — today. Owner
 * 2026-08-20: "listing will have narration in the future, similar to
 * community." So the selector is asked whether THIS film is narrated rather
 * than which product it belongs to, and the day listings gain a voice nothing
 * here has to change.
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
  energy: BgmEnergy;
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
