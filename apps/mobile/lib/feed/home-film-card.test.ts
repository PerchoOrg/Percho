import { describe, expect, it } from "vitest";
import type { ListingCardV3 } from "./card-types";
import { homeFilmCard } from "./home-film-card";

const home: ListingCardV3 = {
	kind: "listing",
	id: "l-1",
	slug: "355-morgans-creek-ct",
	address: "355 Morgans Creek Court",
	priceLabel: "$685,000",
	bedBathSqft: "4 bd · 3 ba · 2,853 sqft",
	heroUrl: "https://example.test/l.jpg",
	videoUrl: "https://example.test/l.m3u8",
	communityName: "Edinburgh",
	mlsNumber: "7404568",
};

describe("homeFilmCard — a home on the community card's face", () => {
	it("puts the price where the name is, over the home's own film", () => {
		const { card } = homeFilmCard(home);
		expect(card).toMatchObject({
			id: "l-1",
			name: "$685,000",
			heroUrl: home.heroUrl,
			videoUrl: home.videoUrl,
		});
	});

	it("says whose home it is in the eyebrow", () => {
		expect(homeFilmCard(home).tag).toBe("HOME · EDINBURGH");
		const { communityName: _none, ...loose } = home;
		expect(homeFilmCard(loose).tag).toBe("HOME");
	});

	it("keeps the specs, the address and the FMLS number under the price", () => {
		expect(homeFilmCard(home).lines).toEqual([
			"4 bd · 3 ba · 2,853 sqft",
			"355 Morgans Creek Ct · FMLS #7404568",
		]);
	});

	it("leaves out a line it has nothing for", () => {
		const { mlsNumber: _none, ...plain } = home;
		expect(homeFilmCard({ ...plain, bedBathSqft: "" }).lines).toEqual([
			"355 Morgans Creek Ct",
		]);
	});

	it("names a home with no price by its address, and does not say it twice", () => {
		const out = homeFilmCard({ ...home, priceLabel: "" });
		expect(out.card.name).toBe("355 Morgans Creek Ct");
		expect(out.lines).toEqual(["4 bd · 3 ba · 2,853 sqft"]);
	});

	it("has no film for a home with photos only", () => {
		const { videoUrl: _none, ...photos } = home;
		expect(homeFilmCard(photos).card).not.toHaveProperty("videoUrl");
	});
});
