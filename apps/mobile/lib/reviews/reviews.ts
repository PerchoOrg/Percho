/**
 * Resident reviews (phase E) — the app's half of `community_reviews`.
 *
 * Writes go straight to Supabase under RLS, the same way saves do: the
 * policy only lets a signed-in user upsert their OWN row as `pending`, so
 * there is no route to call and nothing the client can do to publish
 * itself. Reading what is approved is the community endpoint's job
 * (`CommunityDetailDTO.reviews`); this file only reads the user's own row so
 * the form can prefill and the page can say "waiting for review".
 *
 * Mirrors `apps/web/lib/communities/reviews.ts` — keep the dimension keys in
 * step, the server drops any it does not know.
 */
import { supabase } from "../supabase";

export const REVIEW_DIMENSIONS = [
	"quiet",
	"walkable",
	"friendly",
	"value",
] as const;
export type ReviewDimension = (typeof REVIEW_DIMENSIONS)[number];

export const REVIEW_DIMENSION_LABELS: Record<ReviewDimension, string> = {
	quiet: "Quiet",
	walkable: "Walkable",
	friendly: "Neighbourly",
	value: "Value",
};

export const REVIEW_BODY_MIN = 20;
export const REVIEW_BODY_MAX = 1200;

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface ReviewDraft {
	rating: number;
	dimensions: Partial<Record<ReviewDimension, number>>;
	body: string;
}

export interface MyReview extends ReviewDraft {
	status: ReviewStatus;
	updatedAt: string;
}

/** `null` when the draft can be sent, else the line to show under the form. */
export function draftProblem(d: ReviewDraft): string | null {
	if (!Number.isInteger(d.rating) || d.rating < 1 || d.rating > 5)
		return "Pick an overall rating.";
	const len = d.body.trim().length;
	if (len < REVIEW_BODY_MIN)
		return `A few more words — at least ${REVIEW_BODY_MIN} characters.`;
	if (len > REVIEW_BODY_MAX)
		return `Keep it under ${REVIEW_BODY_MAX} characters.`;
	return null;
}

/**
 * Save the signed-in user's review; every save re-enters the queue.
 *
 * Update-then-insert rather than `upsert`: PostgREST's ON CONFLICT clause
 * re-sets every payload column, and the role deliberately lacks UPDATE on
 * `community_id` / `user_id`, so an upsert is refused outright.
 */
export async function submitReview(
	uid: string,
	communityId: string,
	d: ReviewDraft,
): Promise<void> {
	const patch = {
		rating: d.rating,
		dimensions: d.dimensions,
		body: d.body.trim(),
		status: "pending",
	};
	const updated = await supabase()
		.from("community_reviews")
		.update({ ...patch, updated_at: new Date().toISOString() })
		.eq("user_id", uid)
		.eq("community_id", communityId)
		.select("id");
	if (updated.error) throw new Error(updated.error.message);
	if ((updated.data ?? []).length > 0) return;
	// `updated_at` is left to its default here — the insert grant is exactly
	// the columns a new review needs, and that one is not among them.
	const { error } = await supabase()
		.from("community_reviews")
		.insert({ community_id: communityId, user_id: uid, ...patch });
	if (error) throw new Error(error.message);
}

export async function fetchMyReview(
	uid: string,
	communityId: string,
): Promise<MyReview | null> {
	const { data, error } = await supabase()
		.from("community_reviews")
		.select("rating, dimensions, body, status, updated_at")
		.eq("user_id", uid)
		.eq("community_id", communityId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!data) return null;
	const row = data as {
		rating: number;
		dimensions: unknown;
		body: string;
		status: ReviewStatus;
		updated_at: string;
	};
	return {
		rating: row.rating,
		dimensions: parseDimensions(row.dimensions),
		body: row.body,
		status: row.status,
		updatedAt: row.updated_at,
	};
}

export function parseDimensions(
	raw: unknown,
): Partial<Record<ReviewDimension, number>> {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
	const o = raw as Record<string, unknown>;
	const out: Partial<Record<ReviewDimension, number>> = {};
	for (const k of REVIEW_DIMENSIONS) {
		const v = o[k];
		if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5)
			out[k] = v;
	}
	return out;
}

/** "Aug 2026" — the only date a review shows. */
export function reviewMonth(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "";
	return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
