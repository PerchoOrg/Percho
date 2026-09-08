import {
	INSURANCE_RATE_ANNUAL,
	REFERENCE_HOME_USD,
	insuranceMonthlyUsd,
} from "@percho/shared/lenses";
import { describe, expect, it } from "vitest";
import { DEFAULT_INSURANCE_RATE, DEFAULT_TAX_RATE } from "./cost";

/**
 * Constants defined twice, for one quantity a buyer sees on two screens.
 *
 * `lenses.ts` prices the area map; `cost.ts` prices the listing page. Where
 * they describe the same thing they must agree, and until now nothing checked
 * that — the only thing keeping them in step was a comment asking politely.
 *
 * phase241 is why this exists: a count I had repeated for thirty phases turned
 * out to be wrong, and the only reason it surfaced is that two independent
 * computations of it finally met. These are two independent definitions of one
 * number, so this is the meeting.
 */
describe("the two screens agree about insurance", () => {
	it("uses one rate", () => {
		// `lenses.ts` says "kept identical so a buyer is never shown two
		// different insurance numbers for one house". This is what makes that
		// sentence true rather than aspirational.
		expect(DEFAULT_INSURANCE_RATE).toBe(INSURANCE_RATE_ANNUAL);
	});

	it("produces the same monthly figure on the same home", () => {
		// Not just the same rate — the same arithmetic. Two roundings of one
		// rate can still disagree by a dollar.
		const listing = Math.round(
			(REFERENCE_HOME_USD * DEFAULT_INSURANCE_RATE) / 12,
		);
		expect(listing).toBe(insuranceMonthlyUsd);
	});
});

describe("the two screens do NOT agree about property tax, and that is known", () => {
	it("the listing page prices tax from a flat rate, not the county's", () => {
		// Deliberate today and disclosed in the assumptions line, but it is not
		// harmless: measured against the county figures the map now carries, the
		// flat 0.85% is 41% LOW in Rockdale ($354 against $596 a month) and 31%
		// HIGH in Dawson ($354 against $271).
		//
		// It cannot be fixed here: the listing detail payload carries no
		// coordinate, so the county cannot be resolved on the client. Fixing it
		// properly is a server-side change to the listing endpoint — flagged for
		// the owner rather than done unasked.
		//
		// This test exists so the number cannot drift quietly while that is
		// pending. If it changes, the finding above is stale and needs redoing.
		expect(DEFAULT_TAX_RATE).toBe(0.0085);
	});
});
