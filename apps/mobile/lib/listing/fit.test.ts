import { describe, expect, it } from "vitest";
import { type FitInput, compactUsd, deriveFit } from "./fit";

const save = (price: number, sqft?: number, beds?: number) => ({
	price,
	...(sqft !== undefined ? { sqft } : {}),
	...(beds !== undefined ? { beds } : {}),
});

const base: FitInput = {
	price: 470_000,
	sqft: 2853,
	beds: 4,
	city: "Kennesaw",
	saves: [
		save(420_000, 2400, 3),
		save(430_000, 2500, 3),
		save(410_000, 2350, 3),
		save(445_000, 2450, 4),
	],
	seenListingCount: 41,
};

describe("compactUsd", () => {
	it("renders the strip format", () => {
		expect(compactUsd(470_000)).toBe("$470K");
		expect(compactUsd(1_250_000)).toBe("$1.3M");
		expect(compactUsd(40_000)).toBe("$40K");
	});
});

describe("deriveFit — every row carries a real attribution", () => {
	it("derives a price trade-off with an honest count", () => {
		const fit = deriveFit(base);
		expect(fit).not.toBeNull();
		const price = fit?.tradeoffs.find((t) => t.text.includes("above your"));
		expect(price?.why).toBe("4 of your 4 saves are under $470K");
	});

	it("derives a space match against the saves' sqft", () => {
		const fit = deriveFit(base);
		const space = fit?.matches.find((m) => m.text.includes("More space"));
		expect(space?.why).toBe("4 of your 4 saves are under 2,853 sqft");
	});

	it("asks the trade-off question only when both sides are computable", () => {
		const fit = deriveFit(base);
		expect(fit?.question?.axis).toBe("price_vs_space");
		expect(fit?.question?.prompt).toContain("over your usual");
	});

	it("returns null below MIN_SAVES — never a card built on 2 data points", () => {
		expect(deriveFit({ ...base, saves: base.saves.slice(0, 2) })).toBeNull();
	});

	it("returns null when there is no match at all", () => {
		// Expensive AND small vs. the saves: only trade-offs derive.
		const fit = deriveFit({
			...base,
			beds: 3,
			sqft: 1800,
			saves: [
				save(400_000, 2400, 3),
				save(410_000, 2500, 3),
				save(405_000, 2600, 3),
			],
		});
		expect(fit).toBeNull();
	});

	it("uses the city swipe tallies when they clear the floor", () => {
		const fit = deriveFit({
			...base,
			citySignal: { right: 5, left: 1 },
		});
		const city = fit?.matches.find((m) => m.text.includes("Kennesaw"));
		expect(city?.why).toBe("you've swiped right on Kennesaw 5 times");
	});

	it("ignores a city signal below the floor", () => {
		const fit = deriveFit({ ...base, citySignal: { right: 2, left: 0 } });
		expect(fit?.matches.some((m) => m.text.includes("Kennesaw"))).toBe(false);
	});

	it("headline count never reads below the saves count", () => {
		const fit = deriveFit({ ...base, seenListingCount: 0 });
		expect(fit?.seenCount).toBe(4);
	});

	it("a home inside the price band produces neither price row", () => {
		const fit = deriveFit({ ...base, price: 430_000 });
		expect(
			fit?.tradeoffs.some((t) => t.text.includes("above your")),
		).toBeFalsy();
		expect(fit?.matches.some((m) => m.text.includes("under your"))).toBeFalsy();
	});
});
