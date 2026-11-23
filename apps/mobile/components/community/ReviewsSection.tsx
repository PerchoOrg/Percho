/**
 * The reviews at the foot of a community's page and a city's (phase372).
 *
 * Real people, read by a person before they appear, shown without names. With
 * none yet it is a heading and a blank field (owner 2026-11-22: "comment可以加
 * 一个空白填文字的部分"); the field is the door to the review form, not an input
 * of its own — a review needs its four scores and a signed-in writer. With
 * some, the score, the four bars and the reviews come first and the field
 * stays under them, so the way to add one is always there.
 *
 * It was the community page's own until the city page needed the same thing
 * ("最底下还是要有review 部分").
 */
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import type { CommunityReviewsDTO } from "../../lib/community/detail-dto";
import { type ReviewStatus, reviewMonth } from "../../lib/reviews/reviews";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";
import { RatingBars } from "./RatingBars";

export function ReviewsSection({
	reviews,
	myStatus,
	onWrite,
}: {
	reviews: CommunityReviewsDTO | undefined;
	/** The signed-in person's own review, in any status. */
	myStatus: ReviewStatus | null;
	onWrite: () => void;
}) {
	return (
		<View style={styles.block}>
			<Text style={styles.head}>Reviews</Text>
			{reviews && (
				<View style={styles.card}>
					<View style={styles.scoreRow}>
						<Text style={styles.score}>
							{reviews.avgRating.toFixed(1)}
							<Text style={styles.scoreOf}> / 5</Text>
						</Text>
						<Text style={styles.count}>
							{reviews.count} {reviews.count === 1 ? "review" : "reviews"}
						</Text>
					</View>
					<RatingBars dimensionAvgs={reviews.dimensionAvgs} />
					{reviews.items.map((r) => (
						<View key={r.id} style={styles.review}>
							<View style={styles.reviewHead}>
								<Text style={styles.stars}>
									{"★".repeat(r.rating)}
									<Text style={styles.starsOff}>
										{"★".repeat(5 - r.rating)}
									</Text>
								</Text>
								<Text style={styles.meta}>
									A resident · {reviewMonth(r.date)}
								</Text>
							</View>
							<Text style={styles.body}>{r.body}</Text>
							{/* App Store 1.2 (UGC): a way to report, next to every item. */}
							<Pressable
								hitSlop={8}
								accessibilityRole="link"
								onPress={() =>
									Linking.openURL(
										`mailto:hello@percho.co?subject=${encodeURIComponent(`Report review ${r.id}`)}`,
									).catch(() => {})
								}
							>
								<Text style={styles.report}>Report</Text>
							</Pressable>
						</View>
					))}
				</View>
			)}
			<Pressable
				style={({ pressed }) => [styles.field, pressed && styles.fieldPressed]}
				accessibilityRole="button"
				accessibilityLabel={myStatus ? "Edit your review" : "Write a review"}
				onPress={onWrite}
			>
				<Text style={styles.fieldText}>
					{myStatus === "pending"
						? "Your review is waiting to be read. Tap to edit it."
						: myStatus
							? "Edit your review…"
							: "Live here? Tell buyers what it's like…"}
				</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	block: { marginTop: 20, gap: 8 },
	head: { ...textStyles.caption, fontSize: 10.5, color: colors.ink2 },
	card: {
		backgroundColor: colors.surface,
		borderRadius: radii.btn,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: colors.border,
		paddingHorizontal: 14,
	},
	scoreRow: {
		flexDirection: "row",
		alignItems: "baseline",
		justifyContent: "space-between",
		paddingVertical: 13,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: colors.border,
	},
	/** The score, printed like a price rather than like a field. */
	score: {
		...textStyles.title1,
		color: colors.ink,
		fontVariant: ["tabular-nums"],
	},
	scoreOf: { ...textStyles.footnote, color: colors.ink2 },
	count: { ...textStyles.footnote, fontSize: 14, color: colors.ink2 },
	review: {
		paddingVertical: 13,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.border,
		gap: 6,
	},
	reviewHead: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	stars: { fontSize: 14, color: colors.accent, letterSpacing: 1 },
	starsOff: { color: colors.border },
	meta: { ...textStyles.caption, fontSize: 12, color: colors.ink3 },
	body: {
		...textStyles.footnote,
		fontSize: 15,
		color: colors.ink,
		lineHeight: 22,
	},
	report: {
		...textStyles.caption,
		fontSize: 12,
		color: colors.ink3,
		marginTop: 2,
	},
	/** Looks like the review form's own text box, which is where it leads. */
	field: {
		minHeight: 76,
		backgroundColor: colors.surface2,
		borderRadius: radii.btn,
		paddingHorizontal: 14,
		paddingVertical: 12,
	},
	fieldPressed: { opacity: 0.7 },
	fieldText: { ...textStyles.body, color: colors.ink3 },
});
