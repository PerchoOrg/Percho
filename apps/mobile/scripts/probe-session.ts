/**
 * Multi-page composition probe — simulates what the SCREEN actually does:
 * an initial page, then repeated `appendPage()` with a rotating cursor, exactly
 * as `app/(tabs)/feed.tsx` calls it.
 *
 * Kept in the repo because the bug it found is not visible any other way: 36
 * single-page unit tests were green while a real session degenerated to 39
 * consecutive area cards, because page 0 is always clean and the collapse only
 * starts once `seenIds` has consumed the finite client-side content tables.
 *
 * Usage: `npx tsx scripts/probe-session.ts [stage] [pages]`  (default 0, 5)
 * Reach for it whenever a feed complaint is about RHYTHM rather than one card.
 *
 * Not a test: prints, asserts nothing, not run by CI.
 */
import { EMPTY_POOL, generateFeed } from "../lib/feed/generate-feed";
import type { GeoUnit } from "../lib/feed/geo-unit";
import { EMPTY_SIGNALS } from "../lib/feed/signals";

const stage = Number(process.argv[2] ?? 0);
const pages = Number(process.argv[3] ?? 5);

// Real-shaped city units, like the live pool returns for Atlanta metro.
const cities: GeoUnit[] = [
	"Atlanta",
	"Marietta",
	"Alpharetta",
	"Cumming",
	"Lawrenceville",
	"Woodstock",
	"Duluth",
	"Acworth",
	"Decatur",
	"Buford",
	"Ball Ground",
	"Auburn",
].map((name, i) => ({
	id: `city:${name.toLowerCase().replace(/ /g, "-")}-ga`,
	level: "city",
	name,
	state: "GA",
	centroid: { lat: 33.7 + i * 0.05, lng: -84.4 - i * 0.05 },
	communityCount: 40 - i,
	sampleCommunityNames: ["A", "B", "C"],
	stats: {},
}));

const pool = { ...EMPTY_POOL, geoUnits: cities };

let rotate = 0;
const seen: string[] = [];
const all: string[] = [];

for (let p = 0; p < pages; p++) {
	const r = generateFeed({
		stage: 4,
		signals: EMPTY_SIGNALS,
		pool,
		seenIds: [...seen, ...all],
		count: 12,
		rotate,
	});
	rotate = r.nextRotate;
	for (const c of r.cards) {
		all.push(c.id);
	}
	console.log(
		`page ${p}: rotate->${r.nextRotate}  ${r.cards.map((c) => c.kind.slice(0, 4)).join(" ")}`,
	);
}

// Longest run of one kind across the WHOLE session, which is what the buyer feels.
const kinds: string[] = [];
let rotate2 = 0;
const seen2: string[] = [];
for (let p = 0; p < pages; p++) {
	const r = generateFeed({
		stage: 4,
		signals: EMPTY_SIGNALS,
		pool,
		seenIds: seen2.slice(),
		count: 12,
		rotate: rotate2,
	});
	rotate2 = r.nextRotate;
	for (const c of r.cards) {
		kinds.push(c.kind);
		seen2.push(c.id);
	}
}
let run = 1;
let worst = 1;
let worstKind = kinds[0] ?? "";
for (let i = 1; i < kinds.length; i++) {
	if (kinds[i] === kinds[i - 1]) {
		run++;
		if (run > worst) {
			worst = run;
			worstKind = kinds[i] as string;
		}
	} else run = 1;
}
console.log(`\nstage ${stage}, ${pages} pages, ${kinds.length} cards`);
console.log(`longest same-kind run: ${worst} x ${worstKind}`);
console.log("sequence:", kinds.map((k) => k.slice(0, 4)).join(" "));
