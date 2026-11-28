/**
 * What the county page (`app/area/[key].tsx`) works out before it draws
 * (phase412): where the county stands among the metro's, in words, and which
 * of Percho's places lie inside it.
 *
 * The page used to print a 29-row ranking with a figure on every row; the
 * owner, 2026-11-27: 「这个页面全是数字陈列很不好 重新设计一下」. It now draws
 * the standing as a dot on a track and says it once.
 */
import type { AreaShape } from "./areas-dto";
import { countyKeyForPoint } from "./locate";

export interface Standing {
	/** 1 is the best of the lens's direction (lowest cost, highest scores). */
	place: number;
	of: number;
	/** The N of "Top N%", rounded up so the claim is never better than the place. */
	share: number;
	/** Where the dot sits on a track, 0 (last) to 1 (first). */
	position: number;
}

export function standingOf(
	ranked: readonly { area: { key: string } }[],
	key: string,
): Standing | undefined {
	const i = ranked.findIndex((r) => r.area.key === key);
	if (i < 0) return undefined;
	const of = ranked.length;
	return {
		place: i + 1,
		of,
		share: Math.min(100, Math.max(1, Math.ceil(((i + 1) / of) * 100))),
		position: of > 1 ? 1 - i / (of - 1) : 1,
	};
}

/**
 * The standing in words — only in the top half. Below it the dot says where
 * the county sits and the page gives no verdict, the rule the schools letter
 * keeps too (`@percho/shared/school-grade`: nothing below B−).
 */
export function standingWords(
	s: Standing | undefined,
	what: "cost" | "schools",
): string | undefined {
	if (!s || s.share > 50) return undefined;
	return what === "cost"
		? `Top ${s.share}% for low cost`
		: `Top ${s.share}% for test scores`;
}

/** The county outline's bounding box, for the map read of what lies in it. */
export function shapeBox(shape: AreaShape): {
	minLat: number;
	maxLat: number;
	minLng: number;
	maxLng: number;
} {
	const pts = shape.rings.flat();
	const lngs = pts.map((p) => p[0]);
	const lats = pts.map((p) => p[1]);
	return {
		minLat: Math.min(...lats),
		maxLat: Math.max(...lats),
		minLng: Math.min(...lngs),
		maxLng: Math.max(...lngs),
	};
}

/** The items whose point is inside THIS county's outline, not just its box. */
export function insideCounty<T extends { lat?: number; lng?: number }>(
	items: readonly T[],
	shapes: readonly AreaShape[],
	key: string,
): T[] {
	return items.filter(
		(x) =>
			x.lat !== undefined &&
			x.lng !== undefined &&
			countyKeyForPoint(x.lat, x.lng, shapes) === key,
	);
}
