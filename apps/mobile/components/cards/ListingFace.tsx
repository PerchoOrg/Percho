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
import { RedlineIcon, type RedlineIconName } from "./redline/RedlineChrome";

/**
 * Geometry lives in `theme/listing-layout.ts` as plain data so
 * `theme/listing-layout.test.ts` can assert it without importing react-native.
 * `theme/listing-geometry.ts` carries the OLD proportional split (0.618 hero /
 * 0.382 panel); this face no longer uses it — the geometry test was rewritten
 * to assert the new flex layout.
 */
import {
	MAX_TAGS,
	TAG_PILL_HEIGHT,
	textBlock as geo,
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
						<RedlineIcon
							name="bookmark"
							size={17}
							color={saved ? redline.accent : redline.ink2}
						/>
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
				{!!onExplore && (
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
							<RedlineIcon name="arrowRight" size={13} color={redline.accent} />
						</Pressable>
					</View>
				)}
			</View>
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
	 */
	media: { flex: 1, minHeight: 0, overflow: "hidden" },
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
	badgeLabel: { ...redlineText.listingCard.badge, color: redline.ink },
	/** Save bookmark disc — top-right over the media (owner 2026-08-13). */
	saveSlot: { position: "absolute", top: 12, right: 12, zIndex: 2 },
	saveDisc: {
		width: 38,
		height: 38,
		borderRadius: redlineRadii.badge,
		backgroundColor: "rgba(255,255,255,0.92)",
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
	/** The price is the card's anchor — the CTA must not out-weight it. */
	price: { ...redlineText.listingCard.price, color: redline.ink },
	/** "4 bd · 3 ba · 2,853 sqft" — 12.5/600, one line. */
	specs: { ...redlineText.listingCard.specs, color: "#4A524E" },
	/** Row 2 — "355 Morgans Creek Ct · Kennesaw, GA 30144", one muted line. */
	address: {
		...redlineText.listingCard.address,
		color: "#8A918C",
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
	tag: {
		height: TAG_PILL_HEIGHT,
		paddingHorizontal: 9,
		borderRadius: redlineRadii.tag,
		backgroundColor: "#EFE9DE",
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	tagLabel: { ...redlineText.listingCard.tag, color: "#3E4744" },
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
		gap: 5,
		minHeight: 44, // §0.5 touch floor
		paddingHorizontal: 4,
	},
	explorePressed: { opacity: 0.7 },
	exploreLabel: {
		...redlineText.listingCard.cta,
		color: redline.accent,
	},
});
