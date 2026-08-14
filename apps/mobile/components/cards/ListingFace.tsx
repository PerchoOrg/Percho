import type { DimKey } from "@percho/shared";
/**
 * ListingFace (§1.4) — the listing front face, REBUILT to the owner's
 * "Percho Swipe Cards" redline (2026-07-30, 「全按redline覆盖」).
 *
 * ── 2026-08-13 redesign: media-first, natural-height text block ─────────────
 *
 * The card now fills the feed's available height (flex:1 card), the media
 * area eats every remaining point (`flex: 1, minHeight: 0` — no aspectRatio,
 * no fixed height), and the text block renders at its natural height under
 * it, targeted ≤ 190pt. The previous 54/46 (later 61.8/38.2) proportional
 * split is gone, along with the `PANEL_SCALE` scaling of the panel's type.
 * Rows, in order:
 *
 *   1. price + specs on ONE baseline row (the space-saving move)
 *   2. address · city, state zip — one muted line
 *   3. up to three tag pills, no icons — drop-whole instead of truncate
 *   4. "Explore home →" — 46pt solid pill
 *
 * ── 2026-08-13 owner revision (「内嵌白色卡片感 + 右下角 explore link + 右上
 *    saved icon + swipe hint」) ────────────────────────────────────────────────
 *
 *   · The media box gets `margin` from the card container (feed.tsx
 *     CardContainer padding), so the video reads as an embedded white card:
 *     paper shows around it and the white text block frames the media.
 *   · The giant green CTA pill is gone. "Explore home →" is now a right-
 *     aligned link row in the text block, tap-detected by the stack's
 *     exclusive-tap gesture (`tapSlot`), not by a nested Pressable — a
 *     Pressable inside the pan gesture area silently stops firing (RNGH
 *     #3172), so the tap is detected in the pan's own `onEnd`.
 *   · A filled bookmark sits top-right over the media (owner: 「卡片右上加
 *     saved icon」). It toggles the saved store.
 *
 * The tag pills replace the old icon chips: no emoji/glyph, and when the row
 * cannot seat all three, the third pill is dropped ENTIRELY rather than
 * ellipsized (an ellipsis on a pill reads as broken copy).
 *
 * The LISTING pill over the media is now a frosted badge at top-left 12/12.
 *
 * ── Video is untouched (owner: 「视频部分不用改」) ───────────────────────────
 *
 * `CardVideo` still receives `fit="cover"`, still keys off `isTop`. The box
 * it sits in is now taller, so a 1080×1080 render in a taller card crops the
 * top and bottom rather than letterboxing — which is what `cover` is for and
 * what the redline's "full bleed / object-fit: cover" asks for by name.
 *
 * ── What is NOT invented ────────────────────────────────────────────────────
 *
 * The card renders the card's real fields: `priceLabel`, `bedBathSqft`, the
 * merged address row, and `dims` mapped through the shared `DIMS` vocabulary
 * for the tag pills. A listing with no dims renders no tags. Nothing on this
 * card is generated to fill the redline's shape.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { abbreviateAddress } from "../../lib/feed/abbreviate-address";
import type { ListingCardV3 } from "../../lib/feed/card-types";
import type { TapSlot } from "../../lib/gesture/tap-slot";
import { useSavedStore } from "../../state/saved";
import { fonts, redline, redlineRadii } from "../../theme/tokens";
import { redlineText } from "../../theme/typography";
import { CardPhoto } from "../CardPhoto";
import { CardVideo } from "../CardVideo";
import type { RedlineIconName } from "./redline/RedlineChrome";

/**
 * Geometry lives in `theme/listing-layout.ts` as plain data so
 * `theme/listing-layout.test.ts` can assert it without importing react-native.
 * `theme/listing-geometry.ts` carries the OLD proportional split (0.618 hero /
 * 0.382 panel); this face no longer uses it — the geometry test was rewritten
 * to assert the new flex layout.
 */
import {
	DIVIDER_HEIGHT,
	MAX_TAGS,
	TAG_PILL_HEIGHT,
	textBlock as geo,
	media as mediaGeo,
} from "../../theme/listing-layout";

