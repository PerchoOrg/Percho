import { describe, expect, it } from "vitest";
import { TAP_MAX_DX, TAP_MAX_VX, isTapEnd } from "./tap-slot";

describe("isTapEnd", () => {
	it("fires on a stationary release with a target", () => {
		expect(isTapEnd({ target: "explore" }, { active: true }, 2, 30)).toEqual({
			target: "explore",
			tapped: true,
		});
	});

	it("does not fire when the finger moved past the tap radius", () => {
		expect(
			isTapEnd({ target: "explore" }, { active: true }, TAP_MAX_DX + 1, 30),
		).toEqual({ target: null, tapped: false });
	});

	it("does not fire on a fast flick, even at rest distance", () => {
		expect(
			isTapEnd({ target: "explore" }, { active: true }, 2, TAP_MAX_VX + 1),
		).toEqual({ target: null, tapped: false });
	});

	it("does not fire when the tap gesture never activated", () => {
		expect(isTapEnd({ target: "explore" }, { active: false }, 0, 0)).toEqual({
			target: null,
			tapped: false,
		});
	});

	it("does not fire with no target", () => {
		expect(isTapEnd({ target: null }, { active: true }, 0, 0)).toEqual({
			target: null,
			tapped: false,
		});
	});

	it("does not fire on a missing slot", () => {
		expect(isTapEnd(undefined, { active: true }, 0, 0)).toEqual({
			target: null,
			tapped: false,
		});
	});
});
