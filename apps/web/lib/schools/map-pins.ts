/**
 * Every K-12 school as a point, for the Search tab's school layer.
 *
 * The owner's ask (2026-09-10): "School should be the top one, show school
 * icons on map and their coverage area." This is the icons half. The coverage
 * half — attendance zones — is NOT here, and the reason is that we do not have
 * the polygons: `attendance_zones` was created by the phase60 migration and has
 * never been seeded, which is also why the listing page says "nearest, not
 * assignment". Drawing a district boundary and calling it a coverage area
 * would answer a different question than the one asked, and it is the question
 * a buyer would act on.
 *
 * ── Why the whole state, unfiltered ────────────────────────────────────────
 *
 * Same shape as `/api/mobile/areas`: no query parameters, fetched once, held
 * for the life of the screen. 2270 schools is ~120 KB of JSON, which is one
 * photograph, and the alternative — a viewport query per pan — puts a network
 * round trip inside a gesture. The client decides what to DRAW from the
 * region it is showing; that is a rendering decision and it belongs on the
 * phone, where the region already lives.
 *
 * ── What a pin carries, and what it does not ───────────────────────────────
 *
 * `proficiencyPct` is the state's own GA Milestones figure, parsed by the same
 * function the listing page uses. It is optional and often absent: a school
 * with too few tested students has its cell suppressed by GOSA, and a school
 * that opened last year has no scores at all. An absent score renders as a
 * grey pin, never as a zero — the whole point of the lens map's `estimated`
 * discipline is that we do not fill a hole with a number.
 *
 * There is deliberately no composite rating. GA does not publish CCRPI as a
 * flat file and inventing a 1-10 score is what the trust pitch says we don't
 * do — see `scripts/admin/import-ga-schools.ts`.
 */

import { milestones } from '@/lib/listings/schools';
import type { Database, Json } from '@/lib/supabase/database.types';
import { createClient as createPlainClient } from '@supabase/supabase-js';

/** The three levels the map draws. `k8` and `other` are stored but not shown:
 *  the layer's zoom rule is built on the elementary/middle/high ladder, and a
 *  K-8 school has no single rung. */
export type SchoolPinLevel = 'elementary' | 'middle' | 'high';

export interface SchoolPin {
  id: string;
  name: string;
  level: SchoolPinLevel;
  lat: number;
  lng: number;
  district?: string;
  /** % Proficient or above on GA Milestones. Absent when GOSA suppressed or
   *  never published one — render that as unknown, not as low. */
  proficiencyPct?: number;
}

export interface SchoolPinsDTO {
  state: string;
  schools: SchoolPin[];
  /** ISO instant the rows were read. Makes a stale cache obvious in a report. */
  fetchedAt: string;
}

/** Exactly the columns `fetchSchoolPins` selects, so adding one to the query
 *  without widening this fails to compile. */
type SelectedColumn = 'id' | 'name' | 'level' | 'lat' | 'lng' | 'district' | 'test_scores';

export type SchoolRow = Pick<Database['public']['Tables']['k12_schools']['Row'], SelectedColumn>;

function isLevel(v: string | null): v is SchoolPinLevel {
  return v === 'elementary' || v === 'middle' || v === 'high';
}

/**
 * Rows to pins, dropping anything the map cannot honestly draw.
 *
 * A row is skipped when it has no coordinate (the CCD directory carries
 * schools the EDGE geocode file never matched), or a level outside the ladder.
 * A row with no proficiency is KEPT — an unrated school is still a school a
 * buyer can see on the map, and hiding it would redraw a neighbourhood as
 * emptier than it is. Same rule as `fetchAreas` keeping a county with no
 * metrics.
 */
export function projectSchoolPins(rows: readonly SchoolRow[]): SchoolPin[] {
  const out: SchoolPin[] = [];
  for (const r of rows) {
    if (!isLevel(r.level)) continue;
    if (typeof r.lat !== 'number' || typeof r.lng !== 'number') continue;
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) continue;
    if (!r.name) continue;
    const m = milestones((r.test_scores ?? null) as Json);
    out.push({
      id: r.id,
      name: r.name,
      level: r.level,
      lat: r.lat,
      lng: r.lng,
      ...(r.district ? { district: r.district } : {}),
      ...(m ? { proficiencyPct: Math.round(m.pct) } : {}),
    });
  }
  return out;
}

function createUncachedAnonClient() {
  // Same fetch-cache opt-out as `lib/areas/areas.ts` — see the note there.
  return createPlainClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: 'no-store' }),
      },
    },
  );
}

/**
 * Rows per request, and the ceiling on how many we will ask for.
 *
 * This instance's PostgREST enforces a 1000-row cap SERVER-SIDE, and a
 * `.range(0, 4999)` does not lift it — it silently returns the first thousand.
 * Measured on 2026-09-11: the first deploy of this endpoint returned 970 pins
 * out of ~2270 schools, and the missing ones were not a random sample. Cobb,
 * DeKalb, Clayton and Atlanta Public Schools came back complete while Gwinnett
 * had 14 schools, Fulton 4 and Forsyth none at all — which is to say the map
 * lost precisely the districts a buyer moves to Atlanta FOR, and lost them
 * silently, with every remaining pin looking perfectly correct.
 *
 * So the read is paged. `.order('id')` is not decoration: without a stable
 * sort PostgREST makes no promise about row order between requests, and pages
 * taken from an unordered result can both repeat and skip.
 */
const PAGE_ROWS = 1000;
const MAX_ROWS = 10000;

export async function fetchSchoolPins(): Promise<SchoolPinsDTO> {
  const supabase = createUncachedAnonClient();
  const rows: SchoolRow[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_ROWS) {
    const { data, error } = await supabase
      .from('k12_schools')
      .select('id,name,level,lat,lng,district,test_scores')
      .eq('state', 'GA')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .order('id')
      .range(from, from + PAGE_ROWS - 1);
    if (error) throw new Error(`k12_schools: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    // A short page is the last page. Without this the loop always costs ten
    // round trips to learn what the second one already said.
    if (data.length < PAGE_ROWS) break;
  }
  return {
    state: 'GA',
    schools: projectSchoolPins(rows),
    fetchedAt: new Date().toISOString(),
  };
}
