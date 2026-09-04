/**
 * Stable anonymous install id — the telemetry dedupe key.
 *
 * The event queue's `seq` is monotonic PER INSTALL; the server dedupes on
 * (install_id, seq), so re-sending a batch whose ack was lost is safe. This
 * id exists for that and nothing else: it is not identity (accounts are), it
 * is not persisted anywhere but this device, and a reinstall minting a new
 * one is correct behaviour (the new install's queue restarts at seq 1).
 *
 * Math.random is fine here — the id needs uniqueness across our own
 * installs, not unpredictability.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "percho-v3:install-id:v1";

let cached: string | null = null;

/** RFC-4122-shaped v4 uuid (the server validates the shape). */
function makeUuid(): string {
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === "x" ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

export async function installId(): Promise<string> {
	if (cached) return cached;
	const stored = await AsyncStorage.getItem(KEY).catch(() => null);
	if (stored) {
		cached = stored;
		return stored;
	}
	const fresh = makeUuid();
	cached = fresh;
	await AsyncStorage.setItem(KEY, fresh).catch(() => {
		// Not persisted → next launch mints another id. Harmless: dedupe
		// only ever needs to hold within one install's queue lifetime.
	});
	return fresh;
}