/**
 * Which line icon stands for which preference dimension.
 *
 * A full `Record`, not `Partial` — the community card had exactly this bug: with
 * a partial map plus a `?? "walk"` fallback, every unmapped dim silently drew a
 * walking figure, so a chip reading "Move-in Ready" showed a pedestrian. Typing
 * it as a complete `Record` makes an unmapped dim a compile error instead.
 *
 * The tag pills no longer render icons (2026-08-13 redesign: 「去掉 emoji 图标」),
 * but the map stays for the detail screens that still use `DIM_ICON`.
 */
const DIM_ICON: Record<DimKey, RedlineIconName> = {
	family: "family",
	walkable: "walk",
	schools: "school",
	outdoors: "tree",
	trails: "path",
	quiet: "moon",
	hip: "shop",
	entertaining: "cup",
	move_in: "check",
	space: "expand",
	nightlife: "cup",
};

/**
 * The card's ink scale (owner, 2026-08-14). Three steps, near-black to muted:
 * price / specs / address. These are DELIBERATELY local to this file rather
 * than an edit to `redline.ink` / `ink2` / `ink3` (#171715 / #6F6B65 /
 * #96918A) — the spec's values are close to but not the same as the redline's,
 * and the redline inks are read by every other face, so moving them globally
 * would repaint the community and insight cards to match a listing-card note.
 */
const INK = {
	/** Primary — price. Near-black, not pure black. */
	primary: "#181B18",
	/** Secondary — specs ("4 bd · 3 ba · 2,853 sqft"). */
	secondary: "#535952",
	/**
	 * Tertiary — the address. Sits between `secondary` and the old #92968F
	 * (owner, 2026-08-14: the address was too light to read comfortably). It
	 * still steps down from the specs, so the row reads as metadata rather than
	 * as a second headline.
	 */
	tertiary: "#6E746F",
} as const;

/** The bookmark disc's target id, written into `tapSlot` on touch start. */
export const SAVE_TAP_TARGET = "save";
/** The explore link's target id, written into `tapSlot` on touch start. */
export const EXPLORE_TAP_TARGET = "explore";

interface ListingFaceProps {
	card: ListingCardV3;
	isTop: boolean;
	onExplore?: () => void;
	/**
	 * The stack's tap slots (see `lib/gesture/tap-slot.ts`). Interactive
	 * targets on this face write their id into `tapSlot` on touch start; the
	 * pan's `onEnd` reads it to decide whether the release was a tap. Absent
	 * when the face renders outside the feed stack (dev-foundation), where
	 * nothing can be tapped.
	 */
	tapSlot?: SharedValue<TapSlot>;
}

