import { PREFERENCE_ASKS, TRADEOFFS } from "../lib/feed/content";
import { EMPTY_POOL, generateFeed } from "../lib/feed/generate-feed";
import { FIRST_PAGE_SIZE } from "../lib/feed/ratios";
import { EMPTY_SIGNALS } from "../lib/feed/signals";

// A returning buyer: seenIds is persisted, so he starts with everything seen.
const allSeen = [
	...PREFERENCE_ASKS.map((a) => a.id),
	...TRADEOFFS.map((t) => t.id),
];
console.log("persisted seenIds:", allSeen.length);

const r = generateFeed({
	stage: 0,
	signals: EMPTY_SIGNALS,
	pool: EMPTY_POOL,
	seenIds: allSeen,
	count: FIRST_PAGE_SIZE,
	rotate: 0,
});
const ids = r.cards.map((c) => c.id);
console.log("FIRST page ids:", ids);
const d = ids.filter((x, i) => ids.indexOf(x) !== i);
console.log(
	"exhausted:",
	r.exhausted,
	"| dupes ON FIRST PAGE:",
	JSON.stringify([...new Set(d)]),
);
