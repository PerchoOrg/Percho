import { describe, expect, it } from "vitest";
import {
	ESSENTIAL_ROWS,
	MIN_HIDDEN_TO_EXPAND,
	listJoin,
	splitRows,
	usd,
} from "./take";

const rows = (n: number) => Array.from({ length: n }, (_, i) => `row${i}`);

describe("splitRows", () => {
	it("shows everything, with no toggle, when there is little to hide", () => {
		// The trap this exists to close: truncating at ESSENTIAL_ROWS while only
		// offering a toggle for MIN_HIDDEN_TO_EXPAND+ hidden rows would strand
		// the last row of a 5-row table with no way to reach it.
		const n = ESSENTIAL_ROWS + MIN_HIDDEN_TO_EXPAND - 1;
		const { shown, collapsible } = splitRows(rows(n), false);
		expect(collapsible).toBe(false);
		expect(shown).toHaveLength(n);
	});

	it("collapses and offers a toggle once enough rows would be hidden", () => {
		const n = ESSENTIAL_ROWS + MIN_HIDDEN_TO_EXPAND;
		const { shown, collapsible } = splitRows(rows(n), false);
		expect(collapsible).toBe(true);
		expect(shown).toHaveLength(ESSENTIAL_ROWS);
	});

	it("hands back every row once expanded", () => {
		const n = ESSENTIAL_ROWS + MIN_HIDDEN_TO_EXPAND;
		expect(splitRows(rows(n), true).shown).toHaveLength(n);
	});

	it("keeps the caller's order — truncation never reorders", () => {
		const { shown } = splitRows(rows(10), false);
		expect(shown).toEqual(rows(10).slice(0, ESSENTIAL_ROWS));
	});

	it("copes with an empty table", () => {
		expect(splitRows([], false)).toEqual({ shown: [], collapsible: false });
	});
});

describe("listJoin", () => {
	it("reads as prose, not as a list", () => {
		expect(listJoin([])).toBe("");
		expect(listJoin(["a"])).toBe("a");
		expect(listJoin(["a", "b"])).toBe("a and b");
		expect(listJoin(["a", "b", "c"])).toBe("a, b and c");
	});
});

describe("usd", () => {
	it("rounds to whole dollars and groups thousands", () => {
		expect(usd(3911.6)).toBe("$3,912");
		expect(usd(0)).toBe("$0");
	});
});
