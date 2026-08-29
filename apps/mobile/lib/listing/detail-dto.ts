/**
 * The listing detail DTO client-side, plus the hook the explore screen uses.
 *
 * Mirrors `apps/web/lib/listing/detail.ts` — keep the two in sync. The mirror is
 * hand-maintained rather than generated because the shapes are small and the
 * comment about WHY a field is absent is the valuable half.
 *
 * `daysOnMarket` is absent from both by design: the schema has no listing date.
 * Do not add it speculatively.
 */
import { useCallback, useEffect, useState } from "react";
import { listingDetailUrl } from "../api/base";

export interface PhotoTagsDTO {
	room_type?: string | null;
	caption?: string | null;
	style_signals?: string[] | null;
	subject_bbox?: number[] | null;
	quality?: number | null;
	hero_score?: number | null;
	usable?: boolean | null;
}

export interface DetailPhotoDTO {
	id: string;
	url: string;
	/** Present only for photos the vision tagger has processed. */
	tags?: PhotoTagsDTO;
}

export interface CompsCohortDTO {
	/** The cohort actually measured — a city today, never a subdivision. */
	cohortLabel: string;
	pricesUsd: number[];
	medianPricePerSqft?: number;
	medianPricePerSqftSampleSize?: number;
}

/** The listing's own walkthrough video, when one has been rendered. */
export interface ListingVideoDTO {
	/** HLS manifest URL (Cloudflare Stream). */
	url: string;
	posterUrl: string;
	durationSec?: number;
}

/** One "Based on" item under a question's answer. */
export interface QuestionBasisDTO {
	type: string;
	note: string;
	url?: string;
}

/**
 * An approved move-in question answer (phase126). The question text is NOT
 * carried — `@percho/shared/questions` owns it, keyed by `id`.
 */
export interface QuestionAnswerDTO {
	id: string;
	answer: string;
	basis: QuestionBasisDTO[];
	verify?: string;
	decisiveness: 1 | 2 | 3;
	form: string;
}

export interface ListingDetailDTO {
	id: string;
	slug: string;
	address: string;
	city: string;
	state: string;
	price?: number;
	beds?: number;
	baths?: number;
	sqft?: number;
	yearBuilt?: number;
	/** RAW text — parse with `parseHoaMonthlyUsd`. */
	hoaRaw?: string;
	description?: string[];
	photos: DetailPhotoDTO[];
	comps: CompsCohortDTO;
	communityId?: string;
	/** From the `mls_listings` mirror; absent when no mirror row is linked. */
	daysOnMarket?: number;
	/** RAW lot text ("0.31 acres", "13,504 sqft"…). */
	lotSizeRaw?: string;
	/** Mirror acres — present only when `lotSizeRaw` is not. */
	lotSizeAcres?: number;
	zip?: string;
	neighborhood?: string;
	/** The FMLS number a buyer can quote. */
	mlsNumber?: string;
	video?: ListingVideoDTO;
	/** Approved move-in question answers. Absent when the listing has none. */
	questions?: QuestionAnswerDTO[];
}

type State =
	| { status: "loading" }
	| { status: "ready"; detail: ListingDetailDTO }
	| { status: "missing" }
	| { status: "error"; message: string };

/**
 * Fetches one listing. `missing` is modelled separately from `error` because the
 * screen says different things for "this home is gone" and "the network failed",
 * and collapsing them would show a retry button that can never succeed.
 */
export function useListingDetail(idOrSlug: string | undefined): State & {
	reload: () => void;
} {
	const [state, setState] = useState<State>({ status: "loading" });
	const [nonce, setNonce] = useState(0);

	const reload = useCallback(() => setNonce((n) => n + 1), []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` is the reload TRIGGER, not a value this effect reads. Biome sees no read and calls it unnecessary; removing it makes `reload()` a no-op.
	useEffect(() => {
		if (!idOrSlug) {
			setState({ status: "missing" });
			return;
		}

		// Guards against a late response from a previous id overwriting the
		// current one — a real hazard here because the buyer can pop back to the
		// feed and open a different listing before the first request lands.
		let live = true;
		setState({ status: "loading" });

		(async () => {
			try {
				const res = await fetch(listingDetailUrl(idOrSlug));
				if (!live) return;
				if (res.status === 404) {
					setState({ status: "missing" });
					return;
				}
				if (!res.ok) {
					setState({ status: "error", message: `HTTP ${res.status}` });
					return;
				}
				const detail = (await res.json()) as ListingDetailDTO;
				if (!live) return;
				setState({ status: "ready", detail });
			} catch (err) {
				if (!live) return;
				setState({
					status: "error",
					message: err instanceof Error ? err.message : "network error",
				});
			}
		})();

		return () => {
			live = false;
		};
	}, [idOrSlug, nonce]);

	return { ...state, reload };
}
