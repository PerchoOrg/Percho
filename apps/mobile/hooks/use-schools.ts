/**
 * `useSchools` — the school points behind the Search tab's school layer.
 *
 * Same shape as `useAreas`, and for the same reasons: fetched once per mount
 * and held, because schools do not move while a buyer pans a map. A failure is
 * silent — the layer simply does not draw. The lens still colours the counties,
 * which is the answer the chip was asked for; a school pin is the detail on
 * top of it, and an error banner for a missing detail is noise a buyer can do
 * nothing about.
 *
 * Deliberately NOT gated on the active lens. The fetch starts on mount so the
 * pins are already in hand when the Schools chip is tapped — one request for
 * the life of the screen either way, and the alternative puts a spinner inside
 * the tap that was supposed to answer the question.
 */
import { useCallback, useEffect, useState } from "react";
import { schoolsUrl } from "../lib/api/base";
import {
	type SchoolPinsPayload,
	parseSchoolPins,
} from "../lib/schools/school-pins";

interface UseSchoolsResult {
	schools: SchoolPinsPayload;
	loading: boolean;
	error: boolean;
	retry: () => void;
}

const EMPTY: SchoolPinsPayload = { state: "GA", schools: [] };

export function useSchools(): UseSchoolsResult {
	const [schools, setSchools] = useState<SchoolPinsPayload>(EMPTY);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);
	const [attempt, setAttempt] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry trigger, read nowhere else — same shape as use-areas.ts
	useEffect(() => {
		let live = true;
		setLoading(true);
		setError(false);
		(async () => {
			try {
				const res = await fetch(schoolsUrl());
				if (!res.ok) throw new Error(`schools ${res.status}`);
				const parsed = parseSchoolPins(await res.json());
				if (!live) return;
				setSchools(parsed);
				setLoading(false);
			} catch {
				if (!live) return;
				setSchools(EMPTY);
				setError(true);
				setLoading(false);
			}
		})();
		return () => {
			live = false;
		};
	}, [attempt]);

	const retry = useCallback(() => setAttempt((n) => n + 1), []);
	return { schools, loading, error, retry };
}
