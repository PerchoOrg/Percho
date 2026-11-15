import { describe, expect, it } from "vitest";
import type { AreaCardV3 } from "./card-types";
import { cityFilmCard } from "./city-film-card";

const area = (over: Partial<AreaCardV3["unit"]> = {}): AreaCardV3 => ({
	kind: "area",
	id: "area-city:suwanee-ga",
	unit: {
		id: "city:suwanee-ga",
		level: "city",
		name: "Suwanee",
		state: "GA",
		centroid: { lat: 34.05, lng: -84.07 },
		communityCount: 126,
		sampleCommunityNames: [],
		stats: {},
		...over,
	},
});

describe("cityFilmCard", () => {
	it("is null for a city without a film — AreaFace still draws that one", () => {
		expect(cityFilmCard(area())).toBeNull();
	});

	it("keeps the deck card's id, so a save and a swipe stay the city's", () => {
		const card = cityFilmCard(
			area({
				videoUrl: "https://videodelivery.net/abc/manifest/video.m3u8",
				heroUrl: "https://videodelivery.net/abc/thumbnails/thumbnail.jpg",
				citySlug: "suwanee-ga",
				tourSegments: [
					{ name: "Town Center Park", endFraction: 0.1 },
					{ name: "Old Town", endFraction: 1 },
				],
			}),
		);
		expect(card).toMatchObject({
			id: "area-city:suwanee-ga",
			slug: "suwanee-ga",
			name: "Suwanee",
			videoUrl: "https://videodelivery.net/abc/manifest/video.m3u8",
			heroUrl: "https://videodelivery.net/abc/thumbnails/thumbnail.jpg",
		});
		expect(card?.tourSegments?.map((s) => s.name)).toEqual([
			"Town Center Park",
			"Old Town",
		]);
	});

	it("draws a plain bar when the film's structure did not come down with it", () => {
		const card = cityFilmCard(area({ videoUrl: "https://v/x.m3u8" }));
		expect(card && "tourSegments" in card).toBe(false);
	});
});
