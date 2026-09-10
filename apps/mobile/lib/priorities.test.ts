import { DEFAULT_LENS, LENSES } from "@percho/shared/lenses";
import { describe, expect, it } from "vitest";
import {
	MAX_WEIGHT,
	PRIORITIES,
	type PriorityKey,
	WEIGHT_LABELS,
	defaultWeights,
	hasStated,
	lensForPriorities,
	normalizeWeights,
	orderByPriority,
	rankedPriorities,
	topStatedPriority,
} from "./priorities";

describe("the catalogue", () => {
	it("has a label for every weight step", () => {
		expect(WEIGHT_LABELS).toHaveLength(MAX_WEIGHT + 1);
	});

	it("covers the dimensions the study's answers clustered into", () => {
		expect(PRIORITIES.map((p) => p.key)).toEqual([
			"schools",
			"cost",
			"commute",
			"community",
		]);
	});

	it("leads with schools — what buyers said they look up first", () => {
		expect(PRIORITIES[0]?.key).toBe("schools");
	});
});

describe("defaultWeights", () => {
	it("starts neutral, not at zero", () => {
		// Zeroes would mean the app opens believing the buyer cares about
		// nothing, so their first tap would read as a change of mind.
		const w = defaultWeights();
		expect(Object.values(w).every((v) => v === 1)).toBe(true);
	});

	it("is a fresh object each call, so one buyer cannot mutate the default", () => {
		const a = defaultWeights();
		a.schools = 3;
		expect(defaultWeights().schools).toBe(1);
	});
});

describe("normalizeWeights", () => {
	it("keeps a valid set", () => {
		const w = { schools: 3, cost: 2, commute: 0, community: 1 };
		expect(normalizeWeights(w)).toEqual(w);
	});

	it("falls back to neutral for junk", () => {
		for (const junk of [null, undefined, 7, "nope", []]) {
			expect(normalizeWeights(junk)).toEqual(defaultWeights());
		}
	});

	it("clamps out-of-range values instead of trusting stored data", () => {
		const w = normalizeWeights({ schools: 99, cost: -4, commute: 1.6 });
		expect(w.schools).toBe(MAX_WEIGHT);
		expect(w.cost).toBe(0);
		expect(w.commute).toBe(2);
	});

	it("drops a key we no longer recognise and fills a missing one", () => {
		const w = normalizeWeights({ schools: 3, pets: 3 });
		expect(w).toEqual({ schools: 3, cost: 1, commute: 1, community: 1 });
		expect(w).not.toHaveProperty("pets");
	});

	it("ignores a non-numeric weight rather than coercing it", () => {
		expect(normalizeWeights({ schools: "3" }).schools).toBe(1);
	});
});

describe("hasStated", () => {
	it("is false until something moves off neutral", () => {
		expect(hasStated(defaultWeights())).toBe(false);
		expect(hasStated({ ...defaultWeights(), cost: 3 })).toBe(true);
		// Moving DOWN is a statement too.
		expect(hasStated({ ...defaultWeights(), commute: 0 })).toBe(true);
	});
});

describe("rankedPriorities", () => {
	it("puts the heaviest first", () => {
		const w = { schools: 1, cost: 3, commute: 0, community: 2 };
		expect(rankedPriorities(w).map((p) => p.key)).toEqual([
			"cost",
			"community",
			"schools",
			"commute",
		]);
	});

	it("falls back to the study's own order when nothing is stated", () => {
		expect(rankedPriorities(defaultWeights()).map((p) => p.key)).toEqual(
			PRIORITIES.map((p) => p.key),
		);
	});
});