export function ListingFace({
	card,
	isTop,
	onExplore,
	tapSlot,
}: ListingFaceProps) {
	/** Tag labels — no icons. See `CHIP_LABEL` for the copy. */
	const tags = (card.dims ?? []).slice(0, MAX_TAGS);
	/** Row 2: "355 Morgans Creek Ct · Kennesaw, GA 30144". */
	const place = [abbreviateAddress(card.address), card.locality, card.zip]
		.filter(Boolean)
		.join(" · ");

	const saved = useSavedStore((s) => s.isSaved(card.id));
	const toggleSaved = useSavedStore((s) => s.toggle);

	/**
	 * Touch-start handler shared by the two interactive targets. Writes the
	 * target id into `tapSlot` so the pan's `onEnd` can recognise the release
	 * as a tap on it. No gate here: at touch-down `tapStatus.active` is still
	 * false (the tap gesture's `onTouchesDown` fires after React's
	 * `onTouchStart`), so checking it would never arm. The swipe-vs-tap
	 * decision is made at RELEASE in the pan's `onEnd` (`isTapEnd`), which is
	 * where `tapStatus` actually matters.
	 */
	const arm = (target: string) => () => {
		if (!tapSlot) return;
		tapSlot.value = { target };
	};

	return (
		<View style={styles.face}>
			{/* Media — flex:1, eats every remaining point above the text block */}
			<View style={styles.media}>
				{card.videoUrl ? (
					<CardVideo
						url={card.videoUrl}
						poster={card.heroUrl}
						isTop={isTop}
						fit="cover"
					/>
				) : (
					<CardPhoto url={card.heroUrl} />
				)}
				<View style={styles.badgeSlot}>
					<View style={styles.badge}>
						<Text style={styles.badgeLabel}>LISTING</Text>
					</View>
				</View>
				{/* Save bookmark — top-right over the media (owner 2026-08-13). */}
				<View style={styles.saveSlot}>
					<Pressable
						onTouchStart={arm(SAVE_TAP_TARGET)}
						accessibilityRole="button"
						accessibilityLabel={saved ? "Saved" : "Save"}
						hitSlop={12}
						style={({ pressed }) => [
							styles.saveDisc,
							pressed && styles.savePressed,
						]}
					>
						<BookmarkIcon saved={saved} />
					</Pressable>
				</View>
			</View>

			{/* Text block — natural height, target ≤ 190pt */}
			<View style={styles.block}>
				<View style={styles.row1}>
					<Text style={styles.price} numberOfLines={1}>
						{card.priceLabel}
					</Text>
					{!!card.bedBathSqft && (
						<Text style={styles.specs} numberOfLines={1}>
							{card.bedBathSqft}
						</Text>
					)}
				</View>
				{!!place && (
					<Text style={styles.address} numberOfLines={1}>
						{place}
					</Text>
				)}
				{tags.length > 0 && (
					<View style={styles.tags}>
						{tags.map((dim) => (
							<View key={dim} style={styles.tag}>
								<Text style={styles.tagLabel} numberOfLines={1}>
									{CHIP_LABEL[dim]}
								</Text>
							</View>
						))}
					</View>
				)}
				{/*
				 * Hairline under the chips (owner 2026-08-14). Gated on the CTA, not
				 * on the tags: its job is to separate the facts from the action, so
				 * without an explore row it would be a rule hanging off the bottom of
				 * the block. A listing with no dims still gets it — it then divides
				 * the address from the link.
				 */}
				{!!onExplore && (
					<>
						<View style={styles.divider} />
						<View style={styles.ctaRow}>
							<Pressable
								onTouchStart={arm(EXPLORE_TAP_TARGET)}
								accessibilityRole="link"
								accessibilityLabel="Explore home"
								hitSlop={12}
								style={({ pressed }) => [
									styles.exploreLink,
									pressed && styles.explorePressed,
								]}
							>
								<Text style={styles.exploreLabel}>Explore home</Text>
								<ArrowRightIcon />
							</Pressable>
						</View>
					</>
				)}
			</View>
		</View>
	);
}

/**
 * ── Outline icon art (owner, 2026-08-14) ────────────────────────────────────
 *
 * The two icons on this card are Lucide-style OUTLINES: a thin arrow after
 * "Explore home" and a white bookmark on the save disc. Neither can come from
 * the icon font — the Phosphor subset this project ships carries FILL weights
 * only (see `redline/icon-font.ts`), which is what made the old arrow read as a
 * thick wedge and the saved bookmark a solid green blob. `react-native-svg` is
 * not an option either: it red-screens in Expo Go on this project (DEVLOG
 * 2026-07-30 04:55).
 *
 * So they are composed from bordered `View`s, the way `RedlineChrome`'s
 * `HeartIcon` has always been. The numbers below are Lucide's own 24-grid
 * geometry scaled to the target size rather than eyeballed:
 *
 *   arrow-right  shaft (5,12)→(19,12), head corners (12,5)-(19,12)-(12,19)
 *   bookmark     body x 5..19, y 3..21, notch tip (12,16)
 *
 * A 45°-rotated square with only its top and right borders IS the arrowhead —
 * the same trick the heart's tail uses. Both icons are single-size and
 * single-colour, so the geometry lives in the StyleSheet below as constants
 * rather than as props.
 */
const OUTLINE_STROKE = 1.75;

const ARROW_SIZE = 16;
const ARROW_K = ARROW_SIZE / 24;
/** Side of the rotated square whose top+right borders draw the arrowhead. */
const ARROW_HEAD = 7 * ARROW_K * Math.SQRT2;

