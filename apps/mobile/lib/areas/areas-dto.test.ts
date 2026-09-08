import { describe, expect, it } from "vitest";
import { areasByKey, parseAreasPayload } from "./areas-dto";

/** A payload shaped like the one `/api/mobile/areas` actually returns. */
function payload(over: Record<string, unknown> = {}) {
	return {
		state: "GA",
		shapes: [
			{
				key: "fulton",
				name: "Fulton",
				centre: [-84.5, 33.8],
				rings: [
					[
						[-84.6, 33.7],
						[-84.4, 33.7],
						[-84.4, 33.9],
						[-84.6, 33.9],
						[-84.6, 33.7],
					],
				],
			},
		],
		areas: [
			{
				key: "fulton",
				name: "Fulton",
				kind: "county",
				state: "GA",
				metrics: [
					{
						metric: "electric_monthly_usd",
						value: 157,
						unit: "usd_per_month",
						source: "NREL/OpenEI 2023",
						asOf: "2023-12-31",
						estimated: false,
						supplier: {
							name: "Georgia Power Co",
							share: 0.55,
							unitPrice: 0.14624,
							unitPriceUnit: "usd_per_kwh",
						},
					},
				],
			},
		],
		...over,
	};
}

describe("parseAreasPayload", () => {
	it("reads a well-formed payload", () => {
		const p = parseAreasPayload(payload());
		expect(p.shapes).toHaveLength(1);
		expect(p.areas).toHaveLength(1);
		expect(p.areas[0]?.metrics[0]?.value).toBe(157);
	});

	it("carries the supplier through", () => {
		const p = parseAreasPayload(payload());
		expect(p.areas[0]?.metrics[0]?.supplier).toEqual({
			name: "Georgia Power Co",
			share: 0.55,
			unitPrice: 0.14624,
			unitPriceUnit: "usd_per_kwh",
		});
	});

	it("drops a supplier with no name rather than shipping a blank one", () => {
		const bad = payload();
		// biome-ignore lint/suspicious/noExplicitAny: deliberately malformed input
		(bad.areas[0] as any).metrics[0].supplier = { share: 0.5 };
		expect(
			parseAreasPayload(bad).areas[0]?.metrics[0]?.supplier,
		).toBeUndefined();
	});

	it("keeps the metric when the supplier is malformed", () => {
		// A bad supplier must not cost the buyer the figure itself.
		const bad = payload();
		// biome-ignore lint/suspicious/noExplicitAny: deliberately malformed input
		(bad.areas[0] as any).metrics[0].supplier = "Georgia Power";
		const m = parseAreasPayload(bad).areas[0]?.metrics[0];
		expect(m?.value).toBe(157);
		expect(m?.supplier).toBeUndefined();
	});

	it("survives a payload that is not an object at all", () => {
		for (const junk of [null, undefined, 7, "nope", []]) {
			const p = parseAreasPayload(junk);
			expect(p.shapes).toEqual([]);
			expect(p.areas).toEqual([]);
		}
	});

	it("skips a metric this build does not know", () => {
		const p = parseAreasPayload(
			payload({
				areas: [
					{
						key: "fulton",
						name: "Fulton",
						kind: "county",
						state: "GA",
						metrics: [
							{
								metric: "radon_pci_l",
								value: 2,
								unit: "x",
								source: "s",
								asOf: "2024-01-01",
								estimated: false,
							},
						],
					},
				],
			}),
		);
		expect(p.areas[0]?.metrics).toHaveLength(0);
	});

	it("drops a ring too short to be a polygon", () => {
		// react-native-maps draws a two-point "polygon" as a stray line across
		// the map rather than nothing, so a degenerate ring is worse than none.
		const bad = payload({
			shapes: [
				{
					key: "x",
					name: "X",
					centre: [0, 0],
					rings: [
						[
							[0, 0],
							[1, 1],
						],
					],
				},
			],
		});
		expect(parseAreasPayload(bad).shapes).toHaveLength(0);
	});

	it("keeps a shape whose metrics failed, and vice versa", () => {
		// The two halves are independent: a county we cannot colour should still
		// draw its outline, and one with no shape should still rank in the list.
		const noMetrics = parseAreasPayload(payload({ areas: "broken" }));
		expect(noMetrics.shapes).toHaveLength(1);
		expect(noMetrics.areas).toHaveLength(0);

		const noShapes = parseAreasPayload(payload({ shapes: null }));
		expect(noShapes.shapes).toHaveLength(0);
		expect(noShapes.areas).toHaveLength(1);
	});
});

describe("areasByKey", () => {
	it("indexes areas by their key", () => {
		const { areas } = parseAreasPayload(payload());
		expect(areasByKey(areas).get("fulton")?.name).toBe("Fulton");
	});
});
