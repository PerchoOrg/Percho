/**
 * Saved-tab row formatting (05 §5.2) — pure helpers between the detail DTOs
 * and the list rows.
 *
 * PURE: no react / zustand / expo imports.
 */
import type { PlaceGlance } from "@percho/shared/glance";

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
 * A save's one line of figures, as its feed card prints them (phase404.23,
 * owner: 「preview内容和最新的卡片保持一致 比如学区评级」): "$685K · A+ school
 * grade · 6 min to I-85".
 *
 * The server's `glance` cells, in the card's order — the community detail
 * endpoint and the feed's city units both carry them — so the line and the
 * card cannot disagree. A price says what it is on its own; any other figure
 * keeps the label the card prints under it, because "A+" or "6 min" alone in
 * a line is not a fact. Undefined when the server sent no figures.
 */
export function glanceFact(
	glance: PlaceGlance | undefined,
): string | undefined {
	const parts = (glance?.cells ?? []).map((c) =>
		c.value.startsWith("$") ? c.value : `${c.value} ${c.label}`,
	);
	return parts.length > 0 ? parts.join(" · ") : undefined;
}
