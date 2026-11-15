/**
 * Universal links in (phase335). iOS opens `www.percho.co/c/<slug>` and
 * `/city/<slug>` in the app when it is installed (`associatedDomains` in
 * `app.json`, the association file on the site); this turns the web's paths
 * into the app's routes. Anything else — the app's own scheme, sign-in
 * callbacks — passes through untouched.
 */
import { appPathForSharedPath } from "../lib/share/share-link";

export function redirectSystemPath({
	path,
}: { path: string; initial: boolean }): string {
	return appPathForSharedPath(path) ?? path;
}
