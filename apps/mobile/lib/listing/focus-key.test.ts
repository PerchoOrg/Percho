import { describe, expect, it } from "vitest";
import {
	BARE_FOCUS_KEYS,
	FOCUS_HIGHLIGHT_MS,
	type Focus,
	parseFocus,
	sectionForFocus,
	serialiseFocus,
} from "./focus-key";

describe("parseFocus", () => {
	it("accepts every bare key in the closed §2.1 #2 vocabulary", () => {
		for (const key of BARE_FOCUS_KEYS) {
			expect(parseFocus(key)).toEqual({ kind: key });
		}
	});

	it("parses the namespaced keys with their id", () => {
		expect(parseFocus("poi:abc-123")).toEqual({ kind: "poi", id: "abc-123" });
		expect(parseFocus("school:9")).toEqual({ kind: "school", id: "9" });
	});

	it("keeps colons inside an id instead of truncating at the first one", () => {
		// A uuid never contains a colon but a composite id may, and a lost tail
		// addresses the WRONG entity — silently, which is the dangerous part.
		expect(parseFocus("poi:city:atlanta-ga")).toEqual({
			kind: "poi",
			id: "city:atlanta-ga",
		});
	});

	it("returns null for absent input so the caller opens the default entry", () => {
		expect(parseFocus(undefined)).toBeNull();
		expect(parseFocus(null)).toBeNull();
		expect(parseFocus("")).toBeNull();
		expect(parseFocus("   ")).toBeNull();
	});

	it("REJECTS an unknown key rather than ignoring it", () => {
		expect(parseFocus("kitchen")).toBeNull();
		expect(parseFocus("price ")).toEqual({ kind: "price" }); // trimmed, still valid
		expect(parseFocus("bogus:1")).toBeNull();
	});

	it("rejects a namespaced key with no id", () => {
		expect(parseFocus("poi:")).toBeNull();
		expect(parseFocus("poi:   ")).toBeNull();
		expect(parseFocus(":abc")).toBeNull();
	});
});

describe("serialiseFocus", () => {
	it("round-trips every valid focus", () => {
		const all: Focus[] = [
			...BARE_FOCUS_KEYS.map((kind) => ({ kind }) as Focus),
			{ kind: "poi", id: "abc-123" },
			{ kind: "school", id: "9" },
		];
		for (const focus of all) {
			expect(parseFocus(serialiseFocus(focus))).toEqual(focus);
		}
	});
});

describe("sectionForFocus", () => {
	it("maps every key to a section (many-to-one is intended)", () => {
		expect(sectionForFocus({ kind: "monthly" })).toBe("monthly");
		expect(sectionForFocus({ kind: "market" })).toBe("comps");
		expect(sectionForFocus({ kind: "comps" })).toBe("comps");
		expect(sectionForFocus({ kind: "poi", id: "x" })).toBe("community");
		expect(sectionForFocus({ kind: "school", id: "x" })).toBe("community");
	});
});

describe("FOCUS_HIGHLIGHT_MS", () => {
	it("is the 2s the spec specifies", () => {
		expect(FOCUS_HIGHLIGHT_MS).toBe(2000);
	});
});
