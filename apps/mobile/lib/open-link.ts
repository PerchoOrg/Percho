/**
 * Open a link without leaving the app (owner 2026-11-27: 「能不能把一些网页链接
 * 做成站内的 不要跳出去？」).
 *
 * A web page opens in the in-app Safari sheet (`expo-web-browser`, i.e.
 * SFSafariViewController): the page over the app, with a Close button that
 * comes straight back. Anything that is not a web page — `mailto:`, `tel:` —
 * still goes to its own app.
 *
 * The browser is a NATIVE module, so a build made before phase411 (the dev
 * client 1.1.0 (15), the store builds up to 1.1.1 (20)) does not have it:
 * loading it there throws, and the link opens in Safari as it always did.
 * The import is therefore lazy and guarded rather than at the top of the file.
 */
import { Linking } from "react-native";
import { colors } from "../theme/tokens";

const WEB = /^https?:\/\//i;

export async function openLink(url: string): Promise<void> {
	if (!url) return;
	if (WEB.test(url)) {
		try {
			const browser = await import("expo-web-browser");
			await browser.openBrowserAsync(url, {
				controlsColor: colors.ink,
				dismissButtonStyle: "close",
				presentationStyle: browser.WebBrowserPresentationStyle.PAGE_SHEET,
			});
			return;
		} catch {
			// No native module in this build, or the sheet could not open:
			// fall through to Safari rather than doing nothing.
		}
	}
	await Linking.openURL(url).catch(() => {});
}
