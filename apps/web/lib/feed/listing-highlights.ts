/**
 * Listing prose → Percho `DimKey`, for the listing card's three chips above the
 * "Explore Home →" CTA.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 *
 * The redline's listing card puts three chips (Top Schools · Private Backyard ·
 * Walkable Park) directly above the CTA. `ListingFace` renders them from
 * `card.dims` — but `projectListing` in the feed route never sent that field, so
 * `chips.length > 0` was always false and the row was skipped entirely. Same
 * class of bug as the community card's empty highlights row, a different pool:
 * the card was waiting on data nobody sent. Owner caught it on device twice.
 *
 * ── Why the listing's own prose, and not a structured source ─────────────────
 *
 * Every structured candidate was measured against the live database first, and
 * all of them are empty enough to be unusable (260 active listings):
 *
 *   listing_pois          2 listings have any POI row at all
 *   listings.lat / lng   11 have coordinates → no radius query is possible
 *   listings.community_id 3 are linked to a community → can't borrow its dims
 *   k12_schools          15 rows statewide; attendance_zones is EMPTY
 *   listing_photos.ai_tags 127 listings tagged, but the vocabulary describes the
 *                        HOUSE's finishes ('hardwood', 'chandelier',
 *                        'subway_tile'), not anything a chip claims
 *
 * What every listing does have is the agent's own written description
 * (260/260 non-empty). So the chips are extracted from that.
 *
 * ── This is the agent's claim, quoted — not our inference ────────────────────
 *
 * A chip only appears when the listing's own copy asserts the thing in words.
 * "Top Schools" requires the description to say top-rated / award-winning /
 * walk-to-school; it is never inferred from a city name or a price. That keeps
 * the standing of a chip identical to the community card's Nextdoor attributes:
 * a claim made by a party who saw the place, surfaced verbatim in meaning.
 *
 * Coverage measured over all 260 active listings: 96.9% match at least one dim,
 * 63.1% match three or more. Listings that match nothing get NO chips row —
 * `undefined`, not `[]`. Printing "Family Friendly" on a house whose own agent
 * never claimed it would be fabricated editorial (§3 "real or absent").
 *
 * ── Recall widened 2026-08-01, WITHOUT widening what a chip claims ────────────
 *
 * Owner asked for "at least three chips per listing". Three is NOT reachable by
 * loosening the bar: only 47.3% of listings matched 3+ dims under the original
 * patterns, and the remaining 52.7% genuinely do not assert three things. The
 * fix for those is not a laxer regex, it is more source data (POI / school
 * attendance zones, both still empty — see the table above).
 *
 * What WAS available is recall: phrasings that assert a dim's existing claim but
 * were not listed. A screened porch is private outdoor living space; a community
 * with tennis courts and a playground is the family-amenity claim `family`
 * already makes; "new roof / new HVAC" is the same "nothing left to do"
 * assertion as "move-in ready". Adding those took 3+ coverage 47.3% → 63.5%
 * and 1+ from 96.5% → 96.9%, measured over the same 260 listings by running THIS
 * function (not a reimplementation) over a dump of the live table.
 *
 * Every added phrase was checked against real matched sentences before shipping.
 * That review caught one false positive: "freshly painted backyard fence" is not
 * a move-in-ready claim, so the paint pattern carries a negative lookahead. No
 * dim gained a MEANING it did not already have — `hip` and `nightlife` are still
 * deliberately unextractable.
 *
 * ── Ranking, because the loudest phrases are the emptiest ────────────────────
 *
 * Raw frequency would hand all three slots to puffery: `space` ("spacious")
 * matches 79.2% of listings and `entertaining` ("open concept") 54.2%, because
 * those words are in every agent's boilerplate. The chips are supposed to help a
 * buyer decide, so `PRIORITY` puts the locational, checkable claims first
 * (schools, walkable, trails, quiet, outdoors, family) and lets the boilerplate
 * dims fill leftover slots only. A listing whose copy says both "top-rated
 * schools" and "spacious" shows Top Schools, never Spacious alone.
 *
 * Deliberately NOT extracted:
 *   `hip` / `nightlife` — the only phrasings available are "vibrant" and
 *   "trendy", which carry no locational content at all and appear as pure
 *   adjective in listings 40 minutes from anything. A "Cultural Scene" chip
 *   sourced from the word "vibrant" is a claim we cannot stand behind.
 */

import type { DimKey } from "@percho/shared";

