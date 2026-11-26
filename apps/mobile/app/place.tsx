/**
 * `/place` — one place's own deck (phase404.3): a city's neighbourhoods, or a
 * neighbourhood's homes, as the feed's own swipe cards and nothing else.
 *
 * Opened from the place's Explore page ("More of Suwanee ›"). Owner,
 * 2026-11-26, on `/demos/feed-focus-v2`: 「感觉放在explore page里比较好」 — the
 * way in is there, not on the feed.
 *
 * The feed screen itself, over a pool the server narrowed to the place
 * (`/api/mobile/feed?city=…`): one deck, one set of faces, one swipe.
 * A pushed page, so back is the way out and nothing is remembered: the app
 * always opens on the feed.
 */
import { Redirect, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { parsePlaceFocus } from "../lib/feed/follow";
import FeedScreen from "./(tabs)/feed";

export default function PlaceScreen() {
	const { kind, id, name } = useLocalSearchParams<{
		kind?: string;
		id?: string;
		name?: string;
	}>();
	const focus = useMemo(
		() => parsePlaceFocus({ kind, id, name }),
		[kind, id, name],
	);
	if (!focus) return <Redirect href="/feed" />;
	return <FeedScreen focus={focus} />;
}