/** 16 (was 18) — the disc shrank to 32 with it (owner, 2026-08-14). */
const BOOKMARK_SIZE = 16;
const BOOKMARK_K = BOOKMARK_SIZE / 24;
const BM_LEFT = 5 * BOOKMARK_K;
const BM_WIDTH = 14 * BOOKMARK_K;
const BM_TOP = 3 * BOOKMARK_K;
const BM_BOTTOM = 21 * BOOKMARK_K;
/** Where the V bites into the bottom edge. */
const BM_NOTCH = 16 * BOOKMARK_K;
const BM_RUN = BM_WIDTH / 2;
const BM_RISE = BM_BOTTOM - BM_NOTCH;
const BM_DIAG = Math.hypot(BM_RUN, BM_RISE);
const BM_ANGLE = (Math.atan2(BM_RISE, BM_RUN) * 180) / Math.PI;

/** The arrow after "Explore home". 16pt, 1.75 stroke, accent green. */
function ArrowRightIcon() {
	return (
		<View style={styles.arrowBox}>
			<View style={styles.arrowShaft} />
			<View style={styles.arrowHead} />
		</View>
	);
}

/**
 * The save bookmark. White outline in both states (owner: 「去掉绿色 icon」);
 * saved additionally fills the body, which is the classic outline-vs-filled
 * bookmark distinction and the only signal left once the green is gone.
 */
function BookmarkIcon({ saved }: { saved: boolean }) {
	return (
		<View style={styles.bookmarkBox}>
			{saved && <View style={styles.bookmarkFill} />}
			<View style={styles.bookmarkTop} />
			<View style={[styles.bookmarkSide, styles.bookmarkSideLeft]} />
			<View style={[styles.bookmarkSide, styles.bookmarkSideRight]} />
			<View style={[styles.bookmarkDiag, styles.bookmarkDiagLeft]} />
			<View style={[styles.bookmarkDiag, styles.bookmarkDiagRight]} />
		</View>
	);
}

/**
 * Tag copy. `DIMS[dim].label` is written for prose ("outdoor space", "top
 * schools") and reads wrong in Title Case inside a 10.5pt pill, which the
 * 2026-08-13 demo sets in Title Case ("Top Schools"). These are the same dims,
 * capitalised for the pill — not new claims about the listing.
 */
const CHIP_LABEL: Record<DimKey, string> = {
	outdoors: "Private Backyard",
	walkable: "Walkable",
	schools: "Top Schools",
	quiet: "Quiet Streets",
	hip: "Cultural Scene",
	entertaining: "Great for Hosting",
	trails: "Trails Nearby",
	nightlife: "Nightlife",
	family: "Family Friendly",
	move_in: "Move-in Ready",
	space: "Spacious",
};

