/**
 * Nextdoor `attributes` → the community card's three "why people love it" tiles.
 *
 * ── What this replaces, and why ──────────────────────────────────────────────
 *
 * `community-highlights.ts` maps attributes onto `DimKey` — Percho's 11-dim
 * vocabulary — and the card renders the dim's own label: "Cultural Scene",
 * "Outdoor Space", "Walkable". Those are Percho's words for a *category*, one
 * abstraction step away from anything a resident said. Owner picked layout E
 * (2026-08-02): A's composition, B's information, meaning the three tiles carry
 * the resident-stated reasons themselves.
 *
 * So this module is deliberately NOT a second dim mapper. It maps an attribute
 * to the attribute, VERBATIM, plus a glyph. "Dog Friendly" renders as
 * "Dog Friendly" — not as `trails` → "Trails Nearby", which is what
 * `ATTRIBUTE_DIM` had to do because no dim means "dog friendly".
 *
 * `community-highlights.ts` stays: `communityHighlightDims` still feeds the
 * card's fallback path and the dim vocabulary is used by tradeoff / insight
 * cards. Both live side by side on purpose.
 *
 * ── Coverage, measured over all 8,679 feed-eligible communities ──────────────
 *
 *   3 reasons   7,687  88.6%
 *   2 reasons     109   1.3%
 *   1 reason       66   0.8%
 *   0 reasons     817   9.4%   → card falls back to `dims`, then to no tiles
 *
 * Better than the dim path's 82.0%-from-attributes, because a reason does not
 * have to survive a translation into one of 11 dims to be shown.
 *
 * ── Why some tiles carry a number and most do not ───────────────────────────
 *
 * A sub-fact is only attached when the DB has a row that is EVIDENCE FOR THAT
 * REASON. That rule is restrictive on purpose and it is why coverage is low:
 *
 *   Well Maintained  → `homeowners_pct`      91.0% of communities have it
 *   Welcoming / Friendly / Neighbors / Community
 *                    → `residents_count`     82.6%
 *   everything else  → nothing               the tile is label-only
 *
 * Measured end to end, 42.8% of communities show exactly one sub-fact and 57.1%
 * show none. **Zero communities show three.** The demo that got approved showed
 * three because it was Ashley Crossing, the only community in the DB with
 * `community_pois` rows ("33 places to eat", "Dog park 1.7 mi") — 1 of 8,679.
 * A label-only tile is exactly the canon 84pt tile, so the degraded case is the
 * shipped card, not a hole in it.
 *
 * Rejected sub-facts, so nobody re-adds them:
 *   · `avg_age` under "Family Friendly" — the average age of adults on Nextdoor
 *     says nothing about whether children live there. It reads as proof and is
 *     not.
 *   · `avg_income` under anything — it is not evidence for a lifestyle claim and
 *     putting income on a neighbourhood card is a fair-housing problem.
 *   · `nearby` (98.5% populated) — a list of adjacent subdivisions, evidence for
 *     no reason at all.
 */

import type { CardIconName } from '@percho/shared';

/** One tile: the resident's own word, a glyph, and optionally one factual line. */
export interface CommunityReason {
	/** The attribute string as residents left it. Never paraphrased. */
	label: string;
	icon: CardIconName;
	/** Present only when a DB row is evidence for THIS reason. */
	fact?: string;
}

/**
 * Attribute → glyph.
 *
 * Keys are grouped by glyph, and the glyph doubles as the de-dup key when
 * picking three: "Peaceful" and "Quiet" both draw the moon, and a row of three
 * tiles where two carry the same art reads as a rendering bug. So the picker
 * takes at most one attribute per glyph — see `communityReasons`.
 *
 * Only attributes that read as a compliment ON THEIR OWN are here. The
 * vocabulary's 193-value long tail ("Traceylynn Consultant", "Lash Strips",
 * "Needs More Raging Parties") and its per-business spam ("Take-out",
 * "Dine-In") are excluded by omission, same discipline as `ATTRIBUTE_DIM`.
 *
 * Spanish values are included for the same reason that file includes them: they
 * are real rows in the seed and the buyer pool is multilingual (CLAUDE.md §1).
 * Unlike the dim path, the rendered label here IS the source token — so a
 * Spanish attribute would print Spanish on an English card. Only tokens with an
 * English twin already in the table are mapped, and they map to the ENGLISH
 * label via `LABEL_OVERRIDE` below.
 */
