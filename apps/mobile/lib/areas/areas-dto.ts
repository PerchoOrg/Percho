/**
 * Areas DTO — mirrors `apps/web/lib/areas/areas.ts`.
 *
 * Parsed defensively, same rule as `search-dto.ts`: a field the server stops
 * sending must degrade to a county we cannot colour, never to a crash on the
 * Search tab. The shapes and the metrics are independent for that reason — a
 * county whose metrics fail to parse still draws its outline.
 */

import { METRIC_KEYS } from "@percho/shared/lenses";
import type {
	Area,
	AreaMetric,
	MetricKey,
	MetricSupplier,
} from "@percho/shared/lenses";

export interface AreaShape {
	key: string;
	name: string;
	/** Label anchor, `[lng, lat]`. */
	centre: [number, number];
	/** Outer rings, `[lng, lat]` pairs. */
	rings: [number, number][][];
}

export interface AreasPayload {
	state: string;
	shapes: AreaShape[];
	areas: Area[];
}

// Derived from the shared list rather than copied. A shipped binary keeps the
// list it was BUILT with, which is the version skew this guard exists for; the
// copy only ever created a way to forget one.
const KNOWN_METRICS = new Set<string>(METRIC_KEYS);

const KNOWN_KINDS = new Set<string>([
	"county",
	"city",
	"school_district",
	"utility_territory",
]);

const str = (v: unknown): string | undefined =>
	typeof v === "string" && v.length > 0 ? v : undefined;
const num = (v: unknown): number | undefined =>
	typeof v === "number" && Number.isFinite(v) ? v : undefined;

function parseCoord(v: unknown): [number, number] | null {
	if (!Array.isArray(v) || v.length < 2) return null;
	const lng = num(v[0]);
	const lat = num(v[1]);
	if (lng === undefined || lat === undefined) return null;
	return [lng, lat];
}

function parseShape(v: unknown): AreaShape | null {
	if (!v || typeof v !== "object") return null;
	const o = v as Record<string, unknown>;
	const key = str(o.key);
	const name = str(o.name);
	const centre = parseCoord(o.centre);
	if (!key || !name || !centre) return null;

	const rings: [number, number][][] = [];
	if (Array.isArray(o.rings)) {
		for (const raw of o.rings) {
			if (!Array.isArray(raw)) continue;
			const ring: [number, number][] = [];
			for (const pt of raw) {
				const c = parseCoord(pt);
				if (c) ring.push(c);
			}
			// Below four points there is no polygon to fill, and react-native-maps
			// draws the degenerate case as a stray line across the map.
			if (ring.length >= 4) rings.push(ring);
		}
	}
	if (rings.length === 0) return null;
	return { key, name, centre, rings };
}

function parseSupplier(v: unknown): MetricSupplier | undefined {
	if (!v || typeof v !== "object") return undefined;
	const o = v as Record<string, unknown>;
	const name = str(o.name);
	if (!name) return undefined;
	const share = num(o.share);
	const unitPrice = num(o.unitPrice);
	const unitPriceUnit = str(o.unitPriceUnit);
	return {
		name,
		...(share !== undefined ? { share } : {}),
		...(unitPrice !== undefined ? { unitPrice } : {}),
		...(unitPriceUnit ? { unitPriceUnit } : {}),
	};
}

function parseMetric(v: unknown): AreaMetric | null {
	if (!v || typeof v !== "object") return null;
	const o = v as Record<string, unknown>;
	const metric = str(o.metric);
	const value = num(o.value);
	const source = str(o.source);
	const asOf = str(o.asOf);
	if (!metric || !KNOWN_METRICS.has(metric)) return null;
	if (value === undefined || !source || !asOf) return null;
	const sourceUrl = str(o.sourceUrl);
	const supplier = parseSupplier(o.supplier);
	return {
		metric: metric as MetricKey,
		value,
		unit: str(o.unit) ?? "",
		source,
		...(sourceUrl ? { sourceUrl } : {}),
		asOf,
		estimated: o.estimated === true,
		...(supplier ? { supplier } : {}),
	};
}

function parseArea(v: unknown): Area | null {
	if (!v || typeof v !== "object") return null;
	const o = v as Record<string, unknown>;
	const key = str(o.key);
	const name = str(o.name);
	const kind = str(o.kind);
	if (!key || !name || !kind || !KNOWN_KINDS.has(kind)) return null;
	const metrics: AreaMetric[] = [];
	if (Array.isArray(o.metrics)) {
		for (const m of o.metrics) {
			const parsed = parseMetric(m);
			if (parsed) metrics.push(parsed);
		}
	}
	return {
		key,
		name,
		kind: kind as Area["kind"],
		state: str(o.state) ?? "GA",
		metrics,
	};
}

export function parseAreasPayload(v: unknown): AreasPayload {
	const o = (v ?? {}) as Record<string, unknown>;
	const shapes: AreaShape[] = [];
	if (Array.isArray(o.shapes)) {
		for (const s of o.shapes) {
			const parsed = parseShape(s);
			if (parsed) shapes.push(parsed);
		}
	}
	const areas: Area[] = [];
	if (Array.isArray(o.areas)) {
		for (const a of o.areas) {
			const parsed = parseArea(a);
			if (parsed) areas.push(parsed);
		}
	}
	return { state: str(o.state) ?? "GA", shapes, areas };
}

/** Index the areas by key so a shape can find its numbers in one lookup. */
export function areasByKey(areas: readonly Area[]): Map<string, Area> {
	return new Map(areas.map((a) => [a.key, a]));
}
