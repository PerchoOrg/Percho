import AsyncStorage from "@react-native-async-storage/async-storage";
import { beforeEach, describe, expect, it } from "vitest";
import { type FunnelStage, useFunnelStore } from "./funnel";

const stage = () => useFunnelStore.getState().stage;
const promoteTo = (target: FunnelStage) =>
	useFunnelStore.getState().promoteTo(target);
const resetTo = (target: FunnelStage) =>
	useFunnelStore.getState().resetTo(target);

beforeEach(() => {
	useFunnelStore.setState({ stage: 0 });
});

// §0.2 invariant: "stage 永不自动回退". promoteTo is the ONLY path the automatic
// rhythm engine may take, so it must be monotonic under every input.
describe("promoteTo — monotonicity (§0.2)", () => {
	it("advances and reports the advance", () => {
		expect(promoteTo(2)).toBe(true);
		expect(stage()).toBe(2);
	});

	it("ignores a lower target and reports no advance", () => {
		promoteTo(3);
		expect(promoteTo(1)).toBe(false);
		expect(stage()).toBe(3);
	});

	it("ignores the current stage — promotion is strictly forward", () => {
		promoteTo(2);
		expect(promoteTo(2)).toBe(false);
		expect(stage()).toBe(2);
	});

	it("never regresses across an arbitrary sequence of promotions", () => {
		const sequence: FunnelStage[] = [1, 0, 3, 2, 4, 1, 0, 4, 3];
		let highWater = 0;
		for (const target of sequence) {
			const advanced = promoteTo(target);
			expect(advanced).toBe(target > highWater);
			highWater = Math.max(highWater, target);
			expect(stage()).toBe(highWater);
		}
		expect(stage()).toBe(4);
	});
});

describe("resetTo — the only sanctioned regression (§0.2)", () => {
	it("moves backward when the user asks explicitly", () => {
		promoteTo(4);
		resetTo(1);
		expect(stage()).toBe(1);
	});
});

describe("hydration gate", () => {
	it("flips to true only once AsyncStorage has been read back", async () => {
		useFunnelStore.setState({ hydrated: false });
		expect(useFunnelStore.getState().hydrated).toBe(false);
		await useFunnelStore.persist.rehydrate();
		expect(useFunnelStore.getState().hydrated).toBe(true);
	});

	it("restores a persisted stage rather than leaving the deck at 0", async () => {
		// Clear in-memory state FIRST: setState triggers a persist write, which
		// would clobber the seeded value if we seeded before it.
		useFunnelStore.setState({ stage: 0, hydrated: false });
		await AsyncStorage.setItem(
			"percho-v3:funnel:v1",
			JSON.stringify({ state: { stage: 3 }, version: 0 }),
		);
		await useFunnelStore.persist.rehydrate();
		expect(useFunnelStore.getState().stage).toBe(3);
		expect(useFunnelStore.getState().hydrated).toBe(true);
	});
});
