/**
 * Saved store v3 — the server-backed contract. What needs proving:
 *
 *   1. The sign-in gate lives in `toggle` (signed out → route to /auth, no
 *      local mutation — an unsynced save must never exist).
 *   2. Optimistic writes revert when the server says no.
 *   3. `syncSaved` pushes pre-account local saves exactly ONCE (`migratedAt`),
 *      then adopts the server list, newest first.
 *   4. Sign-out clears the list (it belongs to the account, not the device).
 *
 * `lib/supabase` is mocked with a tiny in-memory table pair; `expo-router`
 * with a spy. Everything else is the real store.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const routerPush = vi.fn();
vi.mock("expo-router", () => ({
	router: { push: (p: string) => routerPush(p) },
}));

type Row = Record<string, string>;
const db: { saved_listings: Row[]; saved_communities: Row[] } = {
	saved_listings: [],
	saved_communities: [],
};
let insertError: { code: string; message: string } | null = null;
let clock = 0;

function table(name: keyof typeof db) {
	return {
		insert: async (row: Row) => {
			if (insertError) return { error: insertError };
			db[name].push({ ...row, created_at: `2026-09-04T00:00:0${clock++}Z` });
			return { error: null };
		},
		delete: () => {
			const filters: Array<[string, string]> = [];
			const builder = {
				eq(col: string, val: string) {
					filters.push([col, val]);
					return builder;
				},
				// biome-ignore lint/suspicious/noThenProperty: supabase-js query builders ARE thenables — `.delete().eq().eq()` is awaited directly in the store, so the mock must be awaitable the same way.
				then(resolve: (v: { error: null }) => void) {
					db[name] = db[name].filter(
						(r) => !filters.every(([col, val]) => r[col] === val),
					);
					resolve({ error: null });
				},
			};
			return builder;
		},
		select: () => ({
			eq: async (col: string, val: string) => ({
				data: db[name].filter((r) => r[col] === val),
				error: null,
			}),
		}),
	};
}

vi.mock("../lib/supabase", () => ({
	supabase: () => ({ from: (name: string) => table(name as keyof typeof db) }),
}));

import { useAuthStore } from "./auth";
import { syncSaved, useSavedStore } from "./saved";

const flush = () => new Promise((r) => setTimeout(r, 0));

function signIn(uid: string) {
	useAuthStore.setState({
		session: { user: { id: uid } } as never,
		hydrated: true,
	});
}

beforeEach(async () => {
	db.saved_listings = [];
	db.saved_communities = [];
	insertError = null;
	clock = 0;
	routerPush.mockClear();
	useAuthStore.setState({ session: null, hydrated: true });
	useSavedStore.setState({ items: [], hydrated: true, migratedAt: null });
	await flush();
	// The auth subscription reacted to the resets above; start each test clean.
	useSavedStore.setState({ items: [], migratedAt: null });
});

describe("toggle, signed out", () => {
	it("routes to /auth and does not save", () => {
		const result = useSavedStore.getState().toggle("l1", "listing");
		expect(result).toBe(false);
		expect(useSavedStore.getState().items).toEqual([]);
		expect(routerPush).toHaveBeenCalledWith("/auth");
	});

	it("still toggles device-local area entries", () => {
		expect(useSavedStore.getState().toggle("a1", "area")).toBe(true);
		expect(useSavedStore.getState().items).toEqual([
			{ id: "a1", kind: "area" },
		]);
		expect(routerPush).not.toHaveBeenCalled();
	});
});

describe("toggle, signed in", () => {
	it("saves optimistically and writes the user's row", async () => {
		signIn("u1");
		await flush();
		expect(useSavedStore.getState().toggle("l1", "listing")).toBe(true);
		expect(useSavedStore.getState().isSaved("l1")).toBe(true);
		await flush();
		expect(db.saved_listings).toEqual([
			expect.objectContaining({
				device_id: "u1",
				user_id: "u1",
				listing_id: "l1",
			}),
		]);
	});

	it("unsave deletes the row", async () => {
		signIn("u1");
		await flush();
		useSavedStore.getState().toggle("c1", "community");
		await flush();
		useSavedStore.getState().toggle("c1", "community");
		await flush();
		expect(db.saved_communities).toEqual([]);
		expect(useSavedStore.getState().items).toEqual([]);
	});

	it("reverts the optimistic flip when the server refuses", async () => {
		signIn("u1");
		await flush();
		insertError = { code: "42501", message: "denied" };
		useSavedStore.getState().toggle("l1", "listing");
		expect(useSavedStore.getState().isSaved("l1")).toBe(true);
		await flush();
		expect(useSavedStore.getState().isSaved("l1")).toBe(false);
	});
});

describe("syncSaved", () => {
	it("pushes local saves once, then adopts the server list newest-first", async () => {
		useSavedStore.setState({
			items: [
				{ id: "local-l", kind: "listing" },
				{ id: "a1", kind: "area" },
			],
			migratedAt: null,
		});
		db.saved_communities.push({
			user_id: "u1",
			community_id: "remote-c",
			created_at: "2026-09-05T00:00:00Z",
		});

		await syncSaved("u1");

		// Local push happened…
		expect(db.saved_listings).toEqual([
			expect.objectContaining({ user_id: "u1", listing_id: "local-l" }),
		]);
		// …server list adopted (remote community is newer than the pushed row),
		// area entries kept device-local at the end.
		expect(useSavedStore.getState().items).toEqual([
			{ id: "remote-c", kind: "community" },
			{ id: "local-l", kind: "listing" },
			{ id: "a1", kind: "area" },
		]);
		expect(useSavedStore.getState().migratedAt).not.toBeNull();

		// A second sync must NOT re-push (the migration is one-time).
		db.saved_listings = [];
		await syncSaved("u1");
		expect(db.saved_listings).toEqual([]);
	});
});

describe("auth subscription", () => {
	it("clears the list on sign-out", async () => {
		signIn("u1");
		await flush();
		useSavedStore.getState().toggle("l1", "listing");
		await flush();
		useAuthStore.setState({ session: null, hydrated: true });
		await flush();
		expect(useSavedStore.getState().items).toEqual([]);
	});
});