const REASON_ICON: Record<string, CardIconName> = {
	// quiet
	Peaceful: 'moon',
	Quiet: 'moon',
	Privacy: 'moon',
	Secluded: 'moon',
	Tranquilo: 'moon',
	Silencioso: 'moon',
	// people
	'Family Friendly': 'family',
	Kids: 'family',
	'Ideal para familias': 'family',
	// neighbourliness — its own glyph; "Friendly" under a family icon read as
	// "families live here", a different claim.
	Friendly: 'handshake',
	Welcoming: 'handshake',
	Neighbors: 'handshake',
	Community: 'handshake',
	// safety
	Safe: 'shieldCheck',
	// upkeep / looks
	'Well Maintained': 'check',
	'Bien cuidado': 'check',
	Clean: 'sparkle',
	Beautiful: 'sparkle',
	Charm: 'sparkle',
	// dogs — 35.8% of communities say this and no dim could hold it
	'Dog Friendly': 'dog',
	// green
	Trees: 'tree',
	Woods: 'tree',
	Nature: 'tree',
	Parks: 'tree',
	Wildlife: 'tree',
	Birds: 'tree',
	Landscaping: 'tree',
	Gardens: 'tree',
	Green: 'tree',
	Árboles: 'tree',
	Parques: 'tree',
	Naturaleza: 'tree',
	// walking
	Walkability: 'walk',
	Walking: 'walk',
	Sidewalks: 'walk',
	Aceras: 'walk',
	// getting around
	Convenient: 'car',
	Location: 'car',
	Proximity: 'car',
	'Freeway Access': 'car',
	// things to do nearby
	Restaurants: 'shop',
	Food: 'shop',
	Shopping: 'shop',
	Stores: 'shop',
	Downtown: 'shop',
	Comida: 'shop',
	// schools
	Schools: 'school',
	// water / trails
	Trails: 'path',
	Hiking: 'path',
	Lake: 'path',
	Creek: 'path',
	River: 'path',
	Pond: 'path',
	Lago: 'path',
	// land
	Yards: 'yard',
	Large: 'yard',
	Open: 'yard',
	Patios: 'yard',
	// amenities
	Events: 'cup',
	Pool: 'cup',
	Golf: 'cup',
	Tennis: 'cup',
	Eventos: 'cup',
};

/**
 * Source token → the label the card prints.
 *
 * Only two kinds of entry belong here:
 *   · a Spanish token whose English twin is the card's language (CLAUDE.md §1
 *     keeps buyer-facing chrome English),
 *   · a bare token that is not a sentence on its own ("Kids" alone is not a
 *     reason; "Family Friendly" is).
 * Everything absent from this map prints verbatim.
 */
const LABEL_OVERRIDE: Record<string, string> = {
	Tranquilo: 'Peaceful',
	Silencioso: 'Quiet',
	'Ideal para familias': 'Family Friendly',
	'Bien cuidado': 'Well Maintained',
	Árboles: 'Trees',
	Parques: 'Parks',
	Naturaleza: 'Nature',
	Aceras: 'Sidewalks',
	Comida: 'Food',
	Lago: 'Lake',
	Patios: 'Yards',
	Eventos: 'Events',
	Kids: 'Family Friendly',
};

/**
 * How many of the 8,679 feed-eligible communities claim each reason, in percent.
 *
 * ── Why the card needs this ─────────────────────────────────────────────────
 *
 * The tiles used to be filled by walking `attributes` in the seed's own order,
 * on a comment (inherited from `community-highlights.ts`) claiming Nextdoor
 * returns them "roughly by how often residents cited them". **It does not.**
 * Measured 2026-08-02 over the real column: 355 of 355 communities with 3+
 * attributes have them in strict ALPHABETICAL order.
 *
 * Alphabetical order put `Beautiful` or `Clean` in the first tile of **51.4%**
 * of all community cards — and 27.4% of neighbourhoods call themselves
 * beautiful, 40.0% clean. A word four in ten places claim distinguishes
 * nothing; meanwhile `Schools` (7.7%), `Lake` (4.7%) and `Trails` (3.8%) were
 * pushed out of the row entirely. The card was reliably showing the least
 * informative thing the residents said.
 *
 * So reasons are ranked RAREST-FIRST. A claim only 4% of neighbourhoods can make
 * carries roughly four times the information of one 40% make, and rarity is a
 * property of the corpus rather than an editorial opinion — nobody has to decide
 * that a lake "matters more" than cleanliness.
 *
 * ── Keeping these numbers honest ────────────────────────────────────────────
 *
 * Snapshot, not a live computation: ranking is a pure function of the label, so
 * a card cannot depend on a full-table scan. Recompute if the community corpus
 * changes materially (a new metro's seed, a re-scrape). Percentages are per
 * ENGLISH LABEL after `LABEL_OVERRIDE`, so `Kids` counts toward
 * `Family Friendly` and the Spanish tokens toward their English twins.
 *
 * An absent label sorts LAST via `?? 0`, not first: a reason we have no
 * frequency for is unmeasured, and treating unmeasured as maximally rare would
 * promote it above every real claim on the strength of a missing row.
 */
