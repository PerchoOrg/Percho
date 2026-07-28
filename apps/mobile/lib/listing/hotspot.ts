/**
 * Hotspots — the unit `02-listing.md` §2.3–2.5 is built out of. A hotspot is one
 * feature of the home ("open island kitchen") that carries a photo, a section,
 * and 3–5 actions.
 *
 * DATA SOURCE (verified on the remote 2026-07-27): `listing_photos.ai_tags`,
 * written by `scripts/render-worker/photo_tagger.py` — `room_type`, `caption`,
 * `style_signals`, `hero_score`, `quality`. Nothing else in the schema knows what
 * is IN a photo, so nothing else can anchor a hotspot.
 *
 * IRON LAWS encoded here rather than left to the UI:
 *   1. §2.5: "每个 hotspot 3–5 个动作，少于 3 不上线." A hotspot that cannot
 *      offer three real actions is NOT emitted. Not greyed out, not padded with a
 *      disabled row — absent.
 *   2. §2.3 / canon: a tour stop's `evidence` must be non-empty, enforced by the
 *      TYPE (a required non-empty tuple shape) **and** a runtime guard, because
 *      the tour is generated server-side and a type cannot police a JSON payload.
 *   3. Every action's subtitle must carry a concrete number (§2.5 #2, "空泛文案
 *      = 砍"). `hasConcreteData` is the gate, and it is the reason actions are
 *      built here rather than in a component.
 */

/** §2.5: the five actions. Order is the sheet's render order. */
export const ACTION_KINDS = [
	"why",
	"compare",
	"renovate",
	"save",
	"ask_ai",
] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

export const MIN_ACTIONS = 3;
export const MAX_ACTIONS = 5;

export interface HotspotAction {
	kind: ActionKind;
	label: string;
	/** MUST contain a number — see iron law 3. */
	sub: string;
	/** §2.5 #1: Ask AI is a greyed "coming soon" until Phase D. */
	disabled?: true;
}

/**
 * The room vocabulary `photo_tagger.py` emits, narrowed to the ones that can
 * anchor a section a buyer would actually navigate to. `hallway`, `closet`,
 * `laundry`, `floorplan` are deliberately absent: a "Hallway" chip in the section
 * nav is noise, and §2.4 #2 builds the nav from these.
 */
export const HOTSPOT_ROOMS = [
	"kitchen",
	"living",
	"dining",
	"bedroom",
	"bathroom",
	"office",
	"backyard",
	"pool",
	"balcony",
	"garage",
	"basement",
	"exterior",
] as const;

export type HotspotRoom = (typeof HOTSPOT_ROOMS)[number];

/** Emoji per room — the pin glyph (§2.4 #1) and the sheet title prefix. */
const ROOM_EMOJI: Record<HotspotRoom, string> = {
	kitchen: "🍳",
	living: "🛋",
	dining: "🍽",
	bedroom: "🛏",
	bathroom: "🛁",
	office: "💼",
	backyard: "🌳",
	pool: "🏊",
	balcony: "🌤",
	garage: "🚗",
	basement: "🪜",
	exterior: "🏡",
};

export function emojiForRoom(room: HotspotRoom): string {
	return ROOM_EMOJI[room];
}

export interface Hotspot {
	id: string;
	room: HotspotRoom;
	/** Human label, from the tagger's caption. */
	title: string;
	/** The photo this hotspot lives on. */
	mediaUrl: string;
	/** Normalised [x, y] pin position on the media, from `subject_bbox`. */
	pin: { x: number; y: number };
	actions: readonly HotspotAction[];
	/** §2.5 #1: only a dated feature offers a renovation estimate. */
	dated?: true;
}

/** The subset of `ai_tags` this module reads. Extra keys are ignored. */
export interface PhotoTags {
	room_type?: string | null;
	caption?: string | null;
	style_signals?: string[] | null;
	subject_bbox?: number[] | null;
	quality?: number | null;
	hero_score?: number | null;
	usable?: boolean | null;
}

export interface TaggedPhoto {
	id: string;
	url: string;
	tags: PhotoTags;
}

function isHotspotRoom(value: string): value is HotspotRoom {
	return (HOTSPOT_ROOMS as readonly string[]).includes(value);
}

/**
 * Iron law 3. A subtitle qualifies only if it contains a digit — "Island
 * kitchens in Duluth: 8 of 24 active" passes, "A lovely space to gather" does
 * not. Crude on purpose: any cleverer test invites copy that games it.
 */
export function hasConcreteData(sub: string): boolean {
	return /\d/.test(sub);
}

/**
 * Pin position from the tagger's `subject_bbox` ([x, y, w, h], top-left origin,
 * normalised). The pin goes at the CENTRE of the box, clamped into frame so a
 * bbox touching an edge cannot render a pin half-off the photo.
 */
export function pinFromBbox(bbox: number[] | null | undefined): {
	x: number;
	y: number;
} {
	const fallback = { x: 0.5, y: 0.5 };
	if (!bbox || bbox.length < 4) return fallback;
	const [x, y, w, h] = bbox;
	if (
		x === undefined ||
		y === undefined ||
		w === undefined ||
		h === undefined ||
		![x, y, w, h].every((n) => Number.isFinite(n))
	) {
		return fallback;
	}
	const clamp = (n: number) => Math.min(Math.max(n, 0.06), 0.94);
	return { x: clamp(x + w / 2), y: clamp(y + h / 2) };
}

/** `style_signals` the tagger emits that mean "this feature is dated" (§2.5 #1). */
const DATED_SIGNALS = new Set(["dated", "carpet"]);

export interface BuildHotspotInput {
	photo: TaggedPhoto;
	/** Candidate actions; those failing the concrete-data gate are dropped. */
	candidateActions: readonly HotspotAction[];
}

/**
 * One hotspot, or null when it cannot be built honestly. Null happens when the
 * photo is unusable, the room is not navigable, there is no caption to title it,
 * or fewer than 3 actions survive the concrete-data gate (iron law 1).
 */
export function buildHotspot(input: BuildHotspotInput): Hotspot | null {
	const { photo, candidateActions } = input;
	const { tags } = photo;

	if (tags.usable === false) return null;

	const room = tags.room_type?.trim().toLowerCase();
	if (!room || !isHotspotRoom(room)) return null;

	const title = tags.caption?.trim();
	if (!title) return null;

	const actions = candidateActions
		.filter((a) => hasConcreteData(a.sub))
		.slice(0, MAX_ACTIONS);
	if (actions.length < MIN_ACTIONS) return null;

	const signals = tags.style_signals ?? [];
	const dated = signals.some((s) => DATED_SIGNALS.has(s.toLowerCase()));

	return {
		id: photo.id,
		room,
		title,
		mediaUrl: photo.url,
		pin: pinFromBbox(tags.subject_bbox),
		actions,
		...(dated ? { dated: true as const } : {}),
	};
}
