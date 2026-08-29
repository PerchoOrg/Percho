import AsyncStorage from "@react-native-async-storage/async-storage";
import { describe, expect, it } from "vitest";
import { useQuestionAffinity } from "./question-affinity";

describe("question affinity store", () => {
	it("counts opens per theme", () => {
		useQuestionAffinity.setState({ opens: {} });
		useQuestionAffinity.getState().bump("vibe");
		useQuestionAffinity.getState().bump("vibe");
		useQuestionAffinity.getState().bump("money");
		expect(useQuestionAffinity.getState().opens).toEqual({ vibe: 2, money: 1 });
	});

	it("comes back from storage", async () => {
		useQuestionAffinity.setState({ opens: {} });
		await AsyncStorage.setItem(
			"percho-v3:question-affinity:v1",
			JSON.stringify({ state: { opens: { kids: 3 } }, version: 1 }),
		);
		await useQuestionAffinity.persist.rehydrate();
		expect(useQuestionAffinity.getState().opens).toEqual({ kids: 3 });
	});
});
