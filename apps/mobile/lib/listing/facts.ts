/**
 * FactsBlock rows (phase119, spec §3.8) — "The rest of it", a 2-column grid
 * capped at 6 items. Rows exist ONLY for fields the schema really carries;
 * garage and heating are not columns anywhere, so they never appear. The Ask
 * entry (P1) is the pressure valve for everything not shown here — this block
 * deliberately never grows into a full facts table.
 */
import type { ListingDetailDTO } from "./detail-dto";
import { parseHoaMonthlyUsd } from "./monthly";

export interface FactItem {
	/** Uppercase grid label. */
	label: string;
	value: string;
}

export const MAX_FACTS = 6;

export function buildFacts(detail: ListingDetailDTO): FactItem[] {
	const out: FactItem[] = [];

	if (detail.lotSizeRaw) {
		out.push({ label: "LOT", value: detail.lotSizeRaw });
	} else if (detail.lotSizeAcres !== undefined) {
		out.push({ label: "LOT", value: `${detail.lotSizeAcres} acres` });
	}

	if (detail.hoaRaw) {
		const monthly = parseHoaMonthlyUsd(detail.hoaRaw);
		out.push({
			label: "HOA",
			value:
				monthly !== undefined ? `$${Math.round(monthly)} / mo` : detail.hoaRaw,
		});
	}

	if (detail.yearBuilt !== undefined) {
		out.push({ label: "BUILT", value: String(detail.yearBuilt) });
	}

	if (detail.neighborhood) {
		out.push({ label: "NEIGHBORHOOD", value: detail.neighborhood });
	}

	if (detail.zip) {
		out.push({ label: "ZIP", value: detail.zip });
	}

	if (detail.mlsNumber) {
		out.push({ label: "MLS", value: `FMLS ${detail.mlsNumber}` });
	}

	return out.slice(0, MAX_FACTS);
}
