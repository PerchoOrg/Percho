/**
 * `/community/review?id=<communityId>&name=<community name>` — write or edit
 * the signed-in user's resident review (phase E).
 *
 * One review per person per community; saving again overwrites it and sends
 * it back through the approval queue (`lib/reviews/reviews.ts`). The screen
 * is only pushed when a session exists — the community page sends a signed-
 * out tap to `/auth` first.
 */
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
	REVIEW_BODY_MAX,
	REVIEW_DIMENSIONS,
	REVIEW_DIMENSION_LABELS,
	type ReviewDimension,
	draftProblem,
	fetchMyReview,
	submitReview,
} from "../../lib/reviews/reviews";
import { useAuthStore } from "../../state/auth";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

const SCORES = [1, 2, 3, 4, 5] as const;

/** Five tappable dots — the same control for the overall rating and each dimension. */
function ScoreRow({
	value,
	onChange,
	label,
}: {
	value: number | undefined;
	onChange: (n: number | undefined) => void;
	label: string;
}) {
	return (
		<View style={styles.scoreRow}>
			<Text style={styles.scoreLabel}>{label}</Text>
			<View style={styles.dots}>
				{SCORES.map((n) => {
					const on = value !== undefined && n <= value;
					return (
						<Pressable
							key={n}
							// Tapping the current score clears it — a dimension is optional.
							onPress={() => onChange(value === n ? undefined : n)}
							hitSlop={6}
							accessibilityRole="button"
							accessibilityLabel={`${label} ${n} of 5`}
							style={[styles.dot, on && styles.dotOn]}
						>
							<Text style={[styles.dotTxt, on && styles.dotTxtOn]}>{n}</Text>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}

export default function ReviewScreen() {
	const insets = useSafeAreaInsets();
	const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
	const uid = useAuthStore((s) => s.session?.user.id);

	const [rating, setRating] = useState<number | undefined>(undefined);
	const [dims, setDims] = useState<Partial<Record<ReviewDimension, number>>>(
		{},
	);
	const [body, setBody] = useState("");
	const [loading, setLoading] = useState(true);
	const [existing, setExisting] = useState(false);
	const [saving, setSaving] = useState(false);
	const [done, setDone] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Prefill from the user's current review, if any.
	useEffect(() => {
		if (!uid || !id) {
			setLoading(false);
			return;
		}
		let alive = true;
		fetchMyReview(uid, id)
			.then((mine) => {
				if (!alive || !mine) return;
				setRating(mine.rating);
				setDims(mine.dimensions);
				setBody(mine.body);
				setExisting(true);
			})
			.catch(() => {})
			.finally(() => alive && setLoading(false));
		return () => {
			alive = false;
		};
	}, [uid, id]);

	const problem = draftProblem({ rating: rating ?? 0, dimensions: dims, body });

	const save = async () => {
		if (!uid || !id || problem) return;
		setSaving(true);
		setError(null);
		try {
			await submitReview(uid, id, {
				rating: rating ?? 0,
				dimensions: dims,
				body,
			});
			setDone(true);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Couldn't save your review.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<KeyboardAvoidingView
			style={styles.screen}
			behavior={Platform.OS === "ios" ? "padding" : undefined}
		>
			<ScrollView
				contentContainerStyle={[
					styles.body,
					{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
				]}
				keyboardShouldPersistTaps="handled"
			>
				<Pressable
					style={styles.cancel}
					onPress={() => router.back()}
					accessibilityRole="button"
					accessibilityLabel="Close"
				>
					<Text style={styles.cancelTxt}>{done ? "Done" : "Cancel"}</Text>
				</Pressable>

				<Text style={styles.eyebrow}>RESIDENT REVIEW</Text>
				<Text style={styles.title}>{name ?? "This neighbourhood"}</Text>

				{done ? (
					<View style={styles.doneBox}>
						<Text style={styles.doneHead}>
							Thanks — it’ll show once reviewed.
						</Text>
						<Text style={styles.sub}>
							Every review is read by a person before it appears. Yours is in
							the queue; you can come back and edit it any time.
						</Text>
					</View>
				) : loading ? (
					<ActivityIndicator color={colors.ink2} style={{ marginTop: 40 }} />
				) : (
					<>
						<Text style={styles.sub}>
							{existing
								? "You’ve reviewed this neighbourhood before. Saving sends the new version back for approval."
								: "Only people who live or have lived here, please. Reviews are shown without your name."}
						</Text>

						<Text style={styles.sectionHead}>OVERALL</Text>
						<ScoreRow label="Rating" value={rating} onChange={setRating} />

						<Text style={styles.sectionHead}>
							IF YOU LIKE — A FEW SPECIFICS
						</Text>
						{REVIEW_DIMENSIONS.map((k) => (
							<ScoreRow
								key={k}
								label={REVIEW_DIMENSION_LABELS[k]}
								value={dims[k]}
								onChange={(n) =>
									setDims((d) => {
										const next = { ...d };
										if (n === undefined) delete next[k];
										else next[k] = n;
										return next;
									})
								}
							/>
						))}

						<Text style={styles.sectionHead}>IN YOUR WORDS</Text>
						<TextInput
							style={styles.input}
							multiline
							value={body}
							onChangeText={setBody}
							maxLength={REVIEW_BODY_MAX}
							placeholder="What’s it actually like to live here? What would you tell a friend thinking of buying?"
							placeholderTextColor={colors.ink3}
							textAlignVertical="top"
						/>
						<Text style={styles.counter}>
							{body.trim().length}/{REVIEW_BODY_MAX}
						</Text>

						{!!error && <Text style={styles.error}>{error}</Text>}

						<Pressable
							style={[styles.cta, (problem || saving) && styles.ctaDisabled]}
							disabled={!!problem || saving}
							onPress={save}
							accessibilityRole="button"
						>
							{saving ? (
								<ActivityIndicator color={colors.onCard} />
							) : (
								<Text style={styles.ctaTxt}>
									{existing ? "Save changes" : "Submit for review"}
								</Text>
							)}
						</Pressable>
						{!!problem && <Text style={styles.hint}>{problem}</Text>}
					</>
				)}
			</ScrollView>
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.bg },
	body: { paddingHorizontal: 20 },
	cancel: { alignSelf: "flex-end", padding: 6 },
	cancelTxt: { ...textStyles.body, color: colors.accent },
	eyebrow: { ...textStyles.caption, color: colors.accent, marginTop: 8 },
	title: { ...textStyles.title1, color: colors.ink, marginTop: 6 },
	sub: {
		...textStyles.footnote,
		color: colors.ink2,
		marginTop: 10,
		lineHeight: 18,
	},
	sectionHead: {
		...textStyles.caption,
		color: colors.ink2,
		marginTop: 26,
		marginBottom: 10,
	},
	scoreRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 8,
	},
	scoreLabel: { ...textStyles.body, color: colors.ink },
	dots: { flexDirection: "row", gap: 6 },
	dot: {
		width: 34,
		height: 34,
		borderRadius: radii.pill,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: colors.border,
		backgroundColor: colors.surface,
		alignItems: "center",
		justifyContent: "center",
	},
	dotOn: { backgroundColor: colors.accent, borderColor: colors.accent },
	dotTxt: { ...textStyles.footnote, color: colors.ink2 },
	dotTxtOn: { color: colors.onCard },
	input: {
		...textStyles.body,
		color: colors.ink,
		backgroundColor: colors.surface2,
		borderRadius: radii.btn,
		paddingHorizontal: 16,
		paddingVertical: 14,
		minHeight: 150,
		lineHeight: 22,
	},
	counter: {
		...textStyles.caption,
		color: colors.ink3,
		textAlign: "right",
		marginTop: 6,
	},
	error: { ...textStyles.footnote, color: colors.neg, marginTop: 12 },
	cta: {
		backgroundColor: colors.cta,
		borderRadius: radii.btn,
		minHeight: 48,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 18,
	},
	ctaDisabled: { opacity: 0.5 },
	ctaTxt: { ...textStyles.headline, color: colors.onCard },
	hint: {
		...textStyles.caption,
		color: colors.ink3,
		textAlign: "center",
		marginTop: 10,
		textTransform: "none",
		letterSpacing: 0,
	},
	doneBox: { marginTop: 32, gap: 8 },
	doneHead: { ...textStyles.title2, color: colors.ink },
});
