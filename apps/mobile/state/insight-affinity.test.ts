import AsyncStorage from "@react-native-async-storage/async-storage";
import { describe, expect, it } from "vitest";
import { useInsightAffinity } from "./insight-affinity";

describe("insight affinity store", () => {
	it("counts focus per theme", () => {
		useInsightAffinity.setState({ focus: {} });
		useInsightAffinity.getState().bump("pets");
		useInsightAffinity.getState().bump("pets");
		useInsightAffinity.getState().bump("money");
		expect(useInsightAffinity.getState().focus).toEqual({ pets: 2, money: 1 });
	});

	it("comes back from storage", async () => {
		useInsightAffinity.setState({ focus: {} });
		await AsyncStorage.setItem(
			"percho-v3:insight-affinity:v1",
			JSON.stringify({ state: { focus: { kids: 3 } }, version: 1 }),
		);
		await useInsightAffinity.persist.rehydrate();
		expect(useInsightAffinity.getState().focus).toEqual({ kids: 3 });
	});
});
