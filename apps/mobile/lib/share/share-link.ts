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
 * app, so a buyer WITH the app lands on the same place in it.
 *
 * `www`, not the apex: `percho.co` answers 308 to `www`, and iOS does not
 * follow a redirect when it fetches the association file.
 */
import type { FeedCardV3 } from "../feed/card-types";

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
 * What `Share.share` is handed. iOS puts `url` in the link preview and
 * `message` beside it; a target that drops `url` (SMS on some carriers) still
 * gets the link because the message ends with it.
 */
export function shareContent(target: ShareTarget): {
	message: string;
	url: string;
} {
	const url = shareUrl(target);
	return { message: `${target.name} on Percho — ${url}`, url };
}

/**
 * A universal link → the app route that shows it, or null to let the router
 * take it as it is. Expo Router hands `+native-intent` either a whole URL
 * (`https://www.percho.co/c/x`) or a bare path, so the scheme and host are
 * stripped first.
 *
 * A shared film (`/watch/c/<slug>`, `/watch/city/<slug>`) opens the page
 * behind it. The web and the app name the community route differently
 * (`/c/<slug>` vs `/community/<slug>`); the city route is `/city/<slug>` on
 * both. The web
 * community page's video feed (`/c/<slug>/feed`) has no screen of its own in
 * the app — the community page is the nearest thing. Query and hash are
 * dropped: the app's screens take nothing from them.
 */
export function appPathForSharedPath(path: string): string | null {
	const bare = (path.split(/[?#]/)[0] ?? "").replace(
		/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i,
		"",
	);
	const community = /^(?:\/watch)?\/c\/([^/]+)(?:\/feed)?\/?$/.exec(bare);
	if (community?.[1]) return `/community/${community[1]}`;
	const city = /^(?:\/watch)?\/city\/([^/]+)\/?$/.exec(bare);
	if (city?.[1]) return `/city/${city[1]}`;
	return null;
}
