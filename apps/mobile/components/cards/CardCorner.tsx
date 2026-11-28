/**
 * The card's top-right control (phase175, owner pick "H1").
 *
 * ── What this replaces and why ──────────────────────────────────────────────
 *
 * The feed had no way to mute a playing tour until phase140 put one back next
 * to the bookmark. Two round discs drew the owner's objection — 「右上两个
 * button 很奇怪」 — so the two controls became ONE object. That capsule
 * shipped, and on device it read wrong for two reasons the demo frames at
 * `percho.co/demos/card-corner-v2` isolate (H0 is a replica of it):
 *
 *   1. **Two sizes of white on one row.** The capsule was 37pt tall next to a
 *      ~26pt LISTING badge — same material, same 12pt inset, different height.
 *      The mismatch reads before either glyph does. So the control is now the
 *      badge's twin: `CORNER_HEIGHT` is the badge's own height and the fill is
 *      the badge's own `rgba(255,255,255,0.92)`.
 *   2. **The glyphs were not glyphs.** Both were built from bordered `View`s at
 *      Lucide geometry, because neither icon font carried a speaker. At 17pt
 *      the speaker's 2.8pt-wide box with a 1.75pt border on each side closed
 *      into a blob, and the bookmark's notch was two rotated bars with a seam.
 *      Real Phosphor glyphs ship now — `soundOn` / `soundOff` / `bookmark` were
 *      added to both weights of the redline subset (2026-09-05), so this file
 *      draws no art at all.
 *
 * The save glyph is `bookmark-simple`, chosen on 2026-09-05 to be
 * `TAB_BAR_GLYPH.saved` — the Saved tab's own drawing — so the control and the
 * tab it saves into were one shape.
 *
 * That is no longer true and the claim is kept here only to date it: phase177
 * shipped the new tab bar the SAME DAY and `TAB_BAR_GLYPH.saved` became a
 * HEART. The bookmark is still right — phase260 made every save control in the
 * app wear it, and `SaveGlyph` argues why the heart cannot be the mark — but
 * the tab is now the one surface that disagrees. Owner's call, since he picked
 * that four-glyph set.
 *
 * ── Both faces carry both controls again (phase174) ─────────────────────────
 *
 * The community card used to carry only the speaker, dropped below the badge's
 * line: its bookmark was removed on 2026-08-20 because the tour video BURNED a
 * place-name pill into that corner and a disc sat on top of it. phase174 moved
 * that label out of the pixels and onto the card, so the corner is free — owner
 * 2026-09-05: "keep the sound and saved button on the top right to be
 * consistent with listing". The `top` prop and its community override went with
 * it; every face puts one object at 12/12.
 *
 * A face with only ONE control is still a plain disc of the same height — that
 * is what a photo-only card (no film to mute) renders.
 *
 * ── Share joins the same object (phase335) ──────────────────────────────────
 *
 * Owner: "feed卡右上角分享按键" — an agent sends a community or city card to a
 * buyer straight from the deck. It is a third cell in the SAME pill, after the
 * bookmark, not a second disc beside it: two objects in this corner is exactly
 * what phase175 removed.
 *
 * ── Dark glass (phase367.2) ─────────────────────────────────────────────────
 *
 * The capsule was the badge's white twin, and with the place pill, the
 * COMMUNITY tag and Explore that made four white pills on one card, of which
 * one is the next thing to press. Owner, off `/demos/ui-accent-v1`: 「都做」 —
 * the controls and the labels step back to dark glass and white glyphs, and
 * Explore keeps the white. The capsule still matches its neighbour in the
 * other corner: same fill, same height.
 *
 * ── Separate discs in one row (phase393 → phase394) ──────────────────────────
 *
 * Owner 2026-11-24: 「静音 收藏 分享当个按钮贴在一起 又小又难看 重新设计这几个
 * 按键以及在card上的分布」. Three 15pt glyphs in one 26pt pill were one small
 * object with no edges between its parts. Every control is now its own 36pt
 * disc with a 19pt glyph, 8pt apart — nothing shares a container.
 *
 * phase393 also moved save and share down over Explore. The owner, off
 * `/demos/card-actions-v1`, picked "C": all three stay up here in one row.
 * The bottom-right alternative ran into the city film's rail of parts, and
 * the same control in two places on two kinds of card read as inconsistent.
 * The cost is the place pill in the other corner, which loses ~75pt — the
 * community face drops the pill's distance first when the name is long.
 *
 * ── A fourth disc: the cross (phase414) ─────────────────────────────────────
 *
 * A swipe stopped being a verdict (owner, 2026-11-27: 「滑走不一定不喜欢」), so
 * "not for me" needs a control of its own, and he asked for one (「要x」). It
 * is the last disc in the row — the corner a dismiss sits in everywhere, and
 * the far side of the card from the thumb, which a control that takes a card
 * away should be. The heart stays where it is and is the like now as well as
 * the save. Only the feed's cards pass `hide`; the explore page's hero has
 * nothing to dismiss.
 *
 * The cross is two bars: neither weight of the icon font carries one.
 */
import { Pressable, StyleSheet, View } from "react-native";
import { redline } from "../../theme/tokens";
import { RedlineIcon, type RedlineIconName } from "./redline/RedlineChrome";

/** Glyph colour, shared with the label in the other corner. */
const INK = redline.onPhoto;

