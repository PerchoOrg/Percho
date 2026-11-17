/**
 * A city card, as the community card's face draws it (phase329).
 *
 * Owner, on the first city card in the app: "视频本身的字和卡片的字重合了 city
 * label也没有像community卡的位置一样 视频没有进度条 等等 你再看看community card,
 * 要保持一致". The city card had its own face (`AreaFace`) — no place label, no
 * progress bar, its name and link where the film draws its figures. So a city
 * with a film is now drawn by `CommunityFace`, which already does all of it;
 * this maps the city's unit into the fields that face reads.
 *
 * The card in the DECK stays `kind: "area"`: its id, its save and its swipe
 * signal are a city's. Only the face is shared.
 *
 * Null for a city without a film — that city has nothing for this face to
 * play, and `AreaFace` still draws it.
 */
import type { AreaCardV3, CommunityCardV3 } from "./card-types";

export function cityFilmCard(card: AreaCardV3): CommunityCardV3 | null {
	const { unit } = card;
	if (!unit.videoUrl) return null;
	return {
		kind: "community",
		id: card.id,
		slug: unit.citySlug ?? unit.id,
		name: unit.name,
		city: unit.name,
		state: unit.state,
		heroUrl: unit.heroUrl ?? "",
		videoUrl: unit.videoUrl,
		geoUnitId: unit.id,
		lat: unit.centroid.lat,
		lng: unit.centroid.lng,
		...(unit.tourSegments && unit.tourSegments.length > 0
			? { tourSegments: unit.tourSegments }
			: {}),
		...(unit.tourChapters && unit.tourChapters.length > 0
			? { tourChapters: unit.tourChapters }
			: {}),
	};
}
