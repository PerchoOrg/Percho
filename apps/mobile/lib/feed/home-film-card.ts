/**
 * A home on the community card's face (phase404.10).
 *
 * Owner, 2026-11-26, of the home cards a liked neighbourhood now leads to:
 * 「房子card 样式还是老的 更新一下」. `ListingFace` is the August design — its
 * own corner, its own foot, an `Explore` link — and every other card in the
 * deck is `CommunityFace` since the city card took it in phase329 ("要保持
 * 一致"). So a home wears it the same way a city does (`cityFilmCard`): the
 * price where the name is, the community over it, and under it what the old
 * face said in its own rows.
 *
 * Every line is the listing's own field. The FMLS number rides with every
 * FMLS listing (IDX rule 13.7.b), as it did on the old face.
 *
 * Pure: no react, no store.
 */
import { fmlsNumberLabel } from "@percho/shared/fmls";
import { abbreviateAddress } from "./abbreviate-address";
import type { CommunityCardV3, ListingCardV3 } from "./card-types";

export interface HomeFilmCard {
	/** The listing as the face reads a card: its film, its still, its name. */
	card: CommunityCardV3;
	/** The eyebrow: "HOME", and whose — "HOME · EDINBURGH". */
	tag: string;
	/** Under the price: the specs, then the address and the FMLS number. */
	lines: readonly string[];
}

export function homeFilmCard(home: ListingCardV3): HomeFilmCard {
	const address = [
		abbreviateAddress(home.address),
		fmlsNumberLabel(home.mlsNumber),
	]
		.filter(Boolean)
		.join(" · ");
	return {
		card: {
			kind: "community",
			id: home.id,
			slug: home.slug,
			// A home with no price is named by its address, once.
			name: home.priceLabel || abbreviateAddress(home.address),
			city: "",
			state: "",
			heroUrl: home.heroUrl,
			...(home.videoUrl ? { videoUrl: home.videoUrl } : {}),
		},
		tag: home.communityName
			? `HOME · ${home.communityName.toUpperCase()}`
			: "HOME",
		lines: [home.bedBathSqft, home.priceLabel ? address : ""].filter(
			(line) => line !== "",
		),
	};
}