/** One control's disc. Under Apple's 44pt on its own; the slop makes it up. */
export const CORNER_DISC = 36;
/** The row's distance from the card's top and right edges. */
export const CORNER_INSET = 12;
/** Air between two discs; half of it is each disc's horizontal hit slop. */
export const CORNER_GAP = 8;
/** Glyph size — a little over half the disc. */
const GLYPH = 19;
/** The cross's box, and its bars' weight — the outline glyphs' own stroke. */
const CROSS = 13;
const CROSS_STROKE = 1.75;
const SLOP = {
	top: 8,
	bottom: 8,
	left: CORNER_GAP / 2,
	right: CORNER_GAP / 2,
};

/**
 * One control. `onTouchStart` arms the stack's `tapSlot` (the face owns the
 * target ids); when it is absent — outside the swipe stack, as on
 * dev-foundation — `onPress` runs directly, exactly as the discs did.
 */
interface CornerControl {
	onPress: () => void;
	onTouchStart?: () => void;
}

interface CardCornerProps {
	/**
	 * Present when the card has a film to mute. A photo-only card shows no
	 * speaker rather than a control that promises audio it does not have.
	 */
	sound?: CornerControl & { on: boolean };
	/** Present when the card is saveable. */
	save?: CornerControl & { saved: boolean };
	/** Present when the card has a page to send someone to (phase335). */
	share?: CornerControl;
	/** Present when the card can be hidden from the deck (phase414). */
	hide?: CornerControl;
	/**
	 * Lay the row out in place instead of pinning it to the card's top-right.
	 * The explore page's hero puts the same row in its own nav bar
	 * (phase401), so the controls look and sit the same on both screens.
	 */
	inline?: boolean;
}

function Disc({
	control,
	label,
	name,
	weight = "outline",
	color = INK,
}: {
	control: CornerControl;
	label: string;
	/** The glyph, or absent for the one control the font has no glyph for. */
	name?: RedlineIconName;
	weight?: "outline" | "fill";
	color?: string;
}) {
	return (
		<Pressable
			onTouchStart={control.onTouchStart}
			onPress={control.onTouchStart ? undefined : control.onPress}
			accessibilityRole="button"
			accessibilityLabel={label}
			hitSlop={SLOP}
			style={({ pressed }) => [styles.disc, pressed && styles.pressed]}
		>
			{name ? (
				<RedlineIcon
					name={name}
					size={GLYPH}
					color={color}
					weight={weight}
					// Every glyph here sits beside, or swaps with, an outline one.
					matchOutline
				/>
			) : (
				<View style={styles.cross}>
					<View style={[styles.crossBar, styles.crossDown]} />
					<View style={[styles.crossBar, styles.crossUp]} />
				</View>
			)}
		</Pressable>
	);
}

/** The top-right corner: mute, save, share and hide, each its own disc, in a row. */
export function CardCorner({
	sound,
	save,
	share,
	hide,
	inline = false,
}: CardCornerProps) {
	if (!sound && !save && !share && !hide) return null;
	return (
		<View style={[styles.row, !inline && styles.pinned]}>
			{sound && (
				<Disc
					control={sound}
					label={sound.on ? "Mute" : "Unmute"}
					name={sound.on ? "soundOn" : "soundOff"}
				/>
			)}
			{/* Saved fills the heart — outline → fill is the bit `SaveGlyph`
			    signals with everywhere else — and turns it red (gold until the
			    owner's 「爱心是红色」). Heart and the
			    paper-plane share since phase395 (owner pick off
			    `/demos/card-icons-v2`). */}
			{save && (
				<Disc
					control={save}
					label={save.saved ? "Saved" : "Save"}
					name="heart"
					weight={save.saved ? "fill" : "outline"}
					{...(save.saved ? { color: redline.saved } : {})}
				/>
			)}
			{share && <Disc control={share} label="Share" name="share" />}
			{hide && <Disc control={hide} label="Not for me" />}
		</View>
	);
}

/** The look of one disc, for a control that sits beside the row (the hero's back button). */
export const CORNER_DISC_STYLE = {
	width: CORNER_DISC,
	height: CORNER_DISC,
	borderRadius: CORNER_DISC / 2,
	alignItems: "center",
	justifyContent: "center",
	backgroundColor: redline.photoPill,
} as const;

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: CORNER_GAP,
	},
	pinned: {
		position: "absolute",
		top: CORNER_INSET,
		right: CORNER_INSET,
		zIndex: 2,
	},
	/**
	 * The fill is the label's in the other corner. Plain translucency, no
	 * blur — expo-blur red-screens Expo Go (DEVLOG 2026-07-30; f7680a62).
	 */
	disc: CORNER_DISC_STYLE,
	pressed: { opacity: 0.7 },
	/** The cross: two bars across a box a little smaller than the glyphs. */
	cross: {
		width: CROSS,
		height: CROSS,
		alignItems: "center",
		justifyContent: "center",
	},
	crossBar: {
		position: "absolute",
		width: CROSS * Math.SQRT2 - 2,
		height: CROSS_STROKE,
		borderRadius: CROSS_STROKE / 2,
		backgroundColor: INK,
	},
	crossDown: { transform: [{ rotate: "45deg" }] },
	crossUp: { transform: [{ rotate: "-45deg" }] },
});