describe("orderByPriority", () => {
	const rows = [
		{ label: "cost row", key: "cost" as const },
		{ label: "schools row", key: "schools" as const },
		{ label: "other row", key: undefined },
	];
	const pick = (r: (typeof rows)[number]) => r.key;

	it("leads with the row serving the heaviest priority", () => {
		const w = { ...defaultWeights(), schools: 3 };
		expect(orderByPriority(rows, w, pick)[0]?.label).toBe("schools row");
	});

	it("keeps an unattributed row in the pack rather than sinking it", () => {
		// It weighs as neutral, so it outranks a priority the buyer set to 0.
		const w = { ...defaultWeights(), cost: 0 };
		expect(orderByPriority(rows, w, pick).map((r) => r.label)).toEqual([
			"schools row",
			"other row",
			"cost row",
		]);
	});

	it("is stable: equal weights preserve the caller's order", () => {
		expect(orderByPriority(rows, defaultWeights(), pick)).toEqual(rows);
	});

	it("never drops or duplicates a row", () => {
		const out = orderByPriority(rows, { ...defaultWeights(), cost: 3 }, pick);
		expect(out).toHaveLength(rows.length);
		expect(new Set(out.map((r) => r.label)).size).toBe(rows.length);
	});
});

describe("lensForPriorities", () => {
	const w = (o: Partial<Record<PriorityKey, number>>) => ({
		...defaultWeights(),
		...o,
	});

	it("opens the map on the lens for what the buyer ranked highest", () => {
		expect(lensForPriorities(w({ schools: 3 }))).toBe("schools");
		expect(lensForPriorities(w({ cost: 3 }))).toBe("true_cost");
	});

	it("falls to the next priority we can actually draw", () => {
		// There is no commute lens and no community lens. Rather than pretend,
		// a buyer who ranks commute first and schools second opens on schools —
		// the closest honest answer to what they asked for.
		expect(lensForPriorities(w({ commute: 3, schools: 2 }))).toBe("schools");
		expect(lensForPriorities(w({ community: 3, cost: 2 }))).toBe("true_cost");
	});

	it("uses the default when nothing they RAISED can be drawn", () => {
		// The buyer lifted commute and community and left schools at neutral.
		// Walking on to schools would be us answering a question they did not.
		expect(lensForPriorities(w({ commute: 3, community: 3 }))).toBe(
			DEFAULT_LENS,
		);
	});

	it("does not treat a lowered priority as a preference for its lens", () => {
		// Dropping cost to 0 says what they do not want, not what they do.
		expect(lensForPriorities(w({ cost: 0 }))).toBe(DEFAULT_LENS);
	});

	it("uses the default when the buyer has said nothing", () => {
		// Every weight at 1 is not a statement, and opening on a schools map
		// would put words in their mouth.
		expect(lensForPriorities(defaultWeights())).toBe(DEFAULT_LENS);
	});

	it("only ever returns a lens that ships", () => {
		// A key that does not exist in the catalogue renders an empty map with
		// no chip selected, and nothing else would catch it.
		const ids = new Set(LENSES.map((l) => l.id));
		for (const key of PRIORITIES.map((p) => p.key)) {
			expect(ids.has(lensForPriorities(w({ [key]: 3 })))).toBe(true);
		}
	});
});

describe("topStatedPriority", () => {
	it("is undefined until the buyer moves something off neutral", () => {
		expect(topStatedPriority(defaultWeights())).toBeUndefined();
	});

	it("names the one thing they raised", () => {
		expect(
			topStatedPriority({ schools: 3, cost: 1, commute: 1, community: 1 }),
		).toBe("schools");
	});

	it("is undefined when two are tied at the top", () => {
		// A tie is not a statement about which of the two, and the tie-break in
		// `rankedPriorities` is OUR order — quoting it back as theirs would be
		// putting words in their mouth.
		expect(
			topStatedPriority({ schools: 3, cost: 3, commute: 1, community: 1 }),
		).toBeUndefined();
	});

	it("is undefined when they only lowered things, never raised one", () => {
		// Everything at or below neutral: they have said what they do NOT care
		// about, which is not the same as naming a favourite.
		expect(
			topStatedPriority({ schools: 1, cost: 0, commute: 0, community: 0 }),
		).toBeUndefined();
	});
});
