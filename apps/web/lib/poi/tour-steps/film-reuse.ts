/**
 * Photos already on screen in ANOTHER live film (phase366).
 *
 * Neighbouring communities and their cities share parks and schools, and the
 * shot ranking used to pick the same best frame of a place for every film near
 * it: Sims Lake Park's fountain played in Aberdeen, in Suwanee's city film and
 * in Wild Timber (owner 2026-11-21: "有一个喷泉的素材感觉用了很多次了").
 * `computeFinalShots` ranks these photos below a place's unused ones, so they
 * fill a slot only when the place has nothing else.
 *
 * "Live" = each community's and each city's NEWEST ready assembly; an older
 * cut is not on anyone's screen. The film being planned is left out, so a
 * re-cut keeps its own photos.
 */
import type { TourScope } from './scope';
import type { TourDb } from './shared';

export type AssemblyRow = {
  /** `community:<id>` or `city:<id>`. */
  owner: string;
  created_at: string;
  ordered_clips: unknown;
};

/** Photo ids in the newest assembly of every owner but `self`. PURE. */
export function photoIdsInOtherFilms(rows: AssemblyRow[], self: string | null): Set<string> {
  const newest = new Map<string, AssemblyRow>();
  for (const r of rows) {
    if (r.owner === self) continue;
    const seen = newest.get(r.owner);
    if (!seen || r.created_at > seen.created_at) newest.set(r.owner, r);
  }
  const ids = new Set<string>();
  for (const r of newest.values()) {
    if (!Array.isArray(r.ordered_clips)) continue;
    for (const clip of r.ordered_clips) {
      const id = (clip as { photo_id?: unknown } | null)?.photo_id;
      if (typeof id === 'string') ids.add(id);
    }
  }
  return ids;
}

/** Reads both assembly tables; `owner` is the film being planned. */
export async function loadPhotosInOtherFilms(
  sb: TourDb,
  owner?: { scope: TourScope; id: string },
): Promise<Set<string>> {
  const rows: AssemblyRow[] = [];
  for (const [table, column, kind] of [
    ['tour_assemblies', 'community_id', 'community'],
    ['city_tour_assemblies', 'city_id', 'city'],
  ] as const) {
    // Two tables with different FKs; typed by hand rather than through the
    // generated union, which drops the column each one is keyed on.
    const { data, error } = (await sb
      .from(table)
      .select(`${column}, created_at, ordered_clips`)
      .eq('status', 'ready')) as {
      data: Array<Record<string, unknown>> | null;
      error: { message: string } | null;
    };
    // A failed read degrades to "nothing is used elsewhere" — the old ranking —
    // rather than failing the plan.
    if (error) console.warn('[film-reuse] read failed', { table, error: error.message });
    for (const r of data ?? []) {
      rows.push({
        owner: `${kind}:${String(r[column])}`,
        created_at: String(r.created_at),
        ordered_clips: r.ordered_clips,
      });
    }
  }
  return photoIdsInOtherFilms(rows, owner ? `${owner.scope.kind}:${owner.id}` : null);
}
