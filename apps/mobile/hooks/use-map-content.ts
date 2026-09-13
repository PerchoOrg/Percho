/**
 * `useMapContent` — the zoom-band map's viewport feed (phase281).
 *
 * The Search map no longer drills: past the city band it simply asks
 * `/api/mobile/map` for the communities and homes inside the visible box,
 * re-asking when a pan or zoom SETTLES (the caller passes the region that
 * `onRegionChangeComplete` reported, so this never fires mid-gesture).
 *
 * The box is padded 20% past each edge so a small pan reveals marks that are
 * already there rather than popping them in — `visibleSchools`' trick, one
 * layer up. Stale responses are dropped by sequence number, same as
 * `use-search`. The last result is kept while disabled (zoomed back out to
 * the metro): the bands hide the marks anyway, and keeping it means zooming
 * back in shows the same map instantly instead of a blank beat.
 */
import { useEffect, useRef, useState } from "react";
import { mapUrl } from "../lib/api/base";
import type { MapRegion } from "../lib/schools/school-pins";
import { type SearchResult, parseSearchResult } from "../lib/search/search-dto";

const DEBOUNCE_MS = 300;

interface UseMapContentResult {
	result: SearchResult | null;
	loading: boolean;
}

export function useMapContent(
	region: MapRegion,
	enabled: boolean,
): UseMapContentResult {
	const [result, setResult] = useState<SearchResult | null>(null);
	const [loading, setLoading] = useState(false);
	const seq = useRef(0);

	useEffect(() => {
		if (!enabled) return;
		const mine = ++seq.current;
		setLoading(true);
		const latPad = (region.latitudeDelta / 2) * 1.2;
		const lngPad = (region.longitudeDelta / 2) * 1.2;
		const t = setTimeout(async () => {
			try {
				const res = await fetch(
					mapUrl({
						minLat: region.latitude - latPad,
						maxLat: region.latitude + latPad,
						minLng: region.longitude - lngPad,
						maxLng: region.longitude + lngPad,
					}),
				);
				if (!res.ok) throw new Error(`map ${res.status}`);
				const parsed = parseSearchResult(await res.json());
				if (mine !== seq.current) return;
				setResult(parsed);
				setLoading(false);
			} catch {
				if (mine !== seq.current) return;
				// A failed viewport read keeps the previous marks — a map that
				// quietly goes stale beats one that blinks empty on a bad hop.
				setLoading(false);
			}
		}, DEBOUNCE_MS);
		return () => clearTimeout(t);
	}, [region, enabled]);

	return { result, loading };
}
