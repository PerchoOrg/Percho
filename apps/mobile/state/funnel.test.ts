import AsyncStorage from "@react-native-async-storage/async-storage";
import { describe, expect, it } from "vitest";
import { useFunnelStore } from "./funnel";

// 2026-08-15: the funnel collapsed to a single unlocked stage 4, so promotion
// and regression are gone. What remains to prove is the hydration gate.
describe("funnel store — post-collapse", () => {
	it("starts at the single unlocked stage 4", () => {
		expect(useFunnelStore.getState().stage).toBe(4);
	});

	it("flips hydrated only once AsyncStorage has been read back", async () => {
		useFunnelStore.setState({ hydrated: false });
		expect(useFunnelStore.getState().hydrated).toBe(false);
		await useFunnelStore.persist.rehydrate();
		expect(useFunnelStore.getState().hydrated).toBe(true);
	});

	it("ignores a persisted old stage — the stage is pinned at 4", async () => {
		// Clear in-memory state FIRST: setState triggers a persist write, which
		// would clobber the seeded value if we seeded before it.
		useFunnelStore.setState({ hydrated: false });
		await AsyncStorage.setItem(
			"percho-v3:funnel:v1",
			JSON.stringify({ state: { stage: 3 }, version: 0 }),
		);
		await useFunnelStore.persist.rehydrate();
		expect(useFunnelStore.getState().stage).toBe(4);
		expect(useFunnelStore.getState().hydrated).toBe(true);
	});
});
