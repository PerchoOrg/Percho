/**
 * DataFaceStub (PLAN §1.4 / B12) — the back face for listing and community
 * cards in task 1.
 *
 * Those data faces are fully specced in `02-listing.md` / `03-community.md` and
 * are built by tasks 2–3. Task 1 ships the flip MECHANICS, so this face exists
 * only to give `canFlipCard` something real to return: it lists the fields the
 * card actually carries and nothing else.
 *
 * It deliberately has no "coming soon" copy, no skeleton rows, no invented
 * metrics. When task 2 lands `ListingDataFace`, this file is replaced at the
 * call site rather than extended.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CommunityCardV3, ListingCardV3 } from "../../lib/feed/card-types";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";
import { CardSurface } from "./CardSurface";

interface DataFaceStubProps {
	card: ListingCardV3 | CommunityCardV3;
	onFlipBack: () => void;
}

interface Row {
	key: string;
	label: string;
	value: string;
}

function rowsFor(card: ListingCardV3 | CommunityCardV3): Row[] {
	if (card.kind === "listing") {
		const rows: Row[] = [
			{ key: "price", label: "Price", value: card.priceLabel },
			{ key: "specs", label: "Home", value: card.bedBathSqft },
			{ key: "address", label: "Address", value: card.address },
		];
		if (card.matchScore !== undefined && !card.tease && !card.preview) {
			rows.push({
				key: "match",
				label: "Match",
				value: `${card.matchScore}%`,
			});
		}
		return rows;
	}

	const rows: Row[] = [
		{ key: "where", label: "Where", value: `${card.city}, ${card.state}` },
	];
	if (card.priceLabel) {
		rows.push({ key: "price", label: "Price band", value: card.priceLabel });
	}
	if (card.homes !== undefined) {
		rows.push({ key: "homes", label: "Homes", value: String(card.homes) });
	}
	return rows;
}

export function DataFaceStub({ card, onFlipBack }: DataFaceStubProps) {
	const title = card.kind === "listing" ? card.address : card.name;

	return (
		<View style={styles.face}>
			<CardSurface variant="data" />
			<View style={styles.body}>
				<Text style={styles.eyebrow}>{card.kind}</Text>
				<Text style={styles.title}>{title}</Text>
				{rowsFor(card).map((r) => (
					<View key={r.key} style={styles.row}>
						<Text style={styles.rowLabel}>{r.label}</Text>
						<Text style={styles.rowValue}>{r.value}</Text>
					</View>
				))}
			</View>
			<View style={styles.actions}>
				<Pressable
					hitSlop={8}
					onPress={onFlipBack}
					style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
				>
					<Text style={styles.btnLabel}>Flip back</Text>
				</Pressable>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	face: { flex: 1, backgroundColor: colors.cardPlainTo },
	body: { flex: 1, padding: 20, paddingTop: 28 },
	eyebrow: { ...textStyles.caption, color: colors.accentOnCard },
	title: { ...textStyles.title1, color: colors.onCard, marginTop: 6 },
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-end",
		paddingVertical: 12,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: colors.onCardDim,
	},
	rowLabel: { ...textStyles.footnote, color: colors.onCardDim },
	rowValue: { ...textStyles.headline, color: colors.onCard },
	actions: { paddingHorizontal: 20, paddingBottom: 20 },
	btn: {
		minHeight: 44,
		justifyContent: "center",
		alignSelf: "flex-start",
		paddingHorizontal: 18,
		borderRadius: radii.pill,
		backgroundColor: colors.glass,
	},
	pressed: { opacity: 0.8 },
	btnLabel: { ...textStyles.headline, color: colors.ink },
});
