/**
 * DEV-ONLY foundation preview (not in nav — spec: "demo 屏不进 main 导航").
 * Reachable only by typing the /dev-foundation route; nothing links to it.
 *
 * Exists so task-0's 7 acceptance criteria can be checked on a device. Each
 * section below is labelled with the criterion it exercises (A1..A7) so the
 * reviewer can walk them in order. See docs/design/spec-v3/prompts/
 * task-0-foundation.md §验收标准.
 */
import { useState } from "react";
import {
	Image,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BottomSheet } from "../components/BottomSheet";
import { CardFoot } from "../components/CardFoot";
import { CardVideo } from "../components/CardVideo";
import { ExploreButton } from "../components/ExploreButton";
import { KindChip } from "../components/KindChip";
import { MatchBadge } from "../components/MatchBadge";
import { SoundToggle } from "../components/SoundToggle";
import { type CardRenderArgs, SwipeStack } from "../components/SwipeStack";
import { TabBar } from "../components/TabBar";
import { DEFAULT_CAPABILITY } from "../lib/gesture/capability";
import { colors, radii } from "../theme/tokens";
import { textStyles } from "../theme/typography";

interface DemoCard {
	id: string;
	kind: string;
	price: string;
	address: string;
	specs: string;
	pills: string[];
	img: string;
	video?: string;
	score: number;
}

// Two DIFFERENT videos back-to-back so A5 (old card pauses+mutes, new top card
// restarts from 0) is actually observable — with one video you can't tell.
// Both are 10s / ~1MB and serve HTTP 206, which `player.currentTime = 0`
// needs. The old gtv-videos-bucket sample URLs now 403 — don't go back to them.
const VIDEO_BUNNY =
	"https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4";
const VIDEO_JELLYFISH =
	"https://test-videos.co.uk/vids/jellyfish/mp4/h264/720/Jellyfish_720_10s_1MB.mp4";

const DEMO: DemoCard[] = [
	{
		id: "a",
		kind: "LISTING",
		price: "$685,000",
		address: "12 Waterside Ct",
		specs: "4 bd · 3 ba · 2,410 sqft",
		pills: ["🌳 Wooded", "🏫 Top schools", "🚶 Walkable", "👨‍👩‍👧 Family"],
		img: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=900&q=70&auto=format",
		video: VIDEO_BUNNY,
		score: 92,
	},
	{
		id: "b",
		kind: "LISTING",
		price: "$540,000",
		address: "31 Chapel Ridge",
		specs: "3 bd · 2 ba · 1,780 sqft",
		pills: ["🔇 Quiet", "🌲 Trails"],
		img: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=900&q=70&auto=format",
		video: VIDEO_JELLYFISH,
		score: 72,
	},
	{
		id: "c",
		kind: "COMMUNITY",
		price: "$720,000",
		address: "8 Oak Hollow",
		specs: "5 bd · 4 ba · 3,050 sqft",
		pills: ["🏊 Pool", "🍷 Entertaining"],
		img: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=900&q=70&auto=format",
		score: 55,
	},
];

const TABS = [
	{ key: "feed", label: "Feed" },
	{ key: "search", label: "Search" },
	{ key: "saved", label: "Saved" },
	{ key: "you", label: "You" },
] as const;

