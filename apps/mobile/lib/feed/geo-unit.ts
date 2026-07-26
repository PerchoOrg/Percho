/**
 * Geo-unit contract (PLAN-task-1 §3) — the shape the funnel narrows through:
 * area → city → zip. One type for all three granularities so the pool can
 * deepen without an engine change.
 *
 * HARD RULE: a stat that has no real source is ABSENT from `GeoStats`, not
 * present-and-zero and not present-and-null. A card renders the rows it has;
 * a thin unit shows a short face. There is no "—", no "N/A", no placeholder.
 * `schoolRating` / `commuteMinutes` / `priceTrend` / `inventoryTrend` /
 * `hoaBand` are deliberately NOT declared here — declaring them as optional is
 * the first step toward faking them.
 *
 * Pure: no react/react-native/expo/zustand imports anywhere in lib/feed.
 */

export type GeoLevel = "area" | "city" | "zip";

/** Coarse → fine. Index is the narrowing depth. */
export const GEO_LEVELS: readonly GeoLevel[] = ["area", "city", "zip"] as const;

export interface GeoStats {
	/** Median list price of active listings in the unit. */
	medianListPrice?: { value: number; sampleSize: number };
	activeListings?: number;
}

/** Real `communities.boundary` GeoJSON ring, already projected to a unit box. */
export interface GeoBoundary {
	/** Points in a 0–1 unit square, y down — ready for an SVG path. */
	points: readonly { x: number; y: number }[];
}

export interface GeoUnit {
	/** Stable, level-prefixed: "city:decatur-ga". */
	id: string;
	level: GeoLevel;
	name: string;
	state: string;
	/** zip → city → area. Absent until a parent level has inventory. */
	parentId?: string;
	centroid: { lat: number; lng: number };
	heroUrl?: string;
	videoUrl?: string;
	communityCount: number;
	/** ≤3 real `communities.name`. */
	sampleCommunityNames: readonly string[];
	stats: GeoStats;
	boundary?: GeoBoundary;
}

/**
 * The deepest level the pool can actually fill (PLAN §3, owner-approved).
 *
 * Stage 2 asks for zip units. `communities.zip` is 100% NULL today, so a
 * literal reading of §1.7 would emit an empty zip stage, no zip could ever be
 * right-swiped, the 2→3 gate would never open and the funnel would stall one
 * step short of Stage 3 — the best-populated stage. So the engine narrows to
 * the finest level with inventory instead of a hardcoded one.
 *
 * When the zip backfill lands the pool simply deepens and nothing here changes;
 * `finest-available-level.test.ts` pins both readings to prove it.
 */
export function finestAvailableLevel(
	units: readonly GeoUnit[],
): GeoLevel | null {
	for (let i = GEO_LEVELS.length - 1; i >= 0; i--) {
		const level = GEO_LEVELS[i];
		if (level && units.some((u) => u.level === level)) return level;
	}
	return null;
}

export function unitsAtLevel(
	units: readonly GeoUnit[],
	level: GeoLevel,
): GeoUnit[] {
	return units.filter((u) => u.level === level);
}
