/**
 * The feed's first-visit tutorial (phase416), as data: which steps, in what
 * order, pointing at what. `components/feed/FeedTutorial.tsx` draws it.
 *
 * One step per thing a buyer can DO on a card, in the order they will want
 * them: look around, say yes, say no, find out more, go inside. The last is
 * only for a card that has an inside — a city's communities.
 */

/** What a step points at on the card; `none` for the one about the card itself. */
export type TutorialTarget = "none" | "heart" | "dislike" | "name" | "deck";

export interface TutorialStep {
	target: TutorialTarget;
	title: string;
	body: string;
}

/**
 * @param deckLabel the pill at the card's bottom right ("Communities"), when
 * the card in front has one.
 */
export function tutorialSteps(deckLabel?: string): TutorialStep[] {
	const steps: TutorialStep[] = [
		{
			target: "none",
			title: "Swipe to look around",
			body: "Swipe left for the next place. Swipe right to go back.",
		},
		{
			target: "heart",
			title: "Like a place",
			body: "Tap the heart. It is kept in Saved, and you’ll see more places like it.",
		},
		{
			target: "dislike",
			title: "Not for you?",
			body: "Tap the thumbs-down and it won’t be shown again.",
		},
		{
			target: "name",
			title: "See what it’s like to live there",
			body: "Tap the name for schools, home prices and the commute.",
		},
	];
	if (deckLabel) {
		steps.push({
			target: "deck",
			title: "Go inside",
			body: `${deckLabel} opens what is inside this place.`,
		});
	}
	return steps;
}
