/**
 * API base resolution (PLAN §2 "API base", a 05 §5.6 prerequisite).
 *
 * The legacy feed screen hardcoded a `trycloudflare.com` tunnel URL that is long
 * dead — every ephemeral tunnel URL eventually is, which is exactly why this
 * cannot live in a source constant. Resolution order:
 *
 *   1. `EXPO_PUBLIC_API_BASE` — set in the shell for LAN / tunnel dev. Expo
 *      inlines `EXPO_PUBLIC_*` at bundle time, so this works in Expo Go with no
 *      native rebuild.
 *   2. `app.json` → `expo.extra.apiBase` — the committed default (production).
 *   3. A hardcoded production fallback, so a malformed config degrades to the
 *      real API rather than to `undefined/api/...`.
 *
 * Trailing slashes are stripped here so callers can always write `${apiBase()}/api/...`.
 */
import Constants from "expo-constants";

const PRODUCTION = "https://www.percho.co";

function trimSlash(url: string): string {
	return url.replace(/\/+$/, "");
}

export function apiBase(): string {
	const fromEnv = process.env.EXPO_PUBLIC_API_BASE;
	if (fromEnv && fromEnv.trim().length > 0) return trimSlash(fromEnv.trim());

	const extra = Constants.expoConfig?.extra as
		| { apiBase?: unknown }
		| undefined;
	const configured = extra?.apiBase;
	if (typeof configured === "string" && configured.trim().length > 0) {
		return trimSlash(configured.trim());
	}

	return PRODUCTION;
}

/** `/api/mobile/listing/<id-or-slug>` — the task-2 detail endpoint (§2.1). */
export function listingDetailUrl(idOrSlug: string): string {
	return `${apiBase()}/api/mobile/listing/${encodeURIComponent(idOrSlug)}`;
}

/** `/api/mobile/community/<id-or-slug>` — the community detail endpoint. */
export function communityDetailUrl(idOrSlug: string): string {
	return `${apiBase()}/api/mobile/community/${encodeURIComponent(idOrSlug)}`;
}

/** `/api/mobile/feed` — the stage-aware pool endpoint (spec-v3 §1.7). */
export function feedPoolUrl(params: {
	stage: number;
	offset: number;
	limit: number;
	/** Funnel city scope; also the stage-3 preview join key. */
	cities?: readonly string[];
	likedCommunityIds?: readonly string[];
	videosOnly?: boolean;
	/**
	 * Dev-only: ask the server to hoist listings that have a 9:16 video into the
	 * page. Distinct from `videosOnly`, which DROPS photo-only listings and so
	 * hides §0.7's "no video is a first-class state".
	 */
	videoFirst?: boolean;
}): string {
	const q = new URLSearchParams({
		stage: String(params.stage),
		offset: String(params.offset),
		limit: String(params.limit),
	});
	if (params.cities?.length) q.set("cities", params.cities.join(","));
	if (params.likedCommunityIds?.length) {
		q.set("likedCommunityIds", params.likedCommunityIds.join(","));
	}
	if (params.videosOnly) q.set("videosOnly", "1");
	if (params.videoFirst) q.set("videoFirst", "1");
	return `${apiBase()}/api/mobile/feed?${q.toString()}`;
}

/**
 * `/api/mobile/listings?ids=…` — batch summaries for the explore page's
 * CompareRail and FitCard derivation (phase119). Caller caps the id count;
 * the server re-caps at 24 regardless.
 */
export function listingSummariesUrl(ids: readonly string[]): string {
	return `${apiBase()}/api/mobile/listings?ids=${ids
		.map(encodeURIComponent)
		.join(",")}`;
}