const REASON_PREVALENCE: Record<string, number> = {
	Peaceful: 61.22,
	'Family Friendly': 58.8,
	Quiet: 51.9,
	Friendly: 47.67,
	Safe: 41.4,
	Clean: 40.02,
	Neighbors: 38.81,
	'Dog Friendly': 35.79,
	'Well Maintained': 31.85,
	Trees: 29.07,
	Beautiful: 27.35,
	Walking: 26.59,
	Walkability: 25.22,
	Welcoming: 24.05,
	Community: 22.93,
	Convenient: 18.85,
	Restaurants: 14.05,
	Woods: 13.3,
	Nature: 13.18,
	Parks: 12.25,
	Location: 11.4,
	Food: 9.85,
	Wildlife: 8.55,
	Proximity: 7.82,
	Schools: 7.72,
	Privacy: 7.04,
	Shopping: 6.9,
	Yards: 6.69,
	'Freeway Access': 6.26,
	Sidewalks: 5.89,
	Charm: 5.63,
	Birds: 5.07,
	Lake: 4.67,
	Landscaping: 4.47,
	Events: 3.92,
	Trails: 3.76,
	Open: 3.49,
	Secluded: 3.26,
	Tennis: 3.17,
	Stores: 2.44,
	Green: 2.17,
	Creek: 2.06,
	Hiking: 1.87,
	Gardens: 1.47,
	Downtown: 1.45,
	Large: 1.38,
	River: 1.16,
	Golf: 1.06,
	Pool: 0.03,
	Pond: 0.01,
};

/**
 * Share of communities claiming this reason. Lower = more distinguishing.
 *
 * Exported for the test that asserts every whitelisted label has a number —
 * without it a newly-mapped attribute would silently sort last forever.
 */
export function reasonPrevalence(label: string): number {
	return REASON_PREVALENCE[label] ?? 0;
}

/** The card has exactly three tiles — same row the redline draws. */
export const COMMUNITY_REASON_COUNT = 3;

export interface CommunityReasonFacts {
	/**
	 * `communities.residents_count`. **TEXT in the DB**, thousands-separated
	 * ("1,050") — the Nextdoor seed writes it verbatim. Typed loosely and parsed
	 * by `numeric()` below rather than pretending the column is a number.
	 */
	residentsCount?: number | string | null;
	/**
	 * `communities.homeowners_pct`. **TEXT in the DB**, percent-suffixed ("35%").
	 *
	 * This is why the owner saw no sub-facts on device at all
	 * (「底下的三个特色要有数据支持」). The old code did `if (pct != null && pct > 0)`
	 * on the raw column: `"35%" > 0` is a NaN comparison, so it is **false**, so
	 * the owner-occupied fact had never rendered once — for any community.
	 */
	homeownersPct?: number | string | null;
	/**
	 * `communities.interests` — Nextdoor's own top-10 list of what residents of
	 * THIS neighbourhood are into, in the order Nextdoor ranks them. 97.5% of
	 * feed-eligible communities carry one, 8,323 of them with all ten values.
	 *
	 * Measured 2026-08-02: only 246/8,441 rows are alphabetical and only 5 follow
	 * global frequency, so the order is genuinely per-neighbourhood — which is
	 * what makes an ordinal ("#2 resident interest") a real fact rather than a
	 * restatement of the corpus.
	 */
	interests?: string[] | null;
}

/**
 * A DB text figure as a number, or `null`.
 *
 * Strips thousands separators and a percent sign, both of which the Nextdoor
 * seed stores literally. Returns `null` rather than `NaN` so every caller is
 * forced to handle "no figure" explicitly.
 */
function numeric(raw: number | string | null | undefined): number | null {
	if (raw == null) return null;
	if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
	const n = Number.parseFloat(raw.replace(/[,%\s]/g, ''));
	return Number.isFinite(n) ? n : null;
}

