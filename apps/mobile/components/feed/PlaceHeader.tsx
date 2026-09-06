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
 * So the header is now: the metro as an eyebrow, the CITY as the page's title,
 * the city's own numbers, and the neighbourhoods Percho has filmed there
 * (`CommunityStrip`). Tapping the title opens the same scope sheet the crumb
 * did.
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
import { DM_SERIF_FONT } from "../../theme/fonts";
import { redline } from "../../theme/tokens";
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
	/** The scoped unit, for its numbers. Absent → the stats line is omitted. */
	unit: GeoUnit | undefined;
	onPress: () => void;
	/** The community strip, mounted by the feed (it owns the deck). */
	children?: React.ReactNode;
}

export function PlaceHeader({
	scopeName,
	unit,
	onPress,
	children,
}: PlaceHeaderProps) {
	/** With no city scoped, the metro IS the title — never an empty eyebrow. */
	const title = scopeName ?? SCOPE_ROOT_LABEL;
	const eyebrow = scopeName ? SCOPE_ROOT_LABEL : null;
	const stats = scopeStatsLine(unit);

	return (
		<View style={styles.wrap}>
			<Pressable
				onPress={onPress}
				accessibilityRole="button"
				accessibilityLabel={`Scope: ${title}. Change`}
				hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
				style={({ pressed }) => [styles.head, pressed && styles.pressed]}
			>
				{eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
				<View style={styles.titleRow}>
					<Text style={styles.title} numberOfLines={1}>
						{title}
					</Text>
					<View style={styles.chevron} />
				</View>
				{stats ? <Text style={styles.stats}>{stats}</Text> : null}
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
	head: { alignItems: "center", paddingHorizontal: 24 },
	pressed: { opacity: 0.6 },
	/** The metro, above the city — 10/700/1pt, the redline's own label style. */
	eyebrow: { ...redlineText.label, color: redline.ink3 },
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginTop: 2,
	},
	/**
	 * The city, in the serif the wordmark used to own. 30pt is the wordmark's
	 * 34 stepped down: the page keeps a serif anchor at the top, but it now
	 * names the place instead of the app.
	 */
	title: {
		fontFamily: DM_SERIF_FONT,
		fontSize: 30,
		lineHeight: 34,
		letterSpacing: -0.6,
		color: redline.ink,
		flexShrink: 1,
	},
	stats: { ...redlineText.story, color: redline.ink2, marginTop: 2 },
	/** A chevron-down from two borders — the same trick as the card's arrow. */
	chevron: {
		width: 8,
		height: 8,
		marginTop: -4,
		borderRightWidth: 1.8,
		borderBottomWidth: 1.8,
		borderColor: redline.ink3,
		transform: [{ rotate: "45deg" }],
	},
});
