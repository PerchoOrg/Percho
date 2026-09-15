/**
 * "Buyers who liked these also liked" — the feed's one cross-user signal
 * (phase303). Fetches `/api/mobile/similar` for the buyer's liked homes and
 * hands back a `{listingId: 0..1}` map that `swipeScore` folds in as one
 * bounded term.
 *
 * Failure is silent BY DESIGN: the scores are an enrichment on top of a
 * ranking that works without them, and a spinner or an error for a taste
 * hint would cost more than the hint is worth. On any failure the previous
 * map (or nothing) stays in force.
 */
import { useEffect, useState } from "react";
import { similarUrl } from "../lib/api/base";

/** How many of the newest likes seed the query. Server re-caps at 50. */
const CF_SEED_CAP = 20;

export function useCfScores(
	likedListingIds: readonly string[],
): Readonly<Record<string, number>> | undefined {
	const [scores, setScores] = useState<
		Readonly<Record<string, number>> | undefined
	>(undefined);

	// The KEY is the seed list, so a like (or a bring-back) refetches and a
	// mere re-render does not.
	const key = likedListingIds.slice(-CF_SEED_CAP).join(",");

	useEffect(() => {
		if (key === "") {
			setScores(undefined);
			return;
		}
		const controller = new AbortController();
		void (async () => {
			try {
				const res = await fetch(similarUrl(key.split(",")), {
					signal: controller.signal,
				});
				if (!res.ok) return;
				const body = (await res.json()) as {
					scores?: Record<string, number>;
				};
				if (body.scores !== undefined) setScores(body.scores);
			} catch {
				// Offline or aborted — the ranking simply goes without.
			}
		})();
		return () => controller.abort();
	}, [key]);

	return scores;
}