const styles = StyleSheet.create({
	/** `--card` (#FFFDF9), not the old `scoreTokens.face`. */
	face: { flex: 1, backgroundColor: redline.card },
	/**
	 * Media — `flex: 1` makes it absorb every point the text block does not
	 * use; `minHeight: 0` lets flexbox give it zero rather than fighting the
	 * block's natural height. No aspectRatio, no fixed height (owner
	 * 2026-08-13: 「媒体吃掉所有剩余高度」).
	 *
	 * Inset by `mediaGeo` (owner 2026-08-14): white card paper shows above and
	 * beside the video, and its left/right edges line up with the text block's
	 * 18pt padding, so the two read as ONE card instead of a video with a
	 * separate white panel stuck under it. `overflow: hidden` is what makes the
	 * rounded corners actually clip the player.
	 */
	media: { flex: 1, minHeight: 0, overflow: "hidden", ...mediaGeo },
	badgeSlot: { position: "absolute", top: 12, left: 12, zIndex: 2 },
	/** Frosted LISTING badge — rgba(255,255,255,0.92), radius 20. */
	badge: {
		alignSelf: "flex-start",
		backgroundColor: "rgba(255,255,255,0.92)",
		borderRadius: redlineRadii.badge,
		paddingVertical: 5,
		paddingHorizontal: 11,
		overflow: "hidden",
	},
	/**
	 * Neutral ink, NOT green (owner 2026-08-14, reversing the 08-13 pass).
	 * Green is now reserved for interactive / selected state; the badge is a
	 * static label, so colouring it accent made the card's one action colour
	 * mean nothing.
	 */
	badgeLabel: { ...redlineText.listingCard.badge, color: INK.primary },
	/** Save bookmark disc — top-right over the media (owner 2026-08-13). */
	saveSlot: { position: "absolute", top: 12, right: 12, zIndex: 2 },
	/**
	 * 32pt frosted disc (owner 2026-08-14, 34 in the pass before) — a translucent
	 * dark fill with a light hairline, replacing the solid white one that read as
	 * a sticker.
	 *
	 * The spec asks for `backdrop-filter: blur(8px)`, which React Native has no
	 * style for; it needs `expo-blur`, a new dependency, so it is deliberately
	 * NOT here. Over a photo the 42%-dark fill plus the 18%-white rim already
	 * reads as frosted, and the icon inside is white either way.
	 */
	saveDisc: {
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: "rgba(20,24,22,0.42)",
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.18)",
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
	},
	savePressed: { opacity: 0.7 },
	/**
	 * Text block — natural height (no flex), the redesign's ≤190pt budget.
	 * `geo` owns padding and row margins (see `theme/listing-layout.ts`).
	 */
	block: geo.block,
	/** Row 1 — price + specs on ONE baseline row (the space-saving key). */
	row1: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "baseline",
	},
	/**
	 * The price is the card's anchor — the CTA must not out-weight it. Weight
	 * steps down 700 → 600 (owner 2026-08-14: the 700 read as shouting at 31pt);
	 * the size is unchanged. Overridden here rather than in
	 * `redlineText.listingCard.price` so the token stays the redline's number.
	 */
	price: {
		...redlineText.listingCard.price,
		fontWeight: "600",
		color: INK.primary,
	},
	/**
	 * "4 bd · 3 ba · 2,853 sqft" — 12.5/600, one line.
	 *
	 * Lifted 2pt (owner, 2026-08-14). Row 1 aligns the two texts on their
	 * BASELINES, which is typographically right and optically wrong here: the
	 * price is 31pt and the specs 12.5pt, so a shared baseline hangs the small
	 * text off the bottom of the big one. The nudge splits the difference
	 * without giving up the baseline row.
	 */
	specs: {
		...redlineText.listingCard.specs,
		color: INK.secondary,
		transform: [{ translateY: -2 }],
	},
	/** Row 2 — "355 Morgans Creek Ct · Kennesaw, GA 30144", one muted line. */
	address: {
		...redlineText.listingCard.address,
		color: INK.tertiary,
		...geo.address,
	},
	/**
	 * Tag pills — no icons, no ellipsis. `flexWrap: nowrap` + the drop-whole
	 * logic in the component body: when three do not fit, the third is removed
	 * rather than truncated.
	 */
	tags: {
		flexDirection: "row",
		flexWrap: "nowrap",
		gap: 6,
		...geo.tags,
	},
	/**
	 * Radius 9, not `redlineRadii.tag` (14) — at 21pt tall a 14 is a full
	 * capsule, and the owner's 2026-08-14 note is explicit that these are
	 * "light tinted rectangles, not capsule candy". The tint lightens with it
	 * (#EFE9DE → #F4F2ED) so the row recedes behind the price.
	 */
	tag: {
		height: TAG_PILL_HEIGHT,
		paddingHorizontal: 9,
		borderRadius: 9,
		backgroundColor: "#F4F2ED",
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	tagLabel: { ...redlineText.listingCard.tag, color: "#3E4744" },
	/**
	 * Hairline between the chips and the explore link. 8% ink — visible as a
	 * change of tone, not as a rule. Height comes from `listing-layout` because
	 * it is part of the block's ≤190pt arithmetic.
	 */
	divider: {
		height: DIVIDER_HEIGHT,
		backgroundColor: "rgba(24,27,24,0.08)",
		...geo.divider,
	},
	/**
	 * Explore link row — right-aligned, bottom of the text block. The owner's
	 * 2026-08-13 revision dropped the giant 46pt green pill for a quiet link
	 * ("右下角的 explore link"). Tap-detected via `tapSlot`, not Pressable.
	 */
	ctaRow: {
		flexDirection: "row",
		justifyContent: "flex-end",
		alignItems: "center",
		...geo.ctaSlot,
	},
	exploreLink: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minHeight: 44, // §0.5 touch floor
		paddingHorizontal: 4,
	},
	explorePressed: { opacity: 0.7 },
	exploreLabel: {
		...redlineText.listingCard.cta,
		color: redline.accent,
	},

	// ─── Outline icon art (see the block above CHIP_LABEL) ────────────────
	arrowBox: { width: ARROW_SIZE, height: ARROW_SIZE },
	arrowShaft: {
		position: "absolute",
		left: 5 * ARROW_K,
		width: 14 * ARROW_K,
		top: (ARROW_SIZE - OUTLINE_STROKE) / 2,
		height: OUTLINE_STROKE,
		borderRadius: OUTLINE_STROKE / 2,
		backgroundColor: redline.accent,
	},
	/**
	 * Lucide's head is the (12,5)-(19,12)-(12,19) corner, i.e. a square centred
	 * in the box, rotated 45°, wearing only its top and right borders.
	 */
	arrowHead: {
		position: "absolute",
		left: (ARROW_SIZE - ARROW_HEAD) / 2,
		top: (ARROW_SIZE - ARROW_HEAD) / 2,
		width: ARROW_HEAD,
		height: ARROW_HEAD,
		borderTopWidth: OUTLINE_STROKE,
		borderRightWidth: OUTLINE_STROKE,
		borderColor: redline.accent,
		borderTopRightRadius: OUTLINE_STROKE,
		transform: [{ rotate: "45deg" }],
	},

	bookmarkBox: { width: BOOKMARK_SIZE, height: BOOKMARK_SIZE },
	/** Saved: the body filled down to the notch tip. */
	bookmarkFill: {
		position: "absolute",
		left: BM_LEFT + OUTLINE_STROKE,
		top: BM_TOP + OUTLINE_STROKE,
		width: BM_WIDTH - OUTLINE_STROKE * 2,
		height: BM_NOTCH - BM_TOP - OUTLINE_STROKE,
		backgroundColor: redline.onPhoto,
	},
	bookmarkTop: {
		position: "absolute",
		left: BM_LEFT,
		top: BM_TOP,
		width: BM_WIDTH,
		height: OUTLINE_STROKE,
		borderRadius: OUTLINE_STROKE / 2,
		backgroundColor: redline.onPhoto,
	},
	bookmarkSide: {
		position: "absolute",
		top: BM_TOP,
		width: OUTLINE_STROKE,
		height: BM_BOTTOM - BM_TOP,
		borderRadius: OUTLINE_STROKE / 2,
		backgroundColor: redline.onPhoto,
	},
	bookmarkSideLeft: { left: BM_LEFT },
	bookmarkSideRight: { left: BM_LEFT + BM_WIDTH - OUTLINE_STROKE },
	/** The V: two bars rotated about their own centres onto the notch's legs. */
	bookmarkDiag: {
		position: "absolute",
		top: (BM_BOTTOM + BM_NOTCH) / 2 - OUTLINE_STROKE / 2,
		width: BM_DIAG,
		height: OUTLINE_STROKE,
		borderRadius: OUTLINE_STROKE / 2,
		backgroundColor: redline.onPhoto,
	},
	bookmarkDiagLeft: {
		left: BM_LEFT + BM_RUN / 2 - BM_DIAG / 2,
		transform: [{ rotate: `${-BM_ANGLE}deg` }],
	},
	bookmarkDiagRight: {
		left: BM_LEFT + BM_WIDTH - BM_RUN / 2 - BM_DIAG / 2,
		transform: [{ rotate: `${BM_ANGLE}deg` }],
	},
});
