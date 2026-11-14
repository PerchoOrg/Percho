/**
 * Which kind of place a tour run films — the only thing that differs between
 * a community film and a city film (phase318).
 *
 * Cities have their own tables (owner 2026-11-14: "单独建一套城市表"), mirrored
 * from the community ones, so every step reads its table names from here
 * instead of naming `community_*` itself. `pois`, `poi_photos` and
 * `photo_clips` are shared and stay hard-coded.
 *
 * The same pattern as `PoiEntityScope` (`lib/poi/entity-scope.ts`), which the
 * photo fetch already uses — `poiScope` is that object for this kind.
 */
import { CITY_SCOPE, COMMUNITY_SCOPE, type PoiPlaceScope } from '@/lib/poi/entity-scope';

export interface TourScope {
  readonly kind: 'community' | 'city';
  readonly entityTable: 'communities' | 'cities';
  /** The owning FK on every per-kind table below. */
  readonly idColumn: 'community_id' | 'city_id';
  readonly runsTable: 'community_tour_runs' | 'city_tour_runs';
  readonly poisTable: 'community_pois' | 'city_pois';
  readonly assembliesTable: 'tour_assemblies' | 'city_tour_assemblies';
  readonly poiScope: PoiPlaceScope;
  /** Log prefix. */
  readonly logPrefix: string;
}

export const COMMUNITY_TOUR: TourScope = {
  kind: 'community',
  entityTable: 'communities',
  idColumn: 'community_id',
  runsTable: 'community_tour_runs',
  poisTable: 'community_pois',
  assembliesTable: 'tour_assemblies',
  poiScope: COMMUNITY_SCOPE,
  logPrefix: '[community-tour]',
};

export const CITY_TOUR: TourScope = {
  kind: 'city',
  entityTable: 'cities',
  idColumn: 'city_id',
  runsTable: 'city_tour_runs',
  poisTable: 'city_pois',
  assembliesTable: 'city_tour_assemblies',
  poiScope: CITY_SCOPE,
  logPrefix: '[city-tour]',
};

// ─── typing the mirrored tables ─────────────────────────────────────────────
//
// supabase-js types a query from ONE table name; over a union
// ('community_pois' | 'city_pois') it keeps only what the two have in common
// by name, which drops the owning FK — the one column every per-kind query
// filters on. The city tables are column-for-column mirrors of the community
// ones (migration 20261114230000) with a different FK, so the community
// table's types stand in for both. These are the only casts; every query
// still sends the scope's real table and column names.

/** The scope's join table, typed as its community mirror. */
export const poisTableOf = (s: TourScope) => s.poisTable as 'community_pois';
/** The scope's runs table, typed as its community mirror. */
export const runsTableOf = (s: TourScope) => s.runsTable as 'community_tour_runs';
/** The scope's assemblies table, typed as its community mirror. */
export const assembliesTableOf = (s: TourScope) => s.assembliesTable as 'tour_assemblies';
/** The scope's owning FK column, typed as its community mirror. */
export const idColumnOf = (s: TourScope) => s.idColumn as 'community_id';
/** `{ <owning FK>: id }` for an insert, typed as its community mirror. */
export const ownerOf = (s: TourScope, id: string) =>
  ({ [s.idColumn]: id }) as { community_id: string };
