/**
 * Share links (phase335) — one URL per community or city, the same URL in
 * both directions.
 *
 * Owner's use case: an agent sends a city or community card to a buyer, and
 * the buyer explores everything else from there. So the link is a web page
 * that plays the film and nothing else, with one button to the app
 * (`www.percho.co/watch/c/<slug>`, `/watch/city/<slug>` — phase336; the owner
 * did not want a shared link to open the full web page), AND a universal
 * link: `app.json` claims `www.percho.co` and the site's
 * `apple-app-site-association` hands `/watch/*`, `/c/*` and `/city/*` to the
 * app, so a buyer WITH the app lands in the deck with that card in front.
 *
 * `www`, not the apex: `percho.co` answers 308 to `www`, and iOS does not
 * follow a redirect when it fetches the association file.
 */
import type { FeedCardV3 } from "../feed/card-types";
import type { FeedPool } from "../feed/generate-feed";

export const SHARE_HOST = "https://www.percho.co";

export type ShareTarget =
	| { kind: "community"; slug: string; name: string }
	| { kind: "city"; slug: string; name: string };

/**
 * What a deck card shares, or null when it has no page to open: a listing or
 * trade-off card, or a city unit with no city page behind it.
 */
export function shareTargetForCard(card: FeedCardV3): ShareTarget | null {
	if (card.kind === "community") {
		return { kind: "community", slug: card.slug, name: card.name };
	}
	if (card.kind === "area" && card.unit.citySlug) {
		return { kind: "city", slug: card.unit.citySlug, name: card.unit.name };
	}
	return null;
}

/** The page a shared card opens — on the web, and in the app when installed. */
export function shareUrl(target: ShareTarget): string {
	const slug = encodeURIComponent(target.slug);
	return target.kind === "community"
		? `${SHARE_HOST}/watch/c/${slug}`
		: `${SHARE_HOST}/watch/city/${slug}`;
}

/**
 * What `Share.share` is handed: the link alone (phase337). With a `message`
 * beside it — which ended with the same link — Messages showed it twice
 * (owner: "发送message 会有两个链接"). Alone, it draws one card from the
 * page's own title and film frame.
 */
export function shareContent(target: ShareTarget): { url: string } {
	return { url: shareUrl(target) };
}

/** A shared card as the feed's `shared` param carries it: `community:<slug>`. */
export type SharedRef = { kind: "community" | "city"; slug: string };

/**
 * A universal link → where the app opens it, or null to let the router take
 * it as it is. Expo Router hands `+native-intent` either a whole URL
 * (`https://www.percho.co/c/x`) or a bare path, so the scheme and host are
 * stripped first.
 *
 * Every community or city link — the shared film (`/watch/c/<slug>`,
 * `/watch/city/<slug>`), the web pages (`/c/<slug>`, its `/feed`,
 * `/city/<slug>`) — opens the SWIPE DECK with that card on top (phase337,
 * owner: "跳转到app的explore页面 不是swipe的页面"); the buyer swipes on from
 * it into everything else. Query and hash are dropped.
 */
export function appPathForSharedPath(path: string): string | null {
	const bare = (path.split(/[?#]/)[0] ?? "").replace(
		/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i,
		"",
	);
	const community = /^(?:\/watch)?\/c\/([^/]+)(?:\/feed)?\/?$/.exec(bare);
	if (community?.[1]) return `/feed?shared=community:${community[1]}`;
	const city = /^(?:\/watch)?\/city\/([^/]+)\/?$/.exec(bare);
	if (city?.[1]) return `/feed?shared=city:${city[1]}`;
	return null;
}

/** The feed's `shared` param back into a ref, or null for anything else. */
export function parseSharedParam(value: unknown): SharedRef | null {
	if (typeof value !== "string") return null;
	const m = /^(community|city):(.+)$/.exec(value);
	if (!m?.[1] || !m[2]) return null;
	return { kind: m[1] as SharedRef["kind"], slug: decodeURIComponent(m[2]) };
}

/**
 * The deck card for a shared ref, built from the pool the deck is built from
 * — the same card a swipe would have reached — or null while the pool has
 * not loaded it.
 */
export function sharedCardInPool(
	pool: Pick<FeedPool, "communities" | "geoUnits">,
	ref: SharedRef,
): FeedCardV3 | null {
	if (ref.kind === "community") {
		return pool.communities.find((c) => c.slug === ref.slug) ?? null;
	}
	const unit = pool.geoUnits.find((u) => u.citySlug === ref.slug);
	return unit ? { kind: "area", id: `area-${unit.id}`, unit } : null;
}

/**
 * The deck with `card` as the one in front (at `index`), and no second copy
 * of it further on. Cards already swiped stay where they are.
 */
export function putOnTop(
	deck: readonly FeedCardV3[],
	index: number,
	card: FeedCardV3,
): FeedCardV3[] {
	const rest = deck.slice(index).filter((c) => c.id !== card.id);
	return [...deck.slice(0, index), card, ...rest];
}