/**
 * Resident interest that is evidence FOR a given reason.
 *
 * Owner, 2026-08-02: 「底下的三个特色要有数据支持 和demo里一样」. The demo's three
 * sub-facts came from `community_pois` — and that table holds 175 rows for
 * **one** community of 8,679 (Ashley Crossing), so it can back the demo and
 * nothing else. The demographic rule alone reaches ≥1 tile on 36.2% of cards.
 *
 * `interests` is the second column that is genuine evidence and is populated at
 * 97.5%. The pairing rule is strict and it is the same rule `factFor` has always
 * enforced: the interest must be evidence for THAT claim, not merely correlated
 * with it.
 *
 *   Dog Friendly    ← Dogs                        residents' own #N interest
 *   Walkability     ← Walking
 *   Trails/Hiking   ← Hiking & Trails
 *   Trees/Nature/…  ← Gardening & Landscape       (they garden the green space)
 *   Well Maintained ← Home Improvement & DIY      (they maintain it themselves)
 *   Family Friendly ← Parenting School-Age Kids   the ONE honest child signal
 *   Community/…     ← Volunteering
 *   Lake/Creek/…    ← Fishing
 *   Food/Restaurants← Cooking
 *
 * Deliberately NOT paired, so nobody widens this by analogy:
 *   · `Safe` — no interest asserts safety. Stays label-only.
 *   · `Convenient` / `Location` / `Freeway Access` — nothing in the interest
 *     vocabulary is evidence about drive times.
 *   · `Beautiful` / `Clean` / `Charm` — aesthetic claims with no interest behind
 *     them. `Gardening & Landscape` is evidence about green space, not looks.
 *   · `Schools` — `Parenting School-Age Kids` says children live here, which is
 *     the `Family Friendly` claim; it says nothing about school QUALITY.
 */
const INTEREST_EVIDENCE: Record<string, string> = {
	'Dog Friendly': 'Dogs',
	Walkability: 'Walking',
	Walking: 'Walking',
	Sidewalks: 'Walking',
	Trails: 'Hiking & Trails',
	Hiking: 'Hiking & Trails',
	Woods: 'Hiking & Trails',
	Trees: 'Gardening & Landscape',
	Nature: 'Gardening & Landscape',
	Parks: 'Gardening & Landscape',
	Landscaping: 'Gardening & Landscape',
	Gardens: 'Gardening & Landscape',
	Green: 'Gardening & Landscape',
	Birds: 'Gardening & Landscape',
	Yards: 'Gardening & Landscape',
	'Well Maintained': 'Home Improvement & DIY',
	'Family Friendly': 'Parenting School-Age Kids',
	Community: 'Volunteering',
	Neighbors: 'Volunteering',
	Events: 'Volunteering',
	Lake: 'Fishing',
	Creek: 'Fishing',
	River: 'Fishing',
	Pond: 'Fishing',
	Food: 'Cooking',
	Restaurants: 'Cooking',
};

/**
 * A factual line for this reason, or `undefined` when the DB proves nothing.
 *
 * Two evidence sources, checked in that order — a DEMOGRAPHIC figure beats an
 * ordinal, because a percentage is a measurement and a rank is a preference.
 *
 * Coverage measured over all 8,679 feed-eligible communities by running the
 * shipped `communityReasons` over a dump of the live table (2026-08-02):
 *
 *   0 facts   1,532  17.7%
 *   1 fact    2,625  30.2%
 *   2 facts   3,500  40.3%
 *   3 facts   1,022  11.8%
 *
 * i.e. **82.3% of cards carry at least one sub-fact.** Three on every card
 * remains unreachable and that is the honest answer: 17.7% of neighbourhoods
 * state reasons no column of ours can support, and inventing a figure for them is
 * the one thing this file exists to prevent.
 *
 * Never widen this to "any number we happen to have": a figure under a claim
 * reads as proof of that claim, and the wrong figure is worse than none.
 */
function factFor(
	label: string,
	facts: CommunityReasonFacts,
): string | undefined {
	if (label === 'Well Maintained') {
		const pct = numeric(facts.homeownersPct);
		if (pct != null && pct > 0) return `${Math.round(pct)}% owner-occupied`;
		// falls through to the interest rule — DIY is evidence of upkeep too
	}
	if (
		label === 'Welcoming' ||
		label === 'Friendly' ||
		label === 'Neighbors' ||
		label === 'Community'
	) {
		const n = numeric(facts.residentsCount);
		if (n != null && n > 0) return `${n.toLocaleString('en-US')} residents`;
	}
	return interestFactFor(label, facts.interests);
}

