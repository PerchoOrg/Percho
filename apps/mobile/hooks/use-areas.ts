/**
 * `useAreas` — the county shapes and metrics behind the Search tab's lenses.
 *
 * Fetched once per mount and held; county lines and millage rates do not move
 * while a buyer is panning a map, so there is no refetch, no polling and no
 * dependency on the query. A failure leaves the map in its plain state with
 * the chips hidden rather than showing an error the buyer can do nothing
 * about — the tab's own job, searching, still works.
 */
import { useCallback, useEffect, useState } from "react";
import { areasUrl } from "../lib/api/base";
import { type AreasPayload, parseAreasPayload } from "../lib/areas/areas-dto";

interface UseAreasResult {
	areas: AreasPayload;
	loading: boolean;
	error: boolean;
	retry: () => void;
}

const EMPTY: AreasPayload = { state: "GA", shapes: [], areas: [] };

export function useAreas(): UseAreasResult {
	const [areas, setAreas] = useState<AreasPayload>(EMPTY);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);
	const [attempt, setAttempt] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry trigger, read nowhere else — same shape as use-search.ts
	useEffect(() => {
		let live = true;
		setLoading(true);
		setError(false);
		(async () => {
			try {
				const res = await fetch(areasUrl());
				if (!res.ok) throw new Error(`areas ${res.status}`);
				const parsed = parseAreasPayload(await res.json());
				if (!live) return;
				setAreas(parsed);
				setLoading(false);
			} catch {
				if (!live) return;
				setAreas(EMPTY);
				setError(true);
				setLoading(false);
			}
		})();
		return () => {
			live = false;
		};
	}, [attempt]);

	const retry = useCallback(() => setAttempt((n) => n + 1), []);
	return { areas, loading, error, retry };
}