export default function DevFoundation() {
	const { width } = useWindowDimensions();
	const [index, setIndex] = useState(0);
	const [tab, setTab] = useState<string>("feed");
	const [sheet, setSheet] = useState<false | "medium" | "large">(false);
	const [log, setLog] = useState<string[]>([]);

	const note = (s: string) =>
		setLog((l) =>
			[`${new Date().toLocaleTimeString()} ${s}`, ...l].slice(0, 6),
		);

	const renderCard = (item: DemoCard, { role }: CardRenderArgs) => (
		<View style={styles.cardInner}>
			{item.video ? (
				<CardVideo
					url={item.video}
					poster={item.img}
					isTop={role === "top"}
					onNearEnd={() => note(`A5 onNearEnd 82% fired — ${item.address}`)}
				/>
			) : (
				<Image source={{ uri: item.img }} style={StyleSheet.absoluteFill} />
			)}
			<View style={styles.chipRow}>
				<KindChip label={item.kind} />
				<MatchBadge
					score={item.score}
					stage={4}
					onSeeWhy={() => setSheet("medium")}
				/>
			</View>
			<View style={styles.foot}>
				<CardFoot
					price={item.price}
					address={item.address}
					specs={item.specs}
					pills={item.pills}
					onExplore={() => setSheet("large")}
				/>
			</View>
		</View>
	);

	const renderBack = (item: DemoCard, _role: "top" | "next" | "after") => (
		<View style={styles.dataFace}>
			<Text style={styles.dataTitle}>{item.address}</Text>
			<Text style={styles.dataRow}>{item.specs}</Text>
			<Text style={styles.dataRow}>Match {item.score}%</Text>
			<Text style={styles.dataRow}>
				A2: tap flips via 350ms crossfade — no 3D spin, no mirrored text.
			</Text>
			<Text style={styles.dataRow}>Tap again to flip back.</Text>
		</View>
	);

	const atEnd = index >= DEMO.length;

	return (
		<SafeAreaView style={styles.root} edges={["top", "bottom"]}>
			<View style={styles.statusRow}>
				<Text style={styles.h}>Foundation preview</Text>
				<SoundToggle />
			</View>

			{/* A6 — MatchBadge three states side by side. 55 must render NOTHING. */}
			<View style={styles.badgeRow}>
				<Text style={styles.tag}>A6</Text>
				<MatchBadge score={55} stage={4} />
				<MatchBadge score={72} stage={4} />
				<MatchBadge score={92} stage={4} onSeeWhy={() => setSheet("medium")} />
			</View>

			{/* A3/A4/A5 — the stack. Drag slowly to watch ±8° and the next card rise. */}
			<View style={styles.stackWrap}>
				{atEnd ? (
					<Pressable style={styles.resetBtn} onPress={() => setIndex(0)}>
						<Text style={styles.sheetBtnText}>Deck done — tap to reset</Text>
					</Pressable>
				) : (
					<SwipeStack
						items={DEMO}
						activeIndex={index}
						onDecision={(d, item) => {
							note(`A3 ${d === "right" ? "LIKE" : "PASS"} — ${item.address}`);
							setIndex((i) => Math.min(i + 1, DEMO.length));
						}}
						renderCard={renderCard}
						renderBack={renderBack}
						keyExtractor={(it) => it.id}
						cardWidth={width - 32}
						cardHeight={400}
						capability={() => DEFAULT_CAPABILITY}
					/>
				)}
			</View>

			{/* A? — vertical scroll probe: this list must scroll even when the drag
			    starts ON the card above. Proves the pan gesture no longer steals
			    vertical drags (blocker 1 / task-1 prerequisite). */}
			<ScrollView style={styles.logBox} contentContainerStyle={styles.logInner}>
				<Text style={styles.tag}>
					event log — scroll me (drag must not swipe the card)
				</Text>
				{log.length === 0 ? (
					<Text style={styles.logLine}>no events yet</Text>
				) : (
					log.map((l) => (
						<Text key={l} style={styles.logLine}>
							{l}
						</Text>
					))
				)}
			</ScrollView>

			<View style={styles.btnRow}>
				<Pressable style={styles.sheetBtn} onPress={() => setSheet("medium")}>
					<Text style={styles.sheetBtnText}>A7 sheet: medium</Text>
				</Pressable>
				<Pressable style={styles.sheetBtn} onPress={() => setSheet("large")}>
					<Text style={styles.sheetBtnText}>large</Text>
				</Pressable>
				<ExploreButton onPress={() => note("ExploreButton pressed")} />
			</View>

			{/* A7 — TabBar 4 tabs, active/inactive. On a notched device the bar must
			    sit ABOVE the home indicator, not under it. */}
			<TabBar tabs={TABS} activeKey={tab} onSelect={setTab} />

			<BottomSheet
				visible={sheet !== false}
				detent={sheet === false ? "medium" : sheet}
				onClose={() => setSheet(false)}
			>
				<View style={styles.sheetBody}>
					<Text style={styles.sheetTitle}>Bottom sheet</Text>
					<Text style={styles.sheetText}>Detent: {sheet || "—"}</Text>
					<Text style={styles.sheetText}>
						A7: grabber visible, drag down to dismiss, backdrop tap closes.
					</Text>
				</View>
			</BottomSheet>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1, backgroundColor: colors.bg },
	statusRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingVertical: 8,
	},
	h: { ...textStyles.title2, color: colors.ink },
	tag: { ...textStyles.caption, color: colors.ink2 },
	badgeRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingHorizontal: 16,
		paddingBottom: 8,
	},
	stackWrap: { height: 400, marginBottom: 8 },
	cardInner: { flex: 1 },
	dataFace: { flex: 1, padding: 20, gap: 8, backgroundColor: colors.ink },
	dataTitle: { ...textStyles.title2, color: colors.onCard },
	dataRow: { ...textStyles.body, color: colors.onCardDim },
	chipRow: {
		position: "absolute",
		top: 12,
		left: 12,
		right: 12,
		flexDirection: "row",
		justifyContent: "space-between",
	},
	foot: { position: "absolute", left: 0, right: 0, bottom: 0 },
	logBox: {
		flex: 1,
		marginHorizontal: 16,
		borderRadius: radii.card,
		backgroundColor: colors.surface2,
	},
	logInner: { padding: 12, gap: 4 },
	logLine: { ...textStyles.caption, color: colors.ink },
	btnRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		paddingVertical: 8,
	},
	sheetBtn: {
		paddingHorizontal: 14,
		paddingVertical: 10,
		borderRadius: radii.btn,
		backgroundColor: colors.surface2,
	},
	resetBtn: {
		alignSelf: "center",
		marginTop: 160,
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderRadius: radii.btn,
		backgroundColor: colors.surface2,
	},
	sheetBtnText: { ...textStyles.headline, color: colors.ink },
	sheetBody: { padding: 24, gap: 8 },
	sheetTitle: { ...textStyles.title2, color: colors.ink },
	sheetText: { ...textStyles.body, color: colors.ink2 },
});
