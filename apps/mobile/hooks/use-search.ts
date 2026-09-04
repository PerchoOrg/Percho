/**
 * `useSearch` — debounced text search against `/api/mobile/search` (phase D).
 *
 * Under two useful characters nothing is fetched and `result` is null, so the
 * Search tab keeps showing the city list. Stale responses are dropped by
 * sequence number rather than AbortController: fetch aborts are fine, but a
 * dropped response is all the screen actually needs.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { searchUrl } from "../lib/api/base";
import { type SearchResult, parseSearchResult } from "../lib/search/search-dto";

const DEBOUNCE_MS = 350;
export const MIN_QUERY_LEN = 2;

interface UseSearchResult {
	/** null until a query is long enough and has resolved at least once. */
	result: SearchResult | null;
	loading: boolean;
	error: boolean;
	retry: () => void;
}

export function useSearch(query: string): UseSearchResult {
	const q = query.trim();
	const active = q.length >= MIN_QUERY_LEN;

	const [result, setResult] = useState<SearchResult | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(false);
	const [attempt, setAttempt] = useState(0);
	const seq = useRef(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry trigger, read nowhere else
	useEffect(() => {
		if (!active) {
			seq.current += 1;
			setResult(null);
			setLoading(false);
			setError(false);
			return;
		}
		const mine = ++seq.current;
		setLoading(true);
		setError(false);
		const t = setTimeout(async () => {
			try {
				const res = await fetch(searchUrl(q));
				if (!res.ok) throw new Error(`search ${res.status}`);
				const parsed = parseSearchResult(await res.json());
				if (mine !== seq.current) return;
				setResult(parsed);
				setLoading(false);
			} catch {
				if (mine !== seq.current) return;
				setError(true);
				setLoading(false);
			}
		}, DEBOUNCE_MS);
		return () => clearTimeout(t);
	}, [q, active, attempt]);

	const retry = useCallback(() => setAttempt((n) => n + 1), []);

	return { result, loading, error, retry };
}
