/**
 * Room grouping for the explore page's media carousel, room-jump strip, and
 * grouped photo grid (phase118, spec §3.1).
 *
 * ONE taxonomy, sourced from the existing VLM tags
 * (`listing_photos.ai_tags.room_type`, written by
 * `scripts/render-worker/photo_tagger.py`) — the spec forbids a second one.
 * The tagger emits 17 room types; the strip collapses them into the 8 display
 * groups below because a chip row of 17 does not fit 390pt, and "hallway ·
 * closet · laundry" are not rooms a buyer navigates to.
 *
 * Photos keep their MLS `sort_order` — grouping never reorders the carousel.
 * A chip jumps to the group's FIRST photo; the highlight follows whichever
 * group the current photo belongs to.
 */
import type { DetailPhotoDTO } from "./detail-dto";

export type RoomGroupKey =
	| "kitchen"
	| "living"
	| "dining"
	| "bedroom"
	| "bathroom"
	| "yard"
	| "exterior"
	| "other";

const GROUP_LABELS: Record<RoomGroupKey, string> = {
	kitchen: "Kitchen",
	living: "Living",
	dining: "Dining",
	bedroom: "Bedrooms",
	bathroom: "Baths",
	yard: "Backyard",
	exterior: "Exterior",
	other: "More",
};

export function roomLabel(key: RoomGroupKey): string {
	return GROUP_LABELS[key];
}

/** Tagger room → display group. Anything unrecognised or untagged is `other`. */
export function roomGroupForTag(
	roomType: string | null | undefined,
): RoomGroupKey {
	switch (roomType?.trim().toLowerCase()) {
		case "kitchen":
			return "kitchen";
		case "living":
			return "living";
		case "dining":
			return "dining";
		case "bedroom":
		case "office":
			return "bedroom";
		case "bathroom":
			return "bathroom";
		case "backyard":
		case "pool":
		case "balcony":
			return "yard";
		case "exterior":
			return "exterior";
		default:
			return "other";
	}
}

export interface RoomGroup {
	key: RoomGroupKey;
	label: string;
	/** Photos in this group. */
	count: number;
	/** Carousel index of the group's first photo, 0-based over PHOTOS. */
	firstPhotoIndex: number;
}

export interface RoomGroups {
	/**
	 * Real rooms in first-appearance order, `other` (if any) always last.
	 * EMPTY when no photo carries a recognisable room — the strip and the
	 * grid's section headers degrade to nothing rather than showing "More · 34".
	 */
	groups: readonly RoomGroup[];
	/** Group of the photo at each index — drives the strip's highlight. */
	keyByIndex: readonly RoomGroupKey[];
}

export function buildRoomGroups(
	photos: readonly Pick<DetailPhotoDTO, "tags">[],
): RoomGroups {
	const keyByIndex = photos.map((p) => roomGroupForTag(p.tags?.room_type));

	const byKey = new Map<RoomGroupKey, RoomGroup>();
	keyByIndex.forEach((key, index) => {
		const existing = byKey.get(key);
		if (existing) {
			existing.count += 1;
			return;
		}
		byKey.set(key, {
			key,
			label: roomLabel(key),
			count: 1,
			firstPhotoIndex: index,
		});
	});

	const real = [...byKey.values()].filter((g) => g.key !== "other");
	// All-`other` means the tagger never ran here: no groups, no strip.
	if (real.length === 0) return { groups: [], keyByIndex };

	const other = byKey.get("other");
	return { groups: other ? [...real, other] : real, keyByIndex };
}
