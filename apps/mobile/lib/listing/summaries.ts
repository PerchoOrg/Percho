/**
 * Batch listing summaries, client side (phase118).
 *
 * Mirrors `apps/web/lib/listings/summaries.ts` — keep the two in sync. One
 * fetch feeds BOTH explore-page consumers of the buyer's saved homes: the
 * CompareRail (price + thumb + city per card) and the FitCard derivation
 * (price / sqft / beds per save). See the web file for why they share.
 *
 * Failure is soft by design: the rail and the fit card are enrichments, so a
 * failed batch read renders them absent rather than erroring the page.
 */
import { useEffect, useState } from "react";
import { listingSummariesUrl } from "../api/base";

export interface ListingSummaryDTO {
	id: string;
	address: string;
	city: string;
	state: string;
	price?: number;
	beds?: number;
	baths?: number;
	sqft?: number;
	thumbUrl?: string;
}

/** Most saves the explore page ever asks about — the rail shows about this many. */
export const SUMMARY_FETCH_CAP = 12;

function num(v: unknown): number | undefined {
	return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function str(v: unknown): string | undefined {
	return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Defensive row parse — a malformed row is dropped, never rendered half-empty. */
export function parseSummary(raw: unknown): ListingSummaryDTO | null {
	if (typeof raw !== "object" || raw === null) return null;
	const r = raw as Record<string, unknown>;
	const id = str(r.id);
	const address = str(r.address);
	const city = str(r.city);
	const state = str(r.state);
	if (!id || !address || !city || !state) return null;
	const price = num(r.price);
	const beds = num(r.beds);
	const baths = num(r.baths);
	const sqft = num(r.sqft);
	const thumbUrl = str(r.thumbUrl);
	return {
		id,
		address,
		city,
		state,
		...(price !== undefined ? { price } : {}),
		...(beds !== undefined ? { beds } : {}),
		...(baths !== undefined ? { baths } : {}),
		...(sqft !== undefined ? { sqft } : {}),
		...(thumbUrl !== undefined ? { thumbUrl } : {}),
	};
}

/**
 * Summaries for the given ids (most-recent-first, as the saved store keeps
 * them). Resolves to `[]` on any failure — see the file note.
 */
export function useListingSummaries(
	ids: readonly string[],
): readonly ListingSummaryDTO[] {
	const [summaries, setSummaries] = useState<readonly ListingSummaryDTO[]>([]);
	// The ids array is rebuilt per render by callers; key the effect on content.
	const key = ids.slice(0, SUMMARY_FETCH_CAP).join(",");

	useEffect(() => {
		if (key.length === 0) {
			setSummaries([]);
			return;
		}
		let live = true;
		(async () => {
			try {
				const res = await fetch(listingSummariesUrl(key.split(",")));
				if (!live || !res.ok) return;
				const body = (await res.json()) as { listings?: unknown };
				if (!live || !Array.isArray(body.listings)) return;
				setSummaries(
					body.listings
						.map(parseSummary)
						.filter((s): s is ListingSummaryDTO => s !== null),
				);
			} catch {
				// Soft failure: the sections stay absent.
			}
		})();
		return () => {
			live = false;
		};
	}, [key]);

	return summaries;
}
