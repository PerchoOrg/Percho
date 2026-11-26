/**
 * The six FMLS test listings' films, for a development bundle
 * (`TEST_HOMES`, `lib/feed/test-homes.ts`). None in any other bundle — and no
 * request is made for them.
 *
 * Read once for the whole app: the feed, a place's page and the Explore
 * page's link all ask, and the answer does not change while the app is open.
 */
import { useEffect, useState } from "react";
import { feedPoolUrl } from "../lib/api/base";
import type { ListingCardV3 } from "../lib/feed/card-types";
import { parsePoolResponse } from "../lib/feed/pool-dto";
import { TEST_HOMES } from "../lib/listings-in-app";

const NONE: readonly ListingCardV3[] = [];
let read: Promise<readonly ListingCardV3[]> | null = null;
/** What `read` resolved to, so a screen opened later has them on its first render. */
let loaded: readonly ListingCardV3[] = NONE;

async function fetchTestHomes(): Promise<readonly ListingCardV3[]> {
	const res = await fetch(
		feedPoolUrl({
			stage: 4,
			offset: 0,
			limit: 12,
			videosOnly: true,
			listings: true,
		}),
	);
	if (!res.ok) throw new Error(`test homes: HTTP ${res.status}`);
	loaded = parsePoolResponse(await res.json()).pool.listings;
	return loaded;
}

export function useTestHomes(): readonly ListingCardV3[] {
	const [homes, setHomes] = useState(loaded);
	useEffect(() => {
		if (!TEST_HOMES) return;
		let alive = true;
		read ??= fetchTestHomes().catch(() => {
			// Let the next screen that asks try again.
			read = null;
			return NONE;
		});
		read.then((h) => alive && setHomes(h));
		return () => {
			alive = false;
		};
	}, []);
	return homes;
}
