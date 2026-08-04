/**
 * Section nav strip model (`02-listing.md` §2.4 #2).
 *
 * The spec's chip row is "Overview · Kitchen · Yard · Monthly · Community ·
 * Comps", and it explicitly says **实际 section 由 hotspot 数据生成** — so the
 * strip is not a fixed list. A listing with no tagged kitchen photo must not show
 * a Kitchen chip that scrolls to nothing.
 *
 * Two things live here rather than in the screen, because both are the kind of
 * thing that is wrong-by-one and invisible on device:
 *   - which chips exist, in the spec's order, given what this listing has;
 *   - which chip is "current" for a given scroll offset (§2.4 #2: 当前区高亮
 *     跟随滚动).
 *
 * Pure. No React, no measurement — offsets are handed in by the caller's
 * `onLayout`, which is the only place they exist.
 */

import type { Hotspot, HotspotRoom } from "./hotspot";

/**
 * A chip's target. `overview` / `monthly` / `comps` / `costs` / `community` are
 * the fixed sections (they share `SectionId` with the focus-key vocabulary);
 * `hotspot:<id>` addresses one generated room section.
 *
 * Rooms are keyed by HOTSPOT ID, not by room name: a listing can carry two
 * bedroom hotspots, and merging them under one "Bedroom" chip would make the
 * chip scroll to whichever section happened to lay out last.
 */
export type NavTarget =
	| { kind: "section"; id: FixedSectionId }
	| { kind: "hotspot"; id: string; room: HotspotRoom };

export type FixedSectionId =
	| "overview"
	| "monthly"
	| "comps"
	| "community"
	| "costs";

export interface NavChip {
	/** Stable React key AND the scroll-offset key the screen registers under. */
	key: string;
	/** Chip copy. Title Case, as the mockup sets it. */
	label: string;
	target: NavTarget;
}

/** Chip label per room. Title Case; the mockup's "Yard" for a backyard. */
const ROOM_LABEL: Record<HotspotRoom, string> = {
	kitchen: "Kitchen",
	living: "Living",
	dining: "Dining",
	bedroom: "Bedroom",
	bathroom: "Bath",
	office: "Office",
	backyard: "Yard",
	pool: "Pool",
	balcony: "Balcony",
	garage: "Garage",
	basement: "Basement",
	exterior: "Exterior",
};

/** The offset key for a chip's target — the contract with the screen. */
export function navKey(target: NavTarget): string {
	return target.kind === "section" ? target.id : `hotspot:${target.id}`;
}

export interface NavInput {
	hotspots: readonly Hotspot[];
	/** Whether each fixed section is actually rendered for this listing. */
	hasMonthly: boolean;
	hasComps: boolean;
	hasCosts: boolean;
	hasCommunity: boolean;
}

/**
 * Builds the chip row in the spec's order: Overview, then the room sections in
 * hotspot order, then Monthly, Community, Comps, Costs.
 *
 * Overview is unconditional — it is where the page opens, and a strip that can
 * scroll away from its own start with no way back is worse than no strip.
 * Everything else appears only when its section does, which is why the flags are
 * parameters instead of being re-derived here: the screen already decides them,
 * and two places computing the same visibility is how a chip ends up pointing at
 * a section that isn't on the page.
 */
export function buildNavChips(input: NavInput): NavChip[] {
	const chips: NavChip[] = [
		{
			key: "overview",
			label: "Overview",
			target: { kind: "section", id: "overview" },
		},
	];

	for (const hotspot of input.hotspots) {
		const target: NavTarget = {
			kind: "hotspot",
			id: hotspot.id,
			room: hotspot.room,
		};
		chips.push({
			key: navKey(target),
			label: ROOM_LABEL[hotspot.room],
			target,
		});
	}

	const fixed: [boolean, FixedSectionId, string][] = [
		[input.hasMonthly, "monthly", "Monthly"],
		[input.hasCommunity, "community", "Community"],
		[input.hasComps, "comps", "Comps"],
		[input.hasCosts, "costs", "Costs"],
	];
	for (const [present, id, label] of fixed) {
		if (!present) continue;
		chips.push({ key: id, label, target: { kind: "section", id } });
	}

	// A one-chip strip is chrome with no function: it can only ever point at
	// where the buyer already is. Returning [] lets the screen omit the row.
	return chips.length > 1 ? chips : [];
}

/**
 * Which chip is current at a given scroll position (§2.4 #2).
 *
 * "Current" = the LAST section whose top has passed the activation line, so the
 * highlight changes as a heading reaches the top of the viewport rather than
 * when it first peeks in from the bottom. Sections with no recorded offset are
 * skipped: an unlaid-out section has no position, and treating a missing offset
 * as 0 would make every chip look current on first paint.
 *
 * `activationOffsetPx` exists because the strip itself covers the top of the
 * scroll view; the caller passes its height so the line sits under the chips.
 */
export function currentNavKey(
	chips: readonly NavChip[],
	offsets: Readonly<Record<string, number | undefined>>,
	scrollY: number,
	activationOffsetPx = 0,
): string | null {
	if (chips.length === 0) return null;
	const line = scrollY + activationOffsetPx;
	let current: string | null = null;
	let bestY = Number.NEGATIVE_INFINITY;
	for (const chip of chips) {
		const y = offsets[chip.key];
		if (y === undefined) continue;
		// `<=` so a section flush with the line counts as reached.
		if (y <= line && y >= bestY) {
			bestY = y;
			current = chip.key;
		}
	}
	// Above the first measured section: the first chip is current, which is what
	// a buyer at the top of the page sees.
	if (current !== null) return current;
	const first = chips[0];
	return first ? first.key : null;
}
