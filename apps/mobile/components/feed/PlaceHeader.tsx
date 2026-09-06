/**
 * The feed's header — the PLACE, not the product (phase181, owner pick "R3").
 *
 * ── What this replaces ──────────────────────────────────────────────────────
 *
 * The feed opened with the "Percho" wordmark (2026-08-14) and, under it, a
 * one-line scope crumb (phase140 "S3", cut back to one line by phase179). The
 * owner's 2026-09-05 call: 「remove Percho app name, starts with area-city
 * directly」 — the page is about where you are looking, and the app already
 * says its name on the launch screen and in the tab bar.
 *
 * So the page opens on the place. It shipped as three rows — metro eyebrow,
 * a 30pt serif city title, the city's stats — and the owner cut it back the
 * same day: 「too many lines of text, can you make them in one line then
 * follow with communities and cards」. One line now, then the neighbourhoods
 * (`CommunityStrip`), then the deck. Tapping the line opens the same scope
 * sheet the old crumb did.
 *
 * The stats (`40 communities · median $594K`) are NOT on that line. They had
 * already been cut from the feed once, on 2026-09-05 ("no need to show xxx
 * communities in this page"), and folding them back into a line whose job is
 * to say WHERE you are would re-create the row this edit removed.
 * `scopeStatsLine` stays exported — the scope sheet prints it under each city,
 * where the numbers are the point.
 *
 * ── Why a bigger header makes the page SHORTER ──────────────────────────────
 *
 * Counter-intuitive, and it is the whole reason this shape was picked. The
 * stage below is `flex: 1` and the card is anchored to its top (phase179), so
 * every point this header does NOT use ends up as empty paper under the card —
 * 128pt of it on the owner's iPhone, which is what he reported. Deleting the
 * wordmark alone made that 172. The header taking the space back is what
 * closes the hole, and `theme/card-frame.ts` had to stop sizing the card as a
 * share of the stage for that to work.
 *
 * The demo this was picked from: `percho.co/demos/feed-header-v2` (R3).
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { GeoUnit } from "../../lib/feed/geo-unit";
import { fonts, redline } from "../../theme/tokens";
import { redlineText } from "../../theme/typography";

/**
 * The root of the scope. Every one of the pool's 109 city units is in metro
 * Atlanta, so this is a fact about the inventory rather than a placeholder —
 * but it IS the one string here that no row supplies, and it is the line to
 * change on the day a second metro launches.
 */
export const SCOPE_ROOT_LABEL = "Atlanta metro";

/** "$594K" — a full `$594,450` crowds the stats line. */
function shortPrice(value: number): string {
	if (value >= 1_000_000) {
		const m = value / 1_000_000;
		return `$${m >= 10 ? Math.round(m) : m.toFixed(1)}M`;
	}
	return `$${Math.round(value / 1000)}K`;
}

/**
 * The stats line for a unit, built only from what the unit carries — used here
 * and by `ScopeSheet` for each city's subtitle. A city with no median must
 * produce one clause, not a dangling separator; a city with neither produces
 * null and the line does not render (`every emitted number is real or absent`,
 * see `lib/feed/geo-units.ts`).
 *
 * The approved demo also showed "12 with tours". It has never shipped: the
 * wire has no such number — `city_geo_units` aggregates `community_count` and
 * a median list price, and a per-city count of communities WITH a finished
 * tour would need the view changed.
 */
export function scopeStatsLine(unit: GeoUnit | undefined): string | null {
	if (!unit) return null;
	const parts: string[] = [];
	if (unit.communityCount > 0) {
		parts.push(
			`${unit.communityCount.toLocaleString()} ${
				unit.communityCount === 1 ? "community" : "communities"
			}`,
		);
	}
	const median = unit.stats.medianListPrice;
	if (median) parts.push(`median ${shortPrice(median.value)}`);
	return parts.length > 0 ? parts.join(" · ") : null;
}

interface PlaceHeaderProps {
	/** The picked scope's display name, or null for the whole metro. */
	scopeName: string | null;
	onPress: () => void;
	/** The community strip, mounted by the feed (it owns the deck). */
	children?: React.ReactNode;
}

export function PlaceHeader({
	scopeName,
	onPress,
	children,
}: PlaceHeaderProps) {
	return (
		<View style={styles.wrap}>
			<Pressable
				onPress={onPress}
				accessibilityRole="button"
				accessibilityLabel={`Scope: ${scopeName ?? SCOPE_ROOT_LABEL}. Change`}
				// The line is ~22pt; 11 each side restores §0.5's 44pt target.
				hitSlop={{ top: 11, bottom: 11, left: 8, right: 8 }}
				style={({ pressed }) => [styles.line, pressed && styles.pressed]}
			>
				{/* With no city scoped the metro IS the place, and it takes the
				    ink the city would rather than sitting next to an empty crumb. */}
				<Text style={scopeName ? styles.root : styles.city} numberOfLines={1}>
					{SCOPE_ROOT_LABEL}
				</Text>
				{scopeName ? (
					<>
						<Text style={styles.sep}>›</Text>
						<Text style={styles.city} numberOfLines={1}>
							{scopeName}
						</Text>
					</>
				) : null}
				<View style={styles.chevron} />
			</Pressable>
			{children}
		</View>
	);
}

const styles = StyleSheet.create({
	/**
	 * ── Why this needs a z-index (owner on device, 2026-08-31) ──────────────
	 *
	 * `SwipeStack`'s `stageClip` is an OPAQUE paper band (`colors.bg`) 120pt
	 * ABOVE the stage, and no ancestor clips it — it hides the behind-card's
	 * top edge and its elevation glow. It carries `pointerEvents="none"`, so it
	 * paints over anything up here while leaving the touch target working:
	 * "看不到卡片上方的东西 但是点击空白居然可以弹窗 community list". Anything
	 * the feed puts above the stage has to out-rank that band; 100 is the
	 * number the old wordmark row used.
	 */
	wrap: { zIndex: 100, paddingTop: 4 },
	/** One row: metro › city ⌄, centred, on paper — no bar, no background. */
	line: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		paddingHorizontal: 24,
	},
	pressed: { opacity: 0.6 },
	/** The metro, muted when a city is scoped under it. */
	root: { ...redlineText.subtitle, fontWeight: "500", color: redline.ink2 },
	sep: { ...redlineText.subtitle, color: redline.ink3 },
	/**
	 * The place itself. 17/700 in the redline green — a step up from the 14pt
	 * crumb this replaced, because with the wordmark gone it is the first thing
	 * on the page and has to hold that position on its own.
	 */
	city: {
		fontFamily: fonts.ui,
		fontSize: 17,
		lineHeight: 22,
		fontWeight: "700",
		letterSpacing: -0.2,
		color: redline.accent,
		flexShrink: 1,
	},
	/** A chevron-down from two borders — the same trick as the card's arrow. */
	chevron: {
		width: 7,
		height: 7,
		marginTop: -3,
		borderRightWidth: 1.7,
		borderBottomWidth: 1.7,
		borderColor: redline.ink3,
		transform: [{ rotate: "45deg" }],
	},
});