/**
 * "#2 resident interest" — this neighbourhood's own ranking of the thing the
 * reason claims.
 *
 * The ORDINAL is the fact, not the interest's name: printing "Dogs" under a tile
 * that already says "Dog Friendly" says nothing, while "#2 resident interest"
 * states where the neighbours themselves put it out of ten. Nextdoor's order is
 * per-neighbourhood (measured: 246/8,441 alphabetical, 5/8,441 global-frequency),
 * so the number carries information.
 *
 * Absent when the paired interest is not in this community's list — the claim
 * then has no evidence and the tile stays label-only.
 */
function interestFactFor(
	label: string,
	interests?: string[] | null,
): string | undefined {
	const wanted = INTEREST_EVIDENCE[label];
	if (!wanted || !interests?.length) return undefined;
	const idx = interests.findIndex((i) => i?.trim() === wanted);
	if (idx < 0) return undefined;
	return `#${idx + 1} resident interest`;
}

/**
 * Up to three resident reasons for the card's tile row, RAREST FIRST.
 *
 * Ordered by `REASON_PREVALENCE` rather than by the seed's order, because the
 * seed's order is alphabetical and was reliably surfacing the least informative
 * claim on the card — see that table's docs for the measurement.
 *
 * The rank is on the reason ALONE, never on whether a sub-fact happens to exist.
 * Promoting "Well Maintained" because we hold a percentage for it would let our
 * data coverage decide what a neighbourhood is known for.
 *
 * Ties break on the seed's own order, so the function stays deterministic for a
 * given row (two reasons at identical prevalence is possible after a corpus
 * refresh rounds two labels to the same figure).
 *
 * @returns 0–3 reasons. Empty means the card should fall back to `dims`, and
 * then to no tiles at all — never to invented ones (§3 "real or absent").
 */
export function communityReasons(args: {
	attributes?: string[] | null;
	facts?: CommunityReasonFacts;
}): CommunityReason[] {
	return communityReasonsAll(args).slice(0, COMMUNITY_REASON_COUNT);
}

/**
 * EVERY reason this community can make, same ranking, unsliced.
 *
 * The community detail screen (`lib/community/detail.ts`) shows the card's three
 * and then the rest, so the two surfaces must agree on both the set and the
 * order. Sharing one function is what makes the page open on the same three tiles
 * the user just tapped instead of a re-ranked different three.
 *
 * `communityReasons` is this, sliced. Do not re-implement the ranking anywhere.
 */
export function communityReasonsAll(args: {
	attributes?: string[] | null;
	facts?: CommunityReasonFacts;
}): CommunityReason[] {
	const facts = args.facts ?? {};

	/**
	 * Every distinct reason this community can make. The whole candidate set has
	 * to be built before sorting: picking greedily while walking `attributes`
	 * would rank only what alphabetical order happened to put early, which is the
	 * bug this ordering exists to fix.
	 */
	const candidates: { reason: CommunityReason; seedIndex: number }[] = [];
	const usedIcons = new Set<CardIconName>();
	const usedLabels = new Set<string>();

	let seedIndex = 0;
	for (const raw of args.attributes ?? []) {
		seedIndex += 1;
		if (typeof raw !== 'string') continue;
		// Seed values carry stray trailing spaces ("Casas ", "perros ").
		const token = raw.trim();
		const icon = REASON_ICON[token];
		if (!icon) continue;
		const label = LABEL_OVERRIDE[token] ?? token;
		// One tile per glyph: "Peaceful" and "Quiet" both draw the moon, and two
		// identical icons in a three-tile row read as a rendering bug. Deduped on
		// FIRST APPEARANCE rather than on rarity, deliberately — the two tokens
		// mean nearly the same thing, so which survives changes the wording, not
		// the information, and first-wins keeps this cheap and stable.
		if (usedIcons.has(icon) || usedLabels.has(label)) continue;
		usedIcons.add(icon);
		usedLabels.add(label);
		const fact = factFor(label, facts);
		candidates.push({
			reason: { label, icon, ...(fact ? { fact } : {}) },
			seedIndex,
		});
	}

	return candidates
		.sort(
			(a, b) =>
				reasonPrevalence(a.reason.label) - reasonPrevalence(b.reason.label) ||
				a.seedIndex - b.seedIndex,
		)
		.map((c) => c.reason);
}
