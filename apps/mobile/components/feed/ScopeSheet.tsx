/**
 * The scope picker (phase140, the sheet behind the `ScopeCrumb`).
 *
 * ── A soft scope, and the copy says so ──────────────────────────────────────
 *
 * §1.3: "scope = 软排序信号, **非过滤**". This sheet's pick is applied by
 * `preferScope`, which reorders the loaded pool client-side — the picked city's
 * communities and homes lead, everything else follows. Nothing is hidden, so
 * the sheet's subtitle promises exactly what happens.
 *
 * It deliberately does NOT touch the server's `cities` parameter, which really
 * does hard-filter the community query. Two reasons: the feed is video-only and
 * only a handful of communities have a finished tour, so filtering to one city
 * would empty the community slots rather than focus them; and a scope that can
 * empty half the deck is not a scope a buyer would use twice.
 *
 * The list is the pool's own city units, densest first (`scopeChoices`) — the
 * only list of places Percho actually has communities in. No search box: 109
 * rows scroll, and a box that filtered a list this short would be chrome for
 * its own sake. The Search tab is where finding a place by name lives.
 */
import {
	Image,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import type { GeoUnit } from "../../lib/feed/geo-unit";
import { scopeChoices } from "../../lib/feed/scope";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";
import { BottomSheet } from "../BottomSheet";
import { SCOPE_ROOT_LABEL, scopeStatsLine } from "./ScopeCrumb";

/** How many cities the sheet offers. The pool holds 109; this is the head. */
const MAX_CHOICES = 40;

interface ScopeSheetProps {
	visible: boolean;
	units: readonly GeoUnit[];
	/** The currently scoped unit id, or null for the whole metro. */
	scopedId: string | null;
	onPick: (pick: { unitId: string; name: string } | null) => void;
	onClose: () => void;
}

export function ScopeSheet({
	visible,
	units,
	scopedId,
	onPick,
	onClose,
}: ScopeSheetProps) {
	const choices = scopeChoices(units, MAX_CHOICES);

	const pick = (next: { unitId: string; name: string } | null) => {
		onPick(next);
		onClose();
	};

	return (
		<BottomSheet visible={visible} detent="large" onClose={onClose}>
			<View style={styles.head}>
				<Text style={styles.title}>Where are you looking?</Text>
				<Text style={styles.sub}>
					Communities here come first. Everything else still shows, further
					down.
				</Text>
			</View>
			<ScrollView
				style={styles.list}
				contentContainerStyle={styles.listContent}
				showsVerticalScrollIndicator={false}
			>
				<Row
					title={`Anywhere in ${SCOPE_ROOT_LABEL.replace(" metro", "")}`}
					subtitle="Every community Percho has toured"
					selected={scopedId === null}
					onPress={() => pick(null)}
				/>
				{choices.map((u) => (
					<Row
						key={u.id}
						title={u.name}
						subtitle={scopeStatsLine(u) ?? ""}
						thumbUrl={u.heroUrl}
						selected={u.id === scopedId}
						onPress={() => pick({ unitId: u.id, name: u.name })}
					/>
				))}
			</ScrollView>
		</BottomSheet>
	);
}

interface RowProps {
	title: string;
	subtitle: string;
	thumbUrl?: string;
	selected: boolean;
	onPress: () => void;
}

function Row({ title, subtitle, thumbUrl, selected, onPress }: RowProps) {
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityState={{ selected }}
			style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
		>
			{thumbUrl ? (
				<Image source={{ uri: thumbUrl }} style={styles.thumb} />
			) : (
				<View style={[styles.thumb, styles.thumbAny]} />
			)}
			<View style={styles.rowText}>
				<Text style={styles.rowTitle} numberOfLines={1}>
					{title}
				</Text>
				{subtitle ? (
					<Text style={styles.rowSub} numberOfLines={1}>
						{subtitle}
					</Text>
				) : null}
			</View>
			{selected ? <Check /> : null}
		</Pressable>
	);
}

/** The selected tick — two bars, the same border art as everywhere else. */
function Check() {
	return (
		<View style={styles.check}>
			<View style={styles.checkShort} />
			<View style={styles.checkLong} />
		</View>
	);
}

const MIN_TOUCH = 44;
const THUMB = 46;

const styles = StyleSheet.create({
	head: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10, gap: 4 },
	title: { ...textStyles.title2, color: colors.ink },
	sub: { ...textStyles.footnote, color: colors.ink2 },
	list: { flex: 1 },
	listContent: { paddingHorizontal: 20, paddingBottom: 32 },
	row: {
		minHeight: MIN_TOUCH + 16,
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 8,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.border,
	},
	rowPressed: { opacity: 0.6 },
	thumb: {
		width: THUMB,
		height: THUMB,
		borderRadius: radii.tile,
		backgroundColor: colors.surface2,
	},
	/** The "anywhere" row has no photograph — a place-less scope has no place. */
	thumbAny: { backgroundColor: colors.surface2 },
	rowText: { flex: 1, minWidth: 0 },
	rowTitle: { ...textStyles.headline, color: colors.ink },
	rowSub: { ...textStyles.footnote, color: colors.ink2, marginTop: 2 },
	check: {
		width: 22,
		height: 22,
		borderRadius: 11,
		backgroundColor: colors.pos,
		alignItems: "center",
		justifyContent: "center",
	},
	checkShort: {
		position: "absolute",
		left: 5,
		top: 11,
		width: 6,
		height: 2,
		borderRadius: 1,
		backgroundColor: colors.onCard,
		transform: [{ rotate: "45deg" }],
	},
	checkLong: {
		position: "absolute",
		left: 8,
		top: 10,
		width: 10,
		height: 2,
		borderRadius: 1,
		backgroundColor: colors.onCard,
		transform: [{ rotate: "-45deg" }],
	},
});
