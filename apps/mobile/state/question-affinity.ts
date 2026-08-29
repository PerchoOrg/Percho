import type { QuestionTheme } from "@percho/shared/questions";
/**
 * Question affinity — which move-in question THEMES this buyer opens.
 *
 * The one profile signal the questions surface produces
 * (`docs/design/move-in-questions.md` §4): a count per theme, bumped when a
 * question is expanded, read by `rankQuestions` to order the next listing's
 * page. Local and persisted, like `saved` — there is no account to sync to.
 *
 * §9.7 silent learning: nothing here is ever shown to the buyer. Its only
 * echo is ordering.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface QuestionAffinityState {
	opens: Readonly<Partial<Record<QuestionTheme, number>>>;
	bump: (theme: QuestionTheme) => void;
}

export const useQuestionAffinity = create<QuestionAffinityState>()(
	persist(
		(set, get) => ({
			opens: {},
			bump: (theme) =>
				set({
					opens: { ...get().opens, [theme]: (get().opens[theme] ?? 0) + 1 },
				}),
		}),
		{
			name: "percho-v3:question-affinity:v1",
			version: 1,
			storage: createJSONStorage(() => AsyncStorage),
			partialize: (s) =>
				Object.keys(s.opens).length === 0 ? {} : { opens: s.opens },
		},
	),
);
