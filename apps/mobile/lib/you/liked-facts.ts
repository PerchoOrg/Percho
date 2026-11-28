/**
 * "From the places you liked" (phase418): what the buyer's hearted places have
 * in common, as four plain facts — where they are, what homes there are worth,
 * how the schools grade, how far the highway is.
 *
 * It replaces "From your swipes", ten lifestyle words fed only by trade-off
 * answers, which the build without homes never deals — so the group had
 * nothing to say (owner, 2026-11-28: 「your preference重新设计一下纬度」; the
 * shape is the one he approved on `/demos/card-round4-v1`).
 *
 * Every fact is read off the figures a place's own card already prints
 * (`glance.cells`), so this can never say something the card does not: a range
 * is the lowest and the highest of those printed values, in their own
 * spelling. Nothing is averaged, scored or inferred.
 *
 * Pure: the caller hands over what is saved and the pool it has.
 */
import type { PlaceGlance } from "@percho/shared/glance";

/** A place a fact can be read off: a community, or a city with a film. */
export interface LikedPlace {
	/** The id a save is filed under: a community's id, or `area-<unit id>`. */
	id: string;
	kind: "community" | "area";
	/** The city it is in — its own name, for a city. */
	city: string;
	glance?: PlaceGlance;
}

export interface LikedFacts {
	/** How many liked places these were read from. */
	count: number;
	rows: readonly { label: string; value: string }[];
}

/** How many city names "Where" lists before it counts the rest. */
const WHERE_MAX = 2;

/** School letters, best first — the scale the cards print (none below B−). */
const GRADES = ["A+", "A", "A−", "B+", "B", "B−", "C+", "C", "C−", "D", "F"];

/** "$1.4M" → 1400000, "$640K" → 640000; null for anything else. */
export function dollars(value: string): number | null {
	const m = /^\$([\d.]+)\s*([KM])?$/.exec(value.trim());
	if (!m) return null;
	const n = Number(m[1]);
	if (!Number.isFinite(n)) return null;
	return n * (m[2] === "M" ? 1_000_000 : m[2] === "K" ? 1_000 : 1);
}

/** "16 min" → 16; null for anything else. */
function minutes(value: string): number | null {
	const m = /^(\d+)\s*min$/.exec(value.trim());
	return m ? Number(m[1]) : null;
}

/** The lowest and highest of `items` by `rank`, as the values were printed. */
function span<T>(
	items: readonly T[],
	rank: (item: T) => number,
): { low: T; high: T } | null {
	let low: T | undefined;
	let high: T | undefined;
	for (const item of items) {
		if (low === undefined || rank(item) < rank(low)) low = item;
		if (high === undefined || rank(item) > rank(high)) high = item;
	}
	return low === undefined || high === undefined ? null : { low, high };
}

export function likedFacts(
	savedIds: readonly string[],
	places: readonly LikedPlace[],
): LikedFacts {
	const saved = new Set(savedIds);
	const liked = places.filter((p) => saved.has(p.id));
	const rows: { label: string; value: string }[] = [];

	// Where: the cities, most-liked first, then in the order they were found.
	const tally = new Map<string, number>();
	for (const p of liked) tally.set(p.city, (tally.get(p.city) ?? 0) + 1);
	const cities = [...tally.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([city]) => city);
	if (cities.length > 0) {
		const more = cities.length - WHERE_MAX;
		rows.push({
			label: "Where",
			value:
				cities.slice(0, WHERE_MAX).join(" · ") + (more > 0 ? ` +${more}` : ""),
		});
	}

	const cells = liked.flatMap((p) =>
		(p.glance?.cells ?? []).map((cell) => ({ ...cell, kind: p.kind })),
	);

	// Home value: whichever of a card's figures is a dollar amount.
	const prices = cells.filter((c) => dollars(c.value) !== null);
	const price = span(prices, (c) => dollars(c.value) ?? 0);
	if (price) {
		rows.push({
			label: "Home value",
			value:
				price.low.value === price.high.value
					? price.low.value
					: `${price.low.value} – ${price.high.value}`,
		});
	}

	// Schools: the letters, from the lowest liked to the highest.
	const grades = cells.filter(
		(c) => c.topic === "schools" && GRADES.includes(c.value),
	);
	// Ranked so that a better letter is "higher".
	const grade = span(grades, (c) => -GRADES.indexOf(c.value));
	if (grade) {
		rows.push({
			label: "Schools",
			value:
				grade.low.value === grade.high.value
					? grade.low.value
					: `${grade.low.value} to ${grade.high.value}`,
		});
	}

	// To the highway: a community's own figure ("6 min · to I-85"). A city's
	// drive figure is to downtown — a different trip, and not mixed in.
	const drives = cells.filter(
		(c) =>
			c.kind === "community" &&
			c.label.startsWith("to ") &&
			minutes(c.value) !== null,
	);
	const drive = span(drives, (c) => minutes(c.value) ?? 0);
	if (drive) {
		const low = minutes(drive.low.value);
		const high = minutes(drive.high.value);
		rows.push({
			label: "To the highway",
			value: low === high ? `${low} min` : `${low} – ${high} min`,
		});
	}

	return { count: liked.length, rows };
}
