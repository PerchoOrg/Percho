/**
 * A FOCUSED feed pool (phase404).
 *
 * Owner, 2026-11-25: 「作为一个用户 我应该可以在喜欢某一个city之后 选择或者被动地
 * 推荐 使得feed局限在这个city 同理 也应该可以在喜欢某个community之后 进一步看这个
 * 社区的房子」. The cards run city → community → home, and a like is how a
 * buyer steps down a level: the pool they are handed next is that one place.
 *
 *   GET /api/mobile/feed?city=city:suwanee-ga     the city's communities and homes
 *   GET /api/mobile/feed?community=windward       the homes in the community
 *
 * A focus NARROWS, on the server. The phone's `preferScope` (phase140) only
 * reorders a pool it already holds, which is enough while the pool is twenty
 * films; a licensed feed is tens of thousands of homes, and the ones in one
 * subdivision cannot be reached by paging the whole metro newest-first.
 *
 * A focus on a place we do not have is `unknown`, and an unknown focus is an
 * EMPTY pool — never the unfocused one. A buyer who asked for Suwanee and is
 * shown Atlanta has been told something false about where those homes are.
 *
 * It changes what is read, not what may be seen: the §0.2 listing gate and
 * `listings=0` apply to a focused pool exactly as they do to any other.
 */

import { createUncachedAnonClient } from '@/lib/supabase/server';
import type { ListingPlaceFilter } from './browse-cards';
import { fetchCityGeoUnits } from './geo-units';

export type PoolFocus =
  | { kind: 'city'; unitId: string; city: string; state: string }
  /** `unitId` is the community's own city, when its row names one. */
  | { kind: 'community'; communityId: string; unitId?: string }
  | { kind: 'unknown' };

/**
 * A city's unit id, `city:<city>-<state>` — the id `city_geo_units` builds in
 * SQL. The two must agree, or a focus names a unit the pool does not hold.
 */
export function cityUnitId(city: string | null, state: string | null): string | undefined {
  if (!city || !state) return undefined;
  const slug = `${city}-${state}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `city:${slug}`;
}

/** The listing query's narrowing. `undefined` for no focus — and for an unknown one, which reads no listings at all. */
export function listingPlaceFor(focus: PoolFocus | null): ListingPlaceFilter | undefined {
  if (focus?.kind === 'city') return { city: focus.city, state: focus.state };
  if (focus?.kind === 'community') return { communityId: focus.communityId };
  return undefined;
}

/** The communities a focused pool carries: the city's, or the one. */
export function focusCommunities<T extends { id: string; geoUnitId?: string }>(
  communities: T[],
  focus: PoolFocus | null,
): T[] {
  if (focus === null) return communities;
  if (focus.kind === 'city') return communities.filter((c) => c.geoUnitId === focus.unitId);
  if (focus.kind === 'community') return communities.filter((c) => c.id === focus.communityId);
  return [];
}

/**
 * The city units a focused pool carries: the focused city, or the focused
 * community's city — the one unit the phone's place line and Map button can
 * still need. Every other city's film stays out of a deck that was narrowed.
 */
export function focusGeoUnits<T extends { id: string }>(units: T[], focus: PoolFocus | null): T[] {
  if (focus === null) return units;
  if (focus.kind === 'unknown') return [];
  return units.filter((u) => u.id === focus.unitId);
}

/**
 * Read the focus a request names. `null` when it names none; `community` wins
 * over `city`, being the narrower.
 */
export async function resolvePoolFocus(args: {
  city?: string | undefined;
  community?: string | undefined;
}): Promise<PoolFocus | null> {
  if (args.community) {
    const { data } = await createUncachedAnonClient()
      .from('communities')
      .select('id, city, state')
      .eq('slug', args.community)
      .eq('status', 'active')
      .maybeSingle();
    if (!data) return { kind: 'unknown' };
    const unitId = cityUnitId(data.city, data.state);
    return { kind: 'community', communityId: data.id, ...(unitId ? { unitId } : {}) };
  }
  if (args.city) {
    const unit = (await fetchCityGeoUnits()).find((u) => u.id === args.city);
    if (!unit) return { kind: 'unknown' };
    return { kind: 'city', unitId: unit.id, city: unit.name, state: unit.state };
  }
  return null;
}
