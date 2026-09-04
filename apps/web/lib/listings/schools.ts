/**
 * Nearest public schools for a coordinate — the listing page's schools block
 * (phase D). One RPC, `get_k12_nearest_schools`, seeded statewide by
 * `scripts/admin/import-ga-schools.ts` from NCES + GA Milestones.
 *
 * Honesty rules the projection enforces:
 *   - `assigned` is the RPC's zone match. Attendance zones are not seeded,
 *     so it is false today and the app says "nearest, not assignment".
 *   - `proficiencyPct` is the state's own proficient-or-above figure, or
 *     absent. No composite rating is derived here or anywhere.
 */
import type { Json } from '@/lib/supabase/database.types';

export type SchoolLevel = 'elementary' | 'middle' | 'high';

export interface SchoolDTO {
  level: SchoolLevel;
  name: string;
  district?: string;
  /** "PK-5", "6-8", "9-12". */
  grades?: string;
  distanceKm: number;
  assigned: boolean;
  /** % of tested students Proficient or Distinguished on GA Milestones. */
  proficiencyPct?: number;
  /** School year of `proficiencyPct`, e.g. "2024-25". */
  testYear?: string;
  enrollment?: number;
}

/** The RPC row, as generated. Kept structural so tests need no client. */
export interface NearestSchoolRow {
  level: string;
  name: string;
  district: string | null;
  grade_range: string | null;
  distance_km: number;
  in_zone: boolean;
  test_scores: Json;
  enrollment: number | null;
}

function milestones(scores: Json): { pct: number; year: string } | undefined {
  if (typeof scores !== 'object' || scores === null || Array.isArray(scores)) return undefined;
  const m = (scores as Record<string, Json | undefined>).ga_milestones;
  if (typeof m !== 'object' || m === null || Array.isArray(m)) return undefined;
  const pct = (m as Record<string, Json | undefined>).proficientPct;
  const year = (m as Record<string, Json | undefined>).year;
  if (typeof pct !== 'number' || !(pct >= 0) || typeof year !== 'string') return undefined;
  return { pct, year };
}

export function projectSchools(rows: NearestSchoolRow[]): SchoolDTO[] {
  const out: SchoolDTO[] = [];
  for (const r of rows) {
    if (r.level !== 'elementary' && r.level !== 'middle' && r.level !== 'high') continue;
    if (!r.name || !(r.distance_km >= 0)) continue;
    const m = milestones(r.test_scores);
    out.push({
      level: r.level,
      name: r.name,
      ...(r.district ? { district: r.district } : {}),
      ...(r.grade_range ? { grades: r.grade_range } : {}),
      distanceKm: Number(r.distance_km),
      assigned: r.in_zone === true,
      ...(m ? { proficiencyPct: m.pct, testYear: m.year } : {}),
      ...(r.enrollment != null && r.enrollment > 0 ? { enrollment: r.enrollment } : {}),
    });
  }
  return out;
}
