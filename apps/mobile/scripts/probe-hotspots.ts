/**
 * Hotspot / tour probe — runs the REAL §2.3-2.5 derivation against a REAL
 * listing payload from the API, not a fixture.
 *
 * Kept in the repo (same reasoning as `probe-session.ts`) because unit tests
 * cannot see this class of failure: the pure layer can be entirely green while
 * production photo tags still yield zero hotspots, because whether a hotspot
 * exists depends on the ROOM MIX a real listing happens to have. Four exterior
 * shots plus three hallways is green in every unit test and produces no tour.
 *
 * Usage: `npx tsx scripts/probe-hotspots.ts <listing-id> [apiBase]`
 */
import { buildHotspots, buildListingTour } from "../lib/listing/build-hotspots";
import type { ListingDetailDTO } from "../lib/listing/detail-dto";

async function main() {
	const id = process.argv[2];
	const base = process.argv[3] ?? "http://localhost:3000";
	if (!id) {
		console.error(
			"usage: npx tsx scripts/probe-hotspots.ts <listing-id> [apiBase]",
		);
		process.exit(2);
	}

	const res = await fetch(`${base}/api/mobile/listing/${id}`);
	if (!res.ok) {
		console.error(`HTTP ${res.status}`);
		process.exit(1);
	}
	const detail = (await res.json()) as ListingDetailDTO;

	const tagged = detail.photos.filter((p) => p.tags).length;
	console.log(`address     : ${detail.address}, ${detail.city}`);
	console.log(`photos      : ${detail.photos.length} (${tagged} tagged)`);
	console.log(
		`rooms       : ${detail.photos
			.map((p) => p.tags?.room_type)
			.filter(Boolean)
			.join(", ")}`,
	);

	const hotspots = buildHotspots(detail.photos, {
		comps: detail.comps,
		...(detail.sqft !== undefined ? { sqft: detail.sqft } : {}),
		...(detail.yearBuilt !== undefined ? { yearBuilt: detail.yearBuilt } : {}),
	});

	console.log(`\nhotspots    : ${hotspots.length}`);
	for (const h of hotspots) {
		console.log(
			`  ${h.room.padEnd(9)} ${h.actions.length} actions  pin=(${h.pin.x.toFixed(2)},${h.pin.y.toFixed(2)})  ${h.title.slice(0, 46)}`,
		);
	}

	const tour = buildListingTour(hotspots, {
		...(detail.sqft !== undefined ? { sqft: detail.sqft } : {}),
		...(detail.beds !== undefined ? { beds: detail.beds } : {}),
		...(detail.yearBuilt !== undefined ? { yearBuilt: detail.yearBuilt } : {}),
	});

	if (!tour) {
		console.log(
			"\ntour        : NONE (fewer than 3 evidence-backed stops -> free explore)",
		);
		return;
	}
	console.log(
		`\ntour        : ${tour.stops.length} stops (generic=${tour.generic})`,
	);
	for (const [i, stop] of tour.stops.entries()) {
		console.log(
			`  ${i + 1}. ${stop.hotspot.room.padEnd(9)} "${stop.why}" [${stop.evidence
				.map((e) => `${e.count} ${e.label}`)
				.join(" · ")}]`,
		);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
