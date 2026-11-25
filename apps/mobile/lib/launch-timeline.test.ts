import { describe, expect, it } from "vitest";
import {
	LAUNCH_MAX_MS,
	LAUNCH_STILL_MS,
	LAUNCH_TIMELINE as T,
} from "./launch-timeline";

describe("launch timeline", () => {
	it("draws in order: roof, then the outline, then colour, then the eye", () => {
		expect(T.outline.start).toBeGreaterThanOrEqual(T.roof.start);
		expect(T.fill.start).toBeGreaterThan(T.outline.start);
		expect(T.eye.start).toBeGreaterThan(T.fill.start);
	});

	it("finishes every part before the drawing is called done", () => {
		for (const part of [T.roof, T.outline, T.fill, T.eye]) {
			expect(part.start + part.duration).toBeLessThanOrEqual(T.end);
		}
	});

	it("leaves room under the ceiling for the drawing and its fade", () => {
		expect(T.end + T.fadeOut).toBeLessThan(LAUNCH_MAX_MS);
		expect(LAUNCH_STILL_MS).toBeLessThan(T.end);
	});
});
