/**
 * Which Cloudflare Stream assets are still doing work, and which are landfill.
 *
 * Every re-run of a tour uploads a fresh cut per surface and leaves the
 * previous one on Stream. Nothing has ever deleted them: on 2026-08-23 the
 * account held 282 videos / 158.5 min, of which 49 were referenced by a video
 * row and 233 were not — 83% of the storage bill for cuts nobody can reach
 * (owner: "they are consuming my resources, can we have some way to clean up").
 *
 * Deliberately NOT in scope: `listing_photo_clips`. Clips are keyed by
 * (photo, surface, render_key) and shared across runs — that is what makes a
 * re-run reuse paid Seedance renders instead of re-billing them. 323 clips,
 * zero duplicate keys, $0.85 recorded. Deleting them would cost money, not
 * save it.
 *
 * Pure — the caller supplies the Stream listing and every uid the database
 * still points at, so this can be tested without either service.
 */

export type StreamAsset = {
  uid: string;
  /** ISO timestamp from Cloudflare. */
  created: string;
  /** Seconds; Cloudflare reports null while a video is still processing. */
  duration: number | null;
  state: string;
};

/**
 * Where a uid is referenced. `live` means something a viewer can still reach;
 * `superseded` means only a tour assembly row that is no longer the current
 * cut for its (listing, surface).
 */
export type RefKind = 'live' | 'superseded';

export type OrphanClass = 'live' | 'superseded' | 'unreferenced';

export type ClassifiedAsset = StreamAsset & {
  klass: OrphanClass;
  minutes: number;
};

export type OrphanReport = {
  assets: ClassifiedAsset[];
  buckets: Record<OrphanClass, { count: number; minutes: number; usdPerMonth: number }>;
  /** Everything safe to delete: not live, and old enough. */
  deletable: ClassifiedAsset[];
};

/** Cloudflare Stream storage: $5 per 1000 minutes stored per month. */
export const USD_PER_MINUTE_MONTH = 5 / 1000;

/**
 * A cut uploaded seconds ago may not have been written to its video row yet —
 * the assembly step uploads, waits for Stream to finish encoding, then patches
 * the row. Anything younger than this is left alone whatever it looks like.
 */
export const MIN_AGE_HOURS = 24;

export function classifyStreamAssets(input: {
  assets: StreamAsset[];
  /** uid → what still points at it. Absent = nothing in the database does. */
  refs: Map<string, RefKind>;
  now?: number;
  minAgeHours?: number;
}): OrphanReport {
  const now = input.now ?? Date.now();
  const minAge = (input.minAgeHours ?? MIN_AGE_HOURS) * 3_600_000;

  const assets = input.assets.map((a): ClassifiedAsset => {
    const ref = input.refs.get(a.uid);
    return {
      ...a,
      klass: ref === 'live' ? 'live' : ref === 'superseded' ? 'superseded' : 'unreferenced',
      minutes: (a.duration ?? 0) / 60,
    };
  });

  const buckets: OrphanReport['buckets'] = {
    live: { count: 0, minutes: 0, usdPerMonth: 0 },
    superseded: { count: 0, minutes: 0, usdPerMonth: 0 },
    unreferenced: { count: 0, minutes: 0, usdPerMonth: 0 },
  };
  for (const a of assets) {
    const b = buckets[a.klass];
    b.count += 1;
    b.minutes += a.minutes;
    b.usdPerMonth = b.minutes * USD_PER_MINUTE_MONTH;
  }

  const deletable = assets.filter(
    (a) => a.klass !== 'live' && now - new Date(a.created).getTime() >= minAge,
  );

  return { assets, buckets, deletable };
}

/**
 * The uid → reference map, from rows the caller has already read.
 *
 * `live` wins over `superseded` wherever both claim a uid: one assembly row
 * going stale does not retire a cut that a video row still plays.
 */
export function buildRefMap(input: {
  /** uids reachable through a video row, a community cover, anything a viewer hits. */
  live: Array<string | null | undefined>;
  /** uids held only by tour assembly rows. */
  assemblies: Array<string | null | undefined>;
}): Map<string, RefKind> {
  const refs = new Map<string, RefKind>();
  for (const uid of input.assemblies) if (uid) refs.set(uid, 'superseded');
  for (const uid of input.live) if (uid) refs.set(uid, 'live');
  return refs;
}
