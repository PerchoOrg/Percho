/**
 * Saved-tab row formatting (05 §5.2) — pure helpers between the detail DTOs
 * and the list rows.
 *
 * PURE: no react / zustand / expo imports.
 */
import type { CommunityProfile } from "@percho/shared/community-profile";
import { rankShare } from "@percho/shared/rank-share";
import { schoolRanks } from "../community/explore";

/** `685000` → `"$685,000"`. The detail DTO carries a number, the row a label. */
export function formatPrice(price: number | undefined): string | undefined {
	if (price === undefined || !Number.isFinite(price) || price <= 0) {
		return undefined;
	}
	return `$${Math.round(price).toLocaleString("en-US")}`;
}

/** `"4 bd · 3 ba · 2,853 sqft"` from whichever of the three the DTO has. */
export function specsLine(
	beds: number | undefined,
	baths: number | undefined,
	sqft: number | undefined,
): string | undefined {
	const parts: string[] = [];
	if (beds !== undefined && beds > 0) parts.push(`${beds} bd`);
	if (baths !== undefined && baths > 0) parts.push(`${baths} ba`);
	if (sqft !== undefined && sqft > 0) {
		parts.push(`${Math.round(sqft).toLocaleString("en-US")} sqft`);
	}
	return parts.length > 0 ? parts.join(" · ") : undefined;
}

/**
 * An area card's id is `area-<unitId>` (`generate-feed.ts`); the saved store
 * keeps the card id, and the Saved tab needs the unit back to look it up in
 * the pool and to focus the Search map.
 */
export function areaUnitId(cardId: string): string {
	return cardId.startsWith("area-") ? cardId.slice("area-".length) : cardId;
}

/**
 * A saved neighbourhood's one line of findings: "Schools Top 12–46% · $747K".
 *
 * The grid, list and map views (phase386) show a save with what its Explore
 * page found, so a shortlist can be scanned without opening each page. The
 * schools are worded as a range — best to worst of the levels nearby — so the
 * line never claims more than the weakest of them. Undefined for a community
 * nobody has researched.
 */
export function communityFact(
	profile: CommunityProfile | undefined,
): string | undefined {
	const shares = schoolRanks(profile?.ranks).map(rankShare);
	const best = Math.min(...shares);
	const worst = Math.max(...shares);
	const parts = [
		shares.length === 0
			? undefined
			: `Schools Top ${best === worst ? best : `${best}–${worst}`}%`,
		profile?.homeValue?.display,
	].filter(Boolean);
	return parts.length > 0 ? parts.join(" · ") : undefined;
}
