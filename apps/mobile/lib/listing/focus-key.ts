/**
 * Focus keys — the deep-link vocabulary shared by the data face and the explore
 * page (`02-listing.md` §2.1 #2).
 *
 * Every row of the data face is a link: tap → push `/listing/[id]?focus=<key>`,
 * which skips the guided tour and lands on the matching explore section with a
 * 2s highlight (§2.2 note). So this file is the contract between two screens,
 * and it is pure so both can share it and it can be tested without a device.
 *
 * Two shapes exist: bare keys (`price`), and namespaced ones carrying an id
 * (`poi:<id>`, `school:<id>`). The spec's key list is closed — an unknown key is
 * REJECTED rather than ignored, because a silently dropped focus reads to the
 * user as "the app forgot what I tapped" and is invisible in QA. `parseFocus`
 * returning null is a caller's cue to render the default entry, not to guess.
 */

/** The bare keys of §2.1 #2, in the row order the data face renders them. */
export const BARE_FOCUS_KEYS = [
	"price",
	"market",
	"hoa",
	"monthly",
	"comps",
] as const;

export type BareFocusKey = (typeof BARE_FOCUS_KEYS)[number];

/** The two keys that address one specific entity rather than a section. */
export const NAMESPACED_FOCUS_KINDS = ["poi", "school"] as const;

export type NamespacedFocusKind = (typeof NAMESPACED_FOCUS_KINDS)[number];

export type Focus =
	| { kind: BareFocusKey }
	| { kind: NamespacedFocusKind; id: string };

/**
 * Section a focus scrolls to. `poi` and `school` both live in the community
 * section (§2.4 #2 builds sections from hotspot data; neighbourhood entities
 * share one), so this is a many-to-one map and NOT the same thing as the key.
 */
export type SectionId =
	| "overview"
	| "monthly"
	| "comps"
	| "community"
	| "costs";

const SECTION_OF: Record<BareFocusKey | NamespacedFocusKind, SectionId> = {
	price: "overview",
	market: "comps",
	hoa: "costs",
	monthly: "monthly",
	comps: "comps",
	poi: "community",
	school: "community",
};

export function sectionForFocus(focus: Focus): SectionId {
	return SECTION_OF[focus.kind];
}

function isBare(value: string): value is BareFocusKey {
	return (BARE_FOCUS_KEYS as readonly string[]).includes(value);
}

function isNamespacedKind(value: string): value is NamespacedFocusKind {
	return (NAMESPACED_FOCUS_KINDS as readonly string[]).includes(value);
}

/**
 * `?focus=` → Focus, or null when the value is absent or not in the closed
 * vocabulary. Null means "no focus": the caller opens the default entry (guided
 * tour on a first visit), which is exactly what a missing param should do.
 */
export function parseFocus(raw: string | undefined | null): Focus | null {
	if (!raw) return null;
	const value = raw.trim();
	if (!value) return null;

	if (isBare(value)) return { kind: value };

	// Split on the FIRST colon only: an id may itself contain one, and losing
	// the tail would silently address the wrong entity.
	const sep = value.indexOf(":");
	if (sep <= 0) return null;
	const kind = value.slice(0, sep);
	const id = value.slice(sep + 1).trim();
	if (!isNamespacedKind(kind) || !id) return null;
	return { kind, id };
}

/** Focus → the `?focus=` value. Inverse of `parseFocus` for every valid Focus. */
export function serialiseFocus(focus: Focus): string {
	return "id" in focus ? `${focus.kind}:${focus.id}` : focus.kind;
}

/** How long a focused section stays highlighted (§2.1 #2 / §2.2: 2s). */
export const FOCUS_HIGHLIGHT_MS = 2000;
