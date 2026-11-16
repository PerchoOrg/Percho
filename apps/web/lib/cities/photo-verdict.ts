/**
 * A photo's verdict FOR ONE CITY (phase343). PURE.
 *
 * Owner 2026-11-15: "每个community或者city都是单独approval process 不要搞全局
 * 但是可以参考别的approval". A city's verdict lives on `city_poi_photos`; the
 * shared `poi_photos.status` binds a city only when it was rejected for a
 * LEGAL reason ("因为全局原因比如legal拒绝的是可以全局 因为其他筛选原因的不是全局").
 * Every other global verdict is what communities decided — shown as a
 * reference, never applied.
 */
import { RELIGIOUS_PHOTO_DROP_REASON } from '@/lib/poi/religious-content';

export type Verdict = 'pending' | 'approved' | 'rejected';

/** Prefix of a rejection a person made everywhere, for a legal reason. */
export const LEGAL_REASON_PREFIX = 'legal — ';

/** Is this global rejection one that binds every place? */
export function isLegalRejection(reason: string | null | undefined): boolean {
  if (!reason) return false;
  // Fair-housing policy: religious subject matter is out of every tour.
  return reason === RELIGIOUS_PHOTO_DROP_REASON || reason.startsWith(LEGAL_REASON_PREFIX);
}

export interface GlobalPhotoState {
  status: string | null;
  rejection_reason: string | null;
}

export interface CityVerdictRow {
  status: string;
  rejection_reason: string | null;
  reviewed_by: string | null;
}

export interface CityVerdict {
  status: Verdict;
  reason: string | null;
  /** Rejected everywhere for a legal reason; the city cannot overrule it. */
  everywhere: boolean;
  reviewedBy: string | null;
}

const asVerdict = (s: string | null | undefined): Verdict =>
  s === 'approved' || s === 'rejected' ? s : 'pending';

/** What this city has decided about the photo. No row means undecided. */
export function cityVerdict(
  global: GlobalPhotoState,
  city: CityVerdictRow | undefined,
): CityVerdict {
  if (global.status === 'rejected' && isLegalRejection(global.rejection_reason)) {
    return {
      status: 'rejected',
      reason: global.rejection_reason,
      everywhere: true,
      reviewedBy: null,
    };
  }
  const status = asVerdict(city?.status);
  return {
    status,
    reason: status === 'rejected' ? (city?.rejection_reason ?? null) : null,
    everywhere: false,
    reviewedBy: city?.reviewed_by ?? null,
  };
}

/**
 * What other places decided, as a reference line for the review table.
 * `null` when nobody else has an opinion.
 */
export function elsewhereNote(
  global: GlobalPhotoState,
  otherCities: ReadonlyArray<{ name: string; status: string; rejection_reason: string | null }>,
): string | null {
  const parts: string[] = [];
  if (!(global.status === 'rejected' && isLegalRejection(global.rejection_reason))) {
    if (global.status === 'approved') parts.push('communities: in a film');
    if (global.status === 'rejected') {
      parts.push(
        `communities: rejected${global.rejection_reason ? ` — ${global.rejection_reason}` : ''}`,
      );
    }
  }
  for (const c of otherCities) {
    const v = asVerdict(c.status);
    if (v === 'pending') continue;
    parts.push(
      `${c.name}: ${v}${v === 'rejected' && c.rejection_reason ? ` — ${c.rejection_reason}` : ''}`,
    );
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * The writes that make "approved" mean "in this city's current film": the
 * film's photos become approved, any other approved photo goes back to
 * pending. Rejections are never touched — that verdict is the review's.
 */
export function approvalChanges(
  current: ReadonlyMap<string, Verdict>,
  inFilm: ReadonlySet<string>,
): { approve: string[]; unapprove: string[] } {
  const approve = [...inFilm].filter((id) => current.get(id) !== 'approved');
  const unapprove = [...current]
    .filter(([id, v]) => v === 'approved' && !inFilm.has(id))
    .map(([id]) => id);
  return { approve, unapprove };
}
