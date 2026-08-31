/**
 * The feed's scope line (phase140, owner pick "S3").
 *
 * ── Why the feed grew a permanent header at all ─────────────────────────────
 *
 * v2 deleted the scope strip and the persona chip — "卡外零常驻 chrome, scope
 * 管理全部在 You tab", owner 2026-07-25 — and the feed has carried nothing but
 * the wordmark since. What that cost was orientation: the deck is metro
 * Atlanta and no pixel on the screen said so, while the product's whole claim
 * is that it knows neighbourhoods. The owner reversed it on the strength of
 * that: 「顶部显示 scope 这个想法好 符合我们 community first 的理念」.
 *
 * Two lines, both real:
 *   1. `Atlanta metro › Peachtree Corners` — where the buyer is centred.
 *   2. `40 communities · median $594K` — the numbers behind it.
 *
 * ── What is deliberately NOT on line 2 ──────────────────────────────────────
 *
 * The approved demo showed "12 with tours" between those two. It is not here,
 * because the wire has no such number: `city_geo_units` aggregates
 * `community_count` and a median list price, and a per-city count of
 * communities WITH a finished tour would need the view changed. Shipping it
 * from a guess would be the one thing this codebase refuses ("every emitted
 * number is real or absent" — `lib/feed/geo-units.ts`), so the line ships with
 * the two numbers that exist and grows the third when the view does.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { GeoUnit } from "../../lib/feed/geo-unit";
import { redline } from "../../theme/tokens";
import { redlineText } from "../../theme/typography";

/**
 * The root of the crumb. Every one of the pool's 109 city units is in metro
 * Atlanta, so this is a fact about the inventory rather than a placeholder —
 * but it IS the one string here that no row supplies, and it is the line to
 * change on the day a second metro launches.
 */
export const SCOPE_ROOT_LABEL = "Atlanta metro";

/** "$594K" — the crumb has one line and a full `$594,450` crowds it. */
function shortPrice(value: number): string {
	if (value >= 1_000_000) {
		const m = value / 1_000_000;
		return `$${m >= 10 ? Math.round(m) : m.toFixed(1)}M`;
	}
	return `$${Math.round(value / 1000)}K`;
}

/**
 * The stats line for the scoped unit, built only from what the unit carries.
 * Exported for its test: a city with no median must produce one clause, not a
 * dangling separator.
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

interface ScopeCrumbProps {
	/** The picked scope's display name, or null for the whole metro. */
	scopeName: string | null;
	/** The picked unit, when the pool has loaded it — supplies line 2. */
	unit?: GeoUnit;
	onPress: () => void;
}

export function ScopeCrumb({ scopeName, unit, onPress }: ScopeCrumbProps) {
	const stats = scopeStatsLine(unit);
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={
				scopeName
					? `Scope: ${scopeName}. Change`
					: `Scope: ${SCOPE_ROOT_LABEL}. Change`
			}
			hitSlop={8}
			style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
		>
			<View style={styles.line1}>
				<Text style={scopeName ? styles.root : styles.rootOnly}>
					{SCOPE_ROOT_LABEL}
				</Text>
				{scopeName ? (
					<>
						<Text style={styles.sep}>›</Text>
						<Text style={styles.current} numberOfLines={1}>
							{scopeName}
						</Text>
					</>
				) : null}
				<Chevron />
			</View>
			{stats ? <Text style={styles.stats}>{stats}</Text> : null}
		</Pressable>
	);
}

/** A 13pt chevron-down from two borders — same trick as the card's arrow. */
function Chevron() {
	return <View style={styles.chevron} />;
}

const styles = StyleSheet.create({
	/**
	 * Sits between the wordmark row and the card stage. 44pt of touch height
	 * (§0.5's floor) without a background: this is a line of type on paper, not
	 * a bar — the card stays the visual centre (owner's rule for the tab bar,
	 * and the same reasoning applies above the deck).
	 */
	wrap: {
		/**
		 * ── Why this needs a z-index at all (owner on device, 2026-08-31) ────
		 *
		 * "看不到卡片上方的东西 但是点击空白居然可以弹窗 community list" — the
		 * crumb was invisible while its touch target still worked.
		 *
		 * `SwipeStack`'s `stageClip` is an OPAQUE paper band (`colors.bg`) at
		 * `top: -CLIP_OVERFLOW_PT`, i.e. 120pt ABOVE the stage, and no ancestor
		 * clips it — it exists to hide the behind-card's top edge and its
		 * elevation glow, and it is deliberately generous. It carries
		 * `pointerEvents="none"`, so it paints over whatever is up here without
		 * taking the touch: exactly one symptom, invisible-but-tappable.
		 *
		 * The wordmark row has survived it since 2026-08-14 for this reason and
		 * no other — `chromeRow` sets `zIndex: 100`. Anything the feed puts
		 * above the stage has to out-rank the band, so this matches it rather
		 * than inventing a second number.
		 */
		zIndex: 100,
		minHeight: 40,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 24,
		paddingBottom: 4,
		gap: 3,
	},
	pressed: { opacity: 0.6 },
	line1: { flexDirection: "row", alignItems: "center", gap: 6 },
	/** The root, muted when a city is scoped under it. */
	root: { ...redlineText.subtitle, fontWeight: "600", color: redline.ink2 },
	/** The root alone IS the scope, so it takes the ink the city would. */
	rootOnly: { ...redlineText.subtitle, fontWeight: "600", color: redline.ink },
	sep: { ...redlineText.subtitle, color: redline.ink3 },
	/** The scoped city — the redline green, the only accent on these surfaces. */
	current: {
		...redlineText.subtitle,
		fontWeight: "600",
		color: redline.accent,
		flexShrink: 1,
	},
	stats: { ...redlineText.locality, color: redline.ink2 },
	chevron: {
		width: 7,
		height: 7,
		marginTop: -3,
		marginLeft: 1,
		borderRightWidth: 1.6,
		borderBottomWidth: 1.6,
		borderColor: redline.ink3,
		transform: [{ rotate: "45deg" }],
	},
});