/**
 * One pattern per dim. Deliberately narrow — the phrase has to carry the
 * meaning on its own, not merely contain a suggestive word:
 *
 *   `schools` needs a QUALITY claim ("top-rated schools"), so a bare mention of
 *   a school district does not qualify — every house is in one.
 *   `outdoors` needs the yard to be described (private / fenced / level /
 *   large), because "yard" alone is true of nearly every detached house.
 *   `quiet` accepts cul-de-sac as a structural fact, not just adjectives.
 *
 * Anchored on word boundaries so 'walkable' cannot match inside another word.
 */
const DIM_PATTERN: Partial<Record<DimKey, RegExp>> = {
	schools:
		/\b(?:top[-\s]rated|award[-\s]winning|excellent|sought[-\s]after|highly[-\s]rated|blue[-\s]ribbon)\s+(?:public\s+)?schools?\b|\btop\s+schools?\b|\bbest\s+schools?\b/i,
	walkable:
		/\bwalkable\b|\bwalking distance to\b|\bwalk to (?:shops?|shopping|downtown|town|the village|restaurants?|dining|the square)\b|\bsteps? (?:away )?(?:to|from) (?:shops?|downtown|town|the village|restaurants?|dining)\b|\bwalk(?:ing)? (?:distance )?to (?:schools?|parks?|the park|trails?)\b|\bwalk to everything\b/i,
	trails:
		/\b(?:walking|nature|hiking|multi[-\s]use|bike) trails?\b|\bgreenway\b|\bbike paths?\b|\bnature preserve\b|\bwalking paths?\b/i,
	quiet:
		/\bcul[-\s]?de[-\s]?sac\b|\bquiet (?:street|road|neighborhood|neighbourhood|community|setting|cul)\b|\bpeaceful\b|\bserene\b|\btranquil\b/i,
	outdoors:
		/\b(?:private|fenced|level|large|expansive|spacious|flat) (?:back)?yard\b|\bfenced[-\s]in yard\b|\bnear(?:by)? parks?\b|\bpark across\b|\b(?:screened|covered|rocking[-\s]chair)\s+porch\b|\b(?:large|spacious|oversized|expansive|private|new)\s+(?:deck|patio)\b|\bdeck overlook|\bfire pit\b|\bfenced\b[^.]{0,20}\b(?:yard|lot|backyard)\b/i,
	family:
		/\bfamily[-\s]friendly\b|\bgreat for families\b|\bswim(?:\/| and |[-\s])tennis\b|\bswim,\s*tennis\b|\btennis courts?\b|\bplayground\b|\bcommunity pool\b/i,
	entertaining:
		/\bperfect for entertaining\b|\bgreat for entertaining\b|\bentertainer'?s? (?:dream|delight|paradise)\b|\bopen concept\b/i,
	move_in:
		/\bmove[-\s]in ready\b|\bturn[-\s]?key\b|\b(?:newly|fully|completely|recently) renovated\b|\bnew construction\b|\bnew (?:roof|hvac|water heater|windows)\b|\bupdated throughout\b|\bfresh(?:ly)? (?:interior )?paint(?:ed)?\b(?!\s+(?:backyard|fence|deck|exterior|shed))/i,
	space: /\bspacious\b|\boversized\b|\bexpansive\b/i,
};

/**
 * Which dims earn a chip first. Locational and checkable before boilerplate —
 * see the header. Order within the tail is by how much it narrows a decision.
 */
const PRIORITY: DimKey[] = [
	"schools",
	"walkable",
	"trails",
	"quiet",
	"outdoors",
	"family",
	"move_in",
	"entertaining",
	"space",
];

/** The redline shows three chips; a fourth wraps and breaks the row. */
const MAX_DIMS = 3;

/**
 * @param description the listing's prose paragraphs (`listings.description`).
 * @returns up to three dims in `PRIORITY` order, or `[]` when the copy asserts
 * none. The caller omits the field entirely on `[]` so the card renders no chip
 * row rather than an empty one.
 */
export function listingHighlightDims(
	description: string[] | null | undefined,
): DimKey[] {
	if (!description || description.length === 0) return [];
	const text = description.join(" ");
	if (text.trim() === "") return [];

	const out: DimKey[] = [];
	for (const dim of PRIORITY) {
		const pattern = DIM_PATTERN[dim];
		if (pattern?.test(text)) out.push(dim);
		if (out.length === MAX_DIMS) break;
	}
	return out;
}
