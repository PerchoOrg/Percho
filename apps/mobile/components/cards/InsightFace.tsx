/**
 * InsightFace (§1.6) — "Percho noticed", REBUILT to the owner's "Percho Swipe
 * Cards" redline (2026-07-30, 「全按redline覆盖」).
 *
 * ── What changed ─────────────────────────────────────────────────────────────
 *
 * The old face was a dark amber `CardSurface` with white centred copy and an
 * outlined "Not sure" pill. The redline replaces it with the calmest of the four
 * cards:
 *
 *   background   linear-gradient(180deg, #FFFDF9 → #F7F3EC) — no photo
 *   badge        62pt mint circle with a green four-point sparkle, ~72pt down
 *   headline     serif 30–32, centred, margin-top 20
 *   body         13 / 1.55, centred, muted, max-width 220
 *   divider      220 x 1pt hairline, margin-top 26
 *   label        10px "Top matches for you", margin-top 18
 *   thumbnails   three 68x76 images, radius 14, captioned 9–10px
 *   CTA          full-width 47pt green pill, "View Recommendations →"
 *
 * ── The "Top matches" strip has no data, so it is absent ─────────────────────
 *
 * The redline's insight card ends with three recommendation thumbnails
 * (Roswell / Alpharetta / Johns Creek). `InsightCardV3` is `{ dim, text,
 * evidence }` — it carries no recommendations, no images, and no place names.
 * Inventing three communities under a headline that says "your preferences are
 * becoming clear" would be exactly the kind of fabricated claim §1.6 exists to
 * prevent (the same reason `evidence` is a required field on the type).
 *
 * So the divider / label / thumbnail strip renders ONLY if a caller passes real
 * `matches`. Nothing supplies them today, so on device this card shows badge →
 * headline → evidence → CTA. The slot is wired, typed, and ready for the day the
 * feed computes real matches; it is not filled with placeholders.
 *
 * ── §1.6's neutral third option is preserved ─────────────────────────────────
 *
 * §1.6 gives this card a "Not sure" path that records nothing, and its label
 * comes from `cardBehavior`, not from this file. The redline has no such control
 * (it is a static board and shows only the CTA), but removing the option would
 * delete a spec behaviour — so it stays, as a quiet text button beneath the CTA
 * rather than the old outlined pill, which would fight the green CTA for weight
 * on a light card.
 */
import { LinearGradient } from "expo-linear-gradient";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { InsightCardV3 } from "../../lib/feed/card-types";
import { radii, redline, redlineRadii } from "../../theme/tokens";
import { redlineText } from "../../theme/typography";
import {
	RedlineCta,
	RedlineHeart,
	RedlineIcon,
	RedlinePill,
} from "./redline/RedlineChrome";

/** §0.5: every touch target is at least 44pt. */
const MIN_TOUCH = 44;
/** The redline's sparkle badge: 62pt circle, 26pt glyph. */
const BADGE = 62;
const SPARKLE = 26;
/** "Image about 68px × 76px". */
const THUMB_W = 68;
const THUMB_H = 76;

/** A real recommendation, if a caller ever has one. See the header note. */
export interface InsightMatch {
	id: string;
	name: string;
	imageUrl: string;
}

interface InsightFaceProps {
	card: InsightCardV3;
	/** From `cardBehavior(card)` — the mode:'confirm' neutralLabel. */
	neutralLabel: string;
	onNotSure: () => void;
	/**
	 * Real recommendations for the redline's "Top matches for you" strip. Omit
	 * (or pass empty) and the strip is not rendered — it is never placeheld.
	 */
	matches?: readonly InsightMatch[];
	onViewRecommendations?: () => void;
	onSave?: () => void;
}

export function InsightFace({
	card,
	neutralLabel,
	onNotSure,
	matches,
	onViewRecommendations,
	onSave,
}: InsightFaceProps) {
	const hasMatches = !!matches && matches.length > 0;

	return (
		<View style={styles.face}>
			<LinearGradient
				colors={[redline.insightFrom, redline.insightTo]}
				style={StyleSheet.absoluteFill}
				pointerEvents="none"
			/>
			<View style={styles.pillSlot}>
				<RedlinePill label="AI INSIGHT" />
			</View>
			<View style={styles.heartSlot}>
				<RedlineHeart onPress={onSave} />
			</View>

			<View style={styles.body}>
				<View style={styles.badge}>
					<RedlineIcon name="sparkle" size={SPARKLE} color={redline.accent} />
				</View>
				<Text style={styles.headline}>{card.text}</Text>
				<Text style={styles.evidence}>{card.evidence}</Text>

				{hasMatches && (
					<>
						<View style={styles.divider} />
						<Text style={styles.matchLabel}>Top matches for you</Text>
						<View style={styles.recs}>
							{matches.map((m) => (
								<View key={m.id} style={styles.rec}>
									<Image
										source={{ uri: m.imageUrl }}
										style={styles.recImage}
										resizeMode="cover"
									/>
									<Text style={styles.recName} numberOfLines={1}>
										{m.name}
									</Text>
								</View>
							))}
						</View>
					</>
				)}

				<View style={styles.foot}>
					{!!onViewRecommendations && (
						<RedlineCta
							label="View Recommendations →"
							onPress={onViewRecommendations}
						/>
					)}
					<Pressable
						onPress={onNotSure}
						style={styles.neutral}
						accessibilityRole="button"
						accessibilityLabel={neutralLabel}
						hitSlop={8}
					>
						<Text style={styles.neutralLabel}>{neutralLabel}</Text>
					</Pressable>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	face: { flex: 1, backgroundColor: redline.card },
	pillSlot: { position: "absolute", top: 15, left: 15, zIndex: 3 },
	heartSlot: { position: "absolute", top: 15, right: 15, zIndex: 3 },
	/** "About 72px from top" for the badge. */
	body: {
		flex: 1,
		alignItems: "center",
		paddingTop: 72,
		paddingHorizontal: 18,
		paddingBottom: 20,
		zIndex: 2,
	},
	badge: {
		width: BADGE,
		height: BADGE,
		borderRadius: radii.pill,
		backgroundColor: redline.accentSoft,
		alignItems: "center",
		justifyContent: "center",
	},
	headline: {
		...redlineText.insight,
		color: redline.ink,
		textAlign: "center",
		marginTop: 20,
	},
	evidence: {
		...redlineText.insightBody,
		color: redline.ink3,
		textAlign: "center",
		marginTop: 12,
		maxWidth: 220,
	},
	divider: {
		width: 220,
		height: StyleSheet.hairlineWidth,
		backgroundColor: redline.border,
		marginTop: 26,
	},
	/** The redline says 10px for this label (`nano` is the 9.5px thumb caption). */
	matchLabel: { ...redlineText.microLabel, color: redline.ink3, marginTop: 18 },
	recs: { flexDirection: "row", gap: 8, marginTop: 12 },
	rec: { width: THUMB_W },
	recImage: {
		width: THUMB_W,
		height: THUMB_H,
		borderRadius: redlineRadii.thumb,
		backgroundColor: redline.surface,
	},
	recName: {
		...redlineText.nano,
		color: redline.ink3,
		textAlign: "center",
		marginTop: 6,
	},
	/** `marginTop: auto` — the redline pins the CTA to the bottom. */
	foot: { marginTop: "auto", width: "100%", alignItems: "center", gap: 4 },
	neutral: {
		minHeight: MIN_TOUCH,
		justifyContent: "center",
		paddingHorizontal: 24,
	},
	neutralLabel: { ...redlineText.micro, color: redline.ink3 },
});
