/**
 * The real event transport — POST the queue to `/api/mobile/events`.
 *
 * Contract (`state/event-queue.ts`): resolve true only when the batch is
 * durably accepted. The server dedupes on (install_id, seq), so returning
 * false and re-sending later can never double-count.
 *
 * `drain()` hands over the WHOLE queue (up to 500 events); the server caps a
 * request at 100, so the transport chunks. All chunks must land for the ack —
 * a partial failure re-sends everything next drain, and the already-landed
 * chunks dedupe server-side.
 *
 * The session token rides along when present so signed-in behaviour is
 * attributable; its absence (or expiry) must never cost telemetry.
 */
import type { EventTransport } from "../state/event-queue";
import { eventsUrl } from "./api/base";
import { installId } from "./install-id";
import { supabase } from "./supabase";

const CHUNK = 100;

export function createEventsTransport(): EventTransport {
	return async (batch) => {
		const id = await installId();
		const { data } = await supabase()
			.auth.getSession()
			.catch(() => ({ data: { session: null } }));
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		const token = data.session?.access_token;
		if (token) headers.Authorization = `Bearer ${token}`;

		for (let i = 0; i < batch.length; i += CHUNK) {
			const res = await fetch(eventsUrl(), {
				method: "POST",
				headers,
				body: JSON.stringify({
					installId: id,
					events: batch.slice(i, i + CHUNK),
				}),
			});
			if (!res.ok) return false;
		}
		return true;
	};
}
