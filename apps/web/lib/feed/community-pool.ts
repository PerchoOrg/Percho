/**
 * Community pool for the v3 feed's Stage 3 (spec-v3 `01-feed.md` §1.4).
 *
 * Fetched from `communities` DIRECTLY, not derived from listing rows. That
 * distinction is the whole point of this file: only 3 of 260 active listings
 * carry a `community_id`, so projecting communities out of the listing feed
 * yields an essentially empty Stage 3 — the stage that is supposed to be the
 * best-populated one (8680 real Nextdoor-seeded communities) and whose
 * right-swipes are the only way the 3→4 gate ever opens.
 *
 * CRITICAL: `boundary` must NOT be selected here. The Nextdoor seeds are dense
 * multipolygons and PostgREST hits `statement_timeout` (PG 57014) streaming
 * many of them at once — the trap documented in `lib/communities/list.ts`.
 * The feed card only needs a hero image; boundary is fetched per-card later.
 *
 * Every field is real or absent. A community with no usable cover image is
 * dropped rather than shown as a blank card, because §1.4 cards are
 * photo-first — a community card with no photo is not a card.
 */

import { publicCoverImageUrl } from "@/lib/communities/cover";
import { createAnonClient } from "@/lib/supabase/server";
import type { DimKey } from "@percho/shared";
import { communityHighlightDims } from "./community-highlights";

export interface PoolCommunityDTO {
	id: string;
	slug: string;
	name: string;
	city: string;
	state: string;
	heroUrl: string;
	blurb?: string;
	/**
	 * The redline's three "community highlights" tiles, derived from the
	 * Nextdoor-seeded `attributes` / `interests` columns — see
	 * `community-highlights.ts`. Omitted (not `[]`) when the community has no
	 * usable signal, so `CommunityFace` renders no tiles rather than empty ones.
	 */
	dims?: DimKey[];
	/**
	 * 9:16 hero video, attached by the route from `generated_videos` (see
	 * `lib/feed/vertical-videos.ts`). Absent for most communities: only 4 have a
	 * ready vertical video today. `CommunityFace` already renders `CardVideo` when
	 * this is present — the field simply did not exist before, so the mobile card
	 * could never play one.
	 */
	videoUrl?: string;
}

type CommunityPoolRow = {
	id: string;
	slug: string;
	name: string;
	city: string | null;
	state: string | null;
	description: string | null;
	cover_storage_path: string | null;
	attributes: string[] | null;
	interests: string[] | null;
};

/**
 * Communities for the pool, ordered by name for a deterministic page window.
 *
 * Scoped to the cities the buyer's funnel has actually narrowed to when the
 * client supplies them — Stage 3 follows Stage 2's city choices, so sending an
 * Atlanta buyer communities from Cumming would undo the narrowing the funnel
 * just did. With no cities supplied it returns an unscoped page (Stage 3 can be
 * reached with city signals that no longer resolve, e.g. after a scope reset).
 */
export async function fetchCommunityPool(args: {
	offset: number;
	limit: number;
	cities?: string[];
}): Promise<PoolCommunityDTO[]> {
	const supabase = await createAnonClient();

	let query = supabase
		.from("communities")
		// `attributes` / `interests` are small text[] columns (10 short values
		// each) — unlike `boundary` they are safe to stream for a whole page. They
		// feed the redline's three highlight tiles; see `community-highlights.ts`.
		.select(
			"id, slug, name, city, state, description, cover_storage_path, attributes, interests",
		)
		.eq("status", "active")
		// A card with no photo is not a card (§1.4 is photo-first).
		.not("cover_storage_path", "is", null);

	if (args.cities && args.cities.length > 0) {
		query = query.in("city", args.cities);
	}

	const { data, error } = await query
		.order("name", { ascending: true })
		.range(args.offset, args.offset + args.limit - 1);

	if (error) throw new Error(`community pool fetch failed: ${error.message}`);

	return projectCommunityPool((data ?? []) as CommunityPoolRow[]);
}

/** Pure projection, exported for direct testing. */
export function projectCommunityPool(
	rows: CommunityPoolRow[],
): PoolCommunityDTO[] {
	const out: PoolCommunityDTO[] = [];
	for (const r of rows) {
		// Guarded again rather than trusting the query filter: this projection is
		// also reachable from tests and future callers.
		if (!r.cover_storage_path || !r.slug || !r.name) continue;
		const dims = communityHighlightDims({
			attributes: r.attributes,
			interests: r.interests,
		});
		out.push({
			id: r.id,
			slug: r.slug,
			name: r.name,
			city: r.city ?? "",
			state: r.state ?? "",
			heroUrl: publicCoverImageUrl(r.cover_storage_path),
			...(r.description ? { blurb: r.description } : {}),
			// Omitted rather than `[]` when there is no usable signal: the card must
			// render no tiles at all instead of three empty glass boxes.
			...(dims.length > 0 ? { dims } : {}),
		});
	}
	return out;
}
