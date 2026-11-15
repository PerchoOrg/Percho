/**
 * Opens the iOS share sheet for a community or city (phase335). Kept apart
 * from `share-link.ts` so that file's tests never load react-native.
 */
import { Share } from "react-native";
import { type ShareTarget, shareContent } from "./share-link";

export function openShareSheet(target: ShareTarget): void {
	// A dismissed sheet resolves; a rejection here is the sheet failing to open,
	// which leaves nothing for the buyer to retry from a toast.
	void Share.share(shareContent(target)).catch(() => {});
}
