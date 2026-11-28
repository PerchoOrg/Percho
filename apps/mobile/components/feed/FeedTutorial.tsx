/**
 * The feed's first-visit tutorial (phase416; owner, 2026-11-28: 「第一次使用
 * 应该给一套教程」): a few steps over the first card, each one lighting the
 * control it is about.
 *
 * The steps are data (`lib/feed/tutorial.ts`). This file only knows where on
 * the card each control is — which it reads from the same constants the card
 * draws them with — and draws a dark page with a lit window over it.
 *
 * The window is four dark views AROUND a hole rather than one view with a
 * hole in it: nothing here needs `react-native-svg` or a mask, and the control
 * under the window is shown as the card really draws it.
 *
 * The whole page takes touches while it is up, the window included, so the
 * deck underneath cannot be swiped and the control in the window cannot be
 * pressed by a finger that was aiming at "Next".
 */
import { useState } from "react";
import {
	type LayoutChangeEvent,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { type TutorialTarget, tutorialSteps } from "../../lib/feed/tutorial";
import { colors } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";
import { CORNER_DISC, CORNER_GAP, CORNER_INSET } from "../cards/CardCorner";

/** A box on the page, in the tutorial's own coordinates. */
export interface TutorialBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface FeedTutorialProps {
	/** The card in front, in the coordinates of the view this fills. */
	card: TutorialBox;
	/** The pill at the card's bottom right, when it has one. */
	deckLabel?: string;
	/** The last step's button, or Skip. */
	onDone: () => void;
}

/** Air between a control and the window's edge. */
const WINDOW_PAD = 8;
/** The card's bottom row: its inset from the card's edges, and its height. */
const INFO_INSET = 24;
const INFO_ROW = 36;
/** Caption → window. */
const CAPTION_GAP = 18;
const SCRIM = "rgba(14,13,11,0.78)";

/** Where a step's control is on the card. */
function windowFor(
	target: TutorialTarget,
	card: TutorialBox,
): TutorialBox | null {
	const disc = (fromRight: number): TutorialBox => ({
		x:
			card.x +
			card.width -
			CORNER_INSET -
			CORNER_DISC -
			fromRight * (CORNER_DISC + CORNER_GAP) -
			WINDOW_PAD,
		y: card.y + CORNER_INSET - WINDOW_PAD,
		width: CORNER_DISC + WINDOW_PAD * 2,
		height: CORNER_DISC + WINDOW_PAD * 2,
	});
	const row = {
		y: card.y + card.height - INFO_INSET - INFO_ROW - WINDOW_PAD,
		height: INFO_ROW + WINDOW_PAD * 2,
	};
	switch (target) {
		case "none":
			return null;
		// The row reads mute, share, thumbs-down, heart: the heart is last.
		case "heart":
			return disc(0);
		case "dislike":
			return disc(1);
		case "name":
			return {
				...row,
				x: card.x + INFO_INSET - WINDOW_PAD,
				width: Math.round(card.width * 0.56),
			};
		case "deck": {
			const width = Math.round(card.width * 0.42);
			return {
				...row,
				x: card.x + card.width - INFO_INSET + WINDOW_PAD - width,
				width,
			};
		}
	}
}

export function FeedTutorial({ card, deckLabel, onDone }: FeedTutorialProps) {
	const steps = tutorialSteps(deckLabel);
	const [index, setIndex] = useState(0);
	const [page, setPage] = useState({ width: 0, height: 0 });
	const onLayout = (e: LayoutChangeEvent) => {
		const { width, height } = e.nativeEvent.layout;
		setPage({ width, height });
	};

	const step = steps[Math.min(index, steps.length - 1)];
	if (!step) return null;
	const last = index >= steps.length - 1;
	const hole = windowFor(step.target, card);
	// The caption goes on whichever side of the window has the room.
	const captionBelow =
		hole !== null && hole.y + hole.height / 2 < page.height / 2;

	return (
		<View
			style={styles.root}
			onLayout={onLayout}
			// Every touch on the page is the tutorial's while it is up.
			onStartShouldSetResponder={() => true}
			accessibilityViewIsModal
		>
			{hole === null ? (
				<View style={[StyleSheet.absoluteFill, styles.scrim]} />
			) : (
				<>
					<View
						style={[
							styles.scrim,
							styles.piece,
							{ left: 0, right: 0, top: 0, height: Math.max(0, hole.y) },
						]}
					/>
					<View
						style={[
							styles.scrim,
							styles.piece,
							{ left: 0, right: 0, top: hole.y + hole.height, bottom: 0 },
						]}
					/>
					<View
						style={[
							styles.scrim,
							styles.piece,
							{
								left: 0,
								top: hole.y,
								width: Math.max(0, hole.x),
								height: hole.height,
							},
						]}
					/>
					<View
						style={[
							styles.scrim,
							styles.piece,
							{
								left: hole.x + hole.width,
								right: 0,
								top: hole.y,
								height: hole.height,
							},
						]}
					/>
					<View
						pointerEvents="none"
						style={[
							styles.ring,
							{
								left: hole.x,
								top: hole.y,
								width: hole.width,
								height: hole.height,
							},
						]}
					/>
				</>
			)}

			<Pressable
				onPress={onDone}
				hitSlop={14}
				accessibilityRole="button"
				accessibilityLabel="Skip the tutorial"
				style={styles.skip}
			>
				<Text style={styles.skipText}>Skip</Text>
			</Pressable>

			<View
				style={[
					styles.caption,
					hole === null
						? styles.captionMiddle
						: captionBelow
							? { top: hole.y + hole.height + CAPTION_GAP }
							: { bottom: page.height - hole.y + CAPTION_GAP },
				]}
			>
				{step.target === "none" && (
					<Text style={styles.arrows} accessibilityElementsHidden>
						←　　→
					</Text>
				)}
				<Text style={styles.title}>{step.title}</Text>
				<Text style={styles.body}>{step.body}</Text>
				<View style={styles.foot}>
					<View style={styles.dots}>
						{steps.map((s, i) => (
							<View
								key={s.target}
								style={[styles.dot, i === index && styles.dotOn]}
							/>
						))}
					</View>
					<Pressable
						onPress={() => (last ? onDone() : setIndex(index + 1))}
						accessibilityRole="button"
						style={({ pressed }) => [styles.next, pressed && styles.pressed]}
					>
						<Text style={styles.nextText}>
							{last ? "Start exploring" : "Next"}
						</Text>
					</Pressable>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	root: { ...StyleSheet.absoluteFill, zIndex: 200 },
	scrim: { backgroundColor: SCRIM },
	piece: { position: "absolute" },
	/** The window's edge: what makes the lit control read as pointed at. */
	ring: {
		position: "absolute",
		borderRadius: 18,
		borderWidth: 2,
		borderColor: "rgba(255,255,255,0.95)",
	},
	skip: { position: "absolute", top: 10, left: 20 },
	skipText: { ...textStyles.body, color: "rgba(255,255,255,0.86)" },
	caption: { position: "absolute", left: 24, right: 24 },
	captionMiddle: { top: "34%" },
	arrows: {
		fontSize: 40,
		lineHeight: 48,
		color: "#FFFFFF",
		marginBottom: 14,
	},
	title: { ...textStyles.title2, color: "#FFFFFF" },
	body: {
		...textStyles.body,
		fontSize: 17,
		lineHeight: 24,
		color: "rgba(255,255,255,0.92)",
		marginTop: 8,
	},
	foot: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginTop: 22,
	},
	dots: { flexDirection: "row", gap: 6 },
	dot: {
		width: 7,
		height: 7,
		borderRadius: 3.5,
		backgroundColor: "rgba(255,255,255,0.35)",
	},
	dotOn: { backgroundColor: "#FFFFFF" },
	next: {
		height: 44,
		paddingHorizontal: 22,
		borderRadius: 22,
		justifyContent: "center",
		backgroundColor: "#FFFFFF",
	},
	nextText: { ...textStyles.body, fontWeight: "600", color: colors.ink },
	pressed: { opacity: 0.7 },
});
