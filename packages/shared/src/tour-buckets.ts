/**
 * Grouping the community film by CATEGORY, for the hero's jump strip.
 *
 * Owner, 2026-09-05: "dont say the poi name, just group them by tag or
 * category, it is too long to show all of them" — a tour visits 9–12 places
 * and a chip row of 12 proper nouns ("Forsyth County Public Library - Sharon
 * Forks Library") does not fit 390pt.
 *
 * This is the listing page's `lib/listing/rooms.ts` for a film instead of a
 * photo set: same shape (`groups` + `keyByIndex`), same rules — a chip jumps
 * to the group's FIRST member, the highlight follows whichever group the
 * current position belongs to, and the taxonomy is one that already exists in
 * the database rather than a second one invented here.
 *
 * That taxonomy is `community_pois.intent_bucket`, attached to each segment by
 * `apps/web/lib/feed/vertical-videos.ts`. Segments the join could not resolve
 * fall into `more`, which is also where the two buckets the page will not name
 * go — see `BUCKET_LABELS`.
 */
/** One place the tour's film visits — same rows as the card's dashed bar. */
export interface TourSegment {
	name: string;
	/** 0..1 — where in the film this place's clips END. */
	endFraction: number;
	/** `community_pois.intent_bucket`. Absent when the join could not resolve it. */
	bucket?: string;
}

/**
 * `intent_bucket` → chip label. Short: these sit over the film in a scrolling
 * row, and the listing's room chips ("Kitchen", "Baths") set the length.
 *
 * `other` and `asian_community` both resolve to `more` rather than to a label
 * of their own. `other` is the tagger's shrug and names nothing; the reasoning
 * for `asian_community` is in `apps/web/lib/communities/detail.ts`
 * (`NEARBY_BUCKET_DENYLIST`) — it is the same call, kept in both places so the
 * strip and the chart cannot disagree.
 */
const BUCKET_LABELS: Record<string, string> = {
	schools: "Schools",
	dining: "Food",
	shopping: "Shopping",
	outdoor: "Parks",
	waterfront: "Water",
	fitness: "Fitness",
	healthcare: "Health",
	daily_errands: "Errands",
	transit: "Transit",
	nightlife: "Nightlife",
	pets: "Pets",
	kids: "Kids",
	amenities: "Amenities",
	civic: "Civic",
	faith: "Faith",
	work_hubs: "Work",
};

/** The label a bucket prints, or `null` when the page will not name it. */
export function bucketLabel(bucket: string): string | null {
	return BUCKET_LABELS[bucket] ?? null;
}

export interface TourGroup {
	/** `intent_bucket`, or `more` for the unnamed remainder. */
	key: string;
	label: string;
	/** Places in this group. */
	count: number;
	/** Segment index of the group's first place, 0-based. */
	firstSegmentIndex: number;
}

export interface TourGroups {
	groups: TourGroup[];
	/** Segment index → group key, for the highlight. */
	keyByIndex: string[];
}

const EMPTY: TourGroups = { groups: [], keyByIndex: [] };

/**
 * One group per category, in the order the film first reaches each.
 *
 * Returns nothing when NO segment carries a bucket: every chip would read
 * "More", which is chrome that tells the buyer nothing. A film whose places
 * cannot be categorised gets no strip, the same way the listing hero hides its
 * strip when no photo carries a room.
 */
export function buildTourGroups(segments: readonly TourSegment[]): TourGroups {
	if (segments.length === 0) return EMPTY;
	if (!segments.some((s) => s.bucket && bucketLabel(s.bucket))) return EMPTY;

	const keyByIndex: string[] = [];
	const groups: TourGroup[] = [];
	const byKey = new Map<string, TourGroup>();

	for (let i = 0; i < segments.length; i++) {
		const bucket = segments[i]?.bucket ?? "";
		const label = bucket ? bucketLabel(bucket) : null;
		const key = label ? bucket : "more";
		keyByIndex.push(key);

		const existing = byKey.get(key);
		if (existing) {
			existing.count += 1;
			continue;
		}
		const group: TourGroup = {
			key,
			label: label ?? "More",
			count: 1,
			firstSegmentIndex: i,
		};
		byKey.set(key, group);
		groups.push(group);
	}

	return { groups, keyByIndex };
}
