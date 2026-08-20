/**
 * Religious-content filter (pure).
 *
 * No generated tour may feature a place of worship. Owner decision
 * 2026-08-19, on a Hindu temple that reached Aberdeen's film: "we should
 * avoid all Religious stuff".
 *
 * The reason is the same one behind `school-language.ts`. Religion is a
 * protected class under the Fair Housing Act, and marketing that presents a
 * neighbourhood's religious character — whichever religion — is how steering
 * claims start. A buyer who wants to know what is nearby can search for it;
 * a film we publish should not be the thing that answers it.
 *
 * Three independent surfaces have to agree, because a temple can arrive by
 * three routes: the research agent proposing one, a Places nearby search
 * returning one by type, and a POI already linked to a community from an
 * earlier run. This module is the shared predicate; the callers are
 * `tour-steps/resolve.ts` (agent + nearby firewall) and the discovery path.
 *
 * `'faith'` stays in `INTENT_BUCKETS` on purpose: the DB check constraints
 * allow it and historical rows carry it, so removing the value would
 * invalidate stored data. It is simply unreachable now.
 */

/** Google Places types that identify a place of worship. */
export const RELIGIOUS_PLACE_TYPES: readonly string[] = [
  'church',
  'mosque',
  'synagogue',
  'hindu_temple',
  'place_of_worship',
];

/**
 * Names that give a place of worship away when Google's type does not.
 * A temple listed as `tourist_attraction` still must not appear, and that is
 * exactly how NASSTA got through — the agent proposed it by name.
 */
const RELIGIOUS_NAME = new RegExp(
  [
    '\\bchurch(es)?\\b',
    '\\bcathedral\\b',
    '\\bchapel\\b',
    '\\bparish\\b',
    '\\bmosque\\b',
    '\\bmasjid\\b',
    '\\bsynagogue\\b',
    '\\btemple\\b',
    '\\bgurdwara\\b',
    '\\bshrine\\b',
    '\\bmonastery\\b',
    '\\bconvent\\b',
    '\\bministr(y|ies)\\b',
    '\\bcongregation\\b',
    '\\bdiocese\\b',
    '\\bsaints?\\b(?!\\s+(row|street|avenue|road|drive|lane|park))',
  ].join('|'),
  'i',
);

export interface PlaceLike {
  name?: string | null;
  bucket?: string | null;
  primaryType?: string | null;
  types?: readonly string[] | null;
}

/**
 * True when a place should never appear in a generated tour.
 *
 * Deliberately over-inclusive on names: excluding a secular business called
 * "Temple Coffee" costs one POI out of a dozen candidates, while including a
 * place of worship is a fair-housing exposure. The trade is not symmetric.
 */
export function isReligiousPlace(p: PlaceLike): boolean {
  if (p.bucket === 'faith') return true;
  if (p.primaryType && RELIGIOUS_PLACE_TYPES.includes(p.primaryType)) return true;
  for (const t of p.types ?? []) {
    if (RELIGIOUS_PLACE_TYPES.includes(t)) return true;
  }
  return p.name ? RELIGIOUS_NAME.test(p.name) : false;
}

/** The reason string the drop lists show, so the filter is visible, not silent. */
export const RELIGIOUS_DROP_REASON =
  'place of worship — excluded from every tour (fair-housing policy)';

/**
 * Religious SUBJECT MATTER, read off a photo's own description and tags.
 *
 * The place filter above is not enough, because a religious image can arrive
 * attached to an entirely secular POI. Riverwatch Middle School shipped in
 * Aberdeen's film showing a garlanded shrine in the school gymnasium: the POI
 * is a school, so every check above passed, and the tagger had labelled the
 * image "cultural-celebration" rather than religious. Only the word "shrine"
 * in its own description gave it away.
 *
 * Same asymmetry as the name list, and more so here: dropping one photo costs
 * a POI its third frame, while publishing one is the fair-housing exposure.
 */
const RELIGIOUS_SUBJECT = new RegExp(
  [
    '\\bshrine\\b',
    '\\baltar\\b',
    '\\bdeity\\b',
    '\\bidol\\b',
    '\\bicon(s|ography)\\b',
    '\\bmenorah\\b',
    '\\bcrucifix\\b',
    '\\bcrescent\\s+and\\s+star\\b',
    '\\bstar\\s+of\\s+david\\b',
    '\\bpuja\\b',
    '\\bmandir\\b',
    '\\bgurdwara\\b',
    '\\bpalanquin\\b',
    '\\bprayer\\b',
    '\\bworship\\b',
    '\\breligio\\w*',
    '\\bhindu\\b',
    '\\bbuddhis\\w*',
    '\\bchristian\\b',
    '\\bmuslim\\b',
    '\\bislamic\\b',
    '\\bjewish\\b',
    '\\bsikh\\b',
    '\\bnativity\\b',
    '\\bpew(s)?\\b',
    '\\bsai\\s+baba\\b',
    '\\bganesh\\w*',
    '\\bkrishna\\b',
    '\\bbuddha\\b',
  ].join('|'),
  'i',
);

/** True when a photo's own content is religious, whatever place it belongs to. */
export function isReligiousPhoto(photo: {
  description?: string | null;
  tags?: readonly string[] | null;
}): boolean {
  const text = [photo.description ?? '', ...(photo.tags ?? [])].join(' ');
  return text.trim() ? RELIGIOUS_SUBJECT.test(text) : false;
}

/** Drop reason for a photo caught by subject matter rather than by place. */
export const RELIGIOUS_PHOTO_DROP_REASON =
  'religious subject matter — excluded from every tour (fair-housing policy)';
