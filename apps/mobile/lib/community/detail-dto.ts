/**
 * The community detail DTO client-side.
 *
 * Mirrors `apps/web/lib/communities/detail.ts` — keep the two in sync. The
 * mirror is hand-maintained rather than generated for the reason
 * `lib/listing/detail-dto.ts` gives: the shapes are small and the comment about
 * WHY a field is absent is the valuable half.
 *
 * It lived inside `app/community/[slug].tsx` until phase261, when the compare
 * screen became a second reader. Two hand-kept copies of one wire shape is the
 * defect phases 259–260 were both about, so it moved here rather than being
 * declared twice.
 *
 * Deliberately absent, and permanently: `avg_income`. The column exists on the
 * row and the server refuses to project it — household income on a
 * neighbourhood surface steers buyers by proxy, which is the same fair-housing
 * problem `community-reasons.ts` refuses it for.
 */
// From `icon-font.ts`, which DECLARES the union, and not from `RedlineChrome`,
// which only re-exports it: this module is reached by the pure-TS vitest suite
// (see vitest.config.ts — no React Native runtime), and the component file
// pulls in react-native through its own imports.
import type { RedlineIconName } from "../../components/cards/redline/icon-font";
import type { ReviewDimension } from "../reviews/dimensions";
import type { TourSegment } from "./tour-buckets";

export interface CommunityReasonDTO {
	label: string;
	icon: RedlineIconName;
	/** Present only when a DB row is evidence for THIS reason. */
	fact?: string;
}

export interface CommunityReviewsDTO {
	count: number;
	avgRating: number;
	dimensionAvgs: Partial<Record<ReviewDimension, number>>;
	items: {
		id: string;
		rating: number;
		dimensions: Partial<Record<ReviewDimension, number>>;
		body: string;
		date: string;
	}[];
}

export interface CommunityDetailDTO {
	id: string;
	slug: string;
	name: string;
	city: string;
	state: string;
	heroUrl: string;
	/** The community's film — the SAME one the feed card plays. */
	videoUrl?: string;
	/** Present only when `videoUrl` is the assembled tour. */
	tourSegments?: TourSegment[];
	/** Prose description. Fetched but no longer shown — see the screen header. */
	blurb?: string;
	topReasons: CommunityReasonDTO[];
	moreReasons: CommunityReasonDTO[];
	/**
	 * Up to three figures, printed VERBATIM from their columns (they are text:
	 * "1,050", "35%", "42"), so nothing here rounds a number the seed did not.
	 * A community missing a column simply has fewer entries.
	 */
	stats: { label: string; value: string }[];
	/**
	 * Counts of real places by kind, biggest first. Charted, not narrated.
	 * Optional because a phone can be newer than the deployed API — this
	 * shipped 2026-09-05 and a build in the field must not crash without it.
	 */
	nearby?: { bucket: string; count: number }[];
	interests: string[];
	/** Approved resident reviews (phase E). Absent until one is approved. */
	reviews?: CommunityReviewsDTO;
}
