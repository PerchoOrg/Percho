import { describe, expect, it, vi } from "vitest";
import { createLaunchFlag } from "./launch-ready";

describe("launch flag", () => {
	it("starts false and goes true once", () => {
		const flag = createLaunchFlag();
		expect(flag.get()).toBe(false);
		flag.mark();
		expect(flag.get()).toBe(true);
	});

	it("tells each listener exactly once, however many callers mark it", () => {
		const flag = createLaunchFlag();
		const a = vi.fn();
		const b = vi.fn();
		flag.subscribe(a);
		flag.subscribe(b);
		flag.mark(); // the feed
		flag.mark(); // the gate's timer, later
		expect(a).toHaveBeenCalledTimes(1);
		expect(b).toHaveBeenCalledTimes(1);
	});

	it("stops telling a listener that unsubscribed", () => {
		const flag = createLaunchFlag();
		const a = vi.fn();
		const off = flag.subscribe(a);
		off();
		flag.mark();
		expect(a).not.toHaveBeenCalled();
	});

	it("keeps two flags apart", () => {
		const ready = createLaunchFlag();
		const done = createLaunchFlag();
		ready.mark();
		expect(done.get()).toBe(false);
	});
});
