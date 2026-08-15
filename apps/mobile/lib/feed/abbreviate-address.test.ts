/**
 * The address-abbreviation transform used by the listing card's address row
 * (2026-08-13 redesign: Court → Ct, Northwest → NW). Small, but it is a
 * string transform with word-boundary edge cases, so it gets one check.
 */
import { describe, expect, it } from "vitest";
import { abbreviateAddress } from "./abbreviate-address";

describe("abbreviateAddress", () => {
	it("abbreviates the known suffixes in place", () => {
		expect(abbreviateAddress("355 Morgans Creek Court")).toBe(
			"355 Morgans Creek Ct",
		);
		expect(abbreviateAddress("Northwest Highway")).toBe("NW Highway");
		expect(abbreviateAddress("801 Northwest Creek Court")).toBe(
			"801 NW Creek Ct",
		);
	});

	it("does not touch suffixes inside other words", () => {
		expect(abbreviateAddress("Courtyard Place")).toBe("Courtyard Place");
		expect(abbreviateAddress("Northwestern Ave")).toBe("Northwestern Ave");
	});

	it("leaves unknown addresses unchanged", () => {
		expect(abbreviateAddress("12 Lake Shore Drive")).toBe(
			"12 Lake Shore Drive",
		);
	});
});
