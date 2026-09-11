/**
 * The school layer's data: what the API sent, and which of it to draw.
 *
 * Owner, 2026-09-10: "School should be the top one, show school icons on map
 * and their coverage area." Icons are here. Coverage areas are not, and the
 * reason is that `attendance_zones` has never been seeded — see the header of
 * `apps/web/lib/schools/map-pins.ts`. A district outline is not an attendance
 * zone and drawing one as though it were would answer the question wrong.
 *
 * ── Why the zoom ladder exists ─────────────────────────────────────────────
 *
 * Georgia has ~2270 schools and every pin here is a React Native `View` inside
 * a `Marker`, which is the expensive kind. Drawing all of them is not a busy
 * map, it is a frozen one. So the layer shows the ladder a buyer actually
 * walks: at metro and county range the high schools, which are the ones whose
 * names a neighbourhood is known by; zoom to a city and the middles appear;
 * zoom to a few streets and the elementaries do.
 *
 * That is a rendering rule, not a ranking. It never hides a school for being
 * bad, never promotes one for being good, and `MAX_PINS` — the safety valve
 * for a pathological viewport — cuts by DISTANCE FROM THE CENTRE of what you
 * are looking at, never by score. A layer that thinned itself by proficiency
 * would draw a map where the good schools are the only ones that exist.
 */

export type SchoolPinLevel = "elementary" | "middle" | "high";

export interface SchoolPin {
	id: string;
	name: string;
	level: SchoolPinLevel;
	lat: number;
	lng: number;
	district?: string;
	/** % Proficient or above on GA Milestones, when the state published one. */
	proficiencyPct?: number;
}

export interface SchoolPinsPayload {
	state: string;
	schools: SchoolPin[];
}

/** The slice of a `react-native-maps` region this module needs. */
export interface MapRegion {
	latitude: number;
	longitude: number;
	latitudeDelta: number;
	longitudeDelta: number;
}

function isLevel(v: unknown): v is SchoolPinLevel {
	return v === "elementary" || v === "middle" || v === "high";
}

function num(v: unknown): number | undefined {
	if (typeof v === "number" && Number.isFinite(v)) return v;
	return undefined;
}

/**
 * Parse the API payload, dropping any row that is not drawable.
 *
 * Same discipline as `areas-dto.ts`: the generated types describe what the
 * schema promises, not what a newer writer might send, so the boundary
 * validates rather than casts.
 */
export function parseSchoolPins(json: unknown): SchoolPinsPayload {
	const root = json as { state?: unknown; schools?: unknown } | null;
	const rows = Array.isArray(root?.schools) ? root.schools : [];
	const schools: SchoolPin[] = [];
	for (const raw of rows) {
		// A non-object element would throw on the first property read, and this
		// is a network boundary: the one place that must not assume its shape.
		if (typeof raw !== "object" || raw === null) continue;
		const r = raw as Record<string, unknown>;
		const lat = num(r.lat);
		const lng = num(r.lng);
		const pct = num(r.proficiencyPct);
		if (lat === undefined || lng === undefined) continue;
		if (!isLevel(r.level)) continue;
		if (typeof r.id !== "string" || typeof r.name !== "string") continue;
		if (r.name.trim().length === 0) continue;
		schools.push({
			id: r.id,
			name: r.name,
			level: r.level,
			lat,
			lng,
			...(typeof r.district === "string" && r.district
				? { district: r.district }
				: {}),
			...(pct === undefined ? {} : { proficiencyPct: pct }),
		});
	}
	return {
		state: typeof root?.state === "string" ? root.state : "GA",
		schools,
	};
}

/**
 * Which levels are drawn at a given zoom, coarse to fine.
 *
 * The thresholds are keyed to the regions this app actually animates to
 * (`search.tsx`): the metro opens at 0.55, a county tap lands at 0.5, a city
 * at 0.18 and a single hit at 0.06.
 *
 * Retuned in phase275, when pins gained NAMES. Measured over downtown Atlanta,
 * the densest case in the state: at 0.18 the old ladder drew high + middle,
 * which is 29 pins — fine as dots, a wall of overlapping labels with names on.
 * High-only holds that frame at 13. So middles now wait until 0.12 and
 * elementaries until 0.06, which is the zoom at which a buyer is looking at
 * one neighbourhood rather than a metro.
 *
 * Above 0.6 — further out than the app ever puts you deliberately, i.e. the
 * buyer has pinched out to see the state — nothing is drawn. At that range the
 * pins are a smear over the county colours, which are the answer the lens is
 * already giving.
 */
export function levelsForZoom(latitudeDelta: number): SchoolPinLevel[] {
	if (!Number.isFinite(latitudeDelta) || latitudeDelta > 0.6) return [];
	if (latitudeDelta > 0.12) return ["high"];
	if (latitudeDelta > 0.06) return ["high", "middle"];
	return ["high", "middle", "elementary"];
}

/** Hard cap on drawn pins. Sized for a phone, not for a dataset. */
export const MAX_PINS = 120;

/**
 * The schools to draw for a region: the right levels, inside the view, capped.
 *
 * The viewport test uses the region's own deltas with a small margin, so a pin
 * just past the edge is already drawn when it slides in rather than popping.
 */
export function visibleSchools(
	pins: readonly SchoolPin[],
	region: MapRegion,
	max: number = MAX_PINS,
): SchoolPin[] {
	const levels = levelsForZoom(region.latitudeDelta);
	if (levels.length === 0) return [];
	const allow = new Set(levels);
	// 10% beyond each edge: enough that panning reveals pins already placed,
	// not so much that we draw a screen's worth of invisible ones.
	const latPad = (region.latitudeDelta / 2) * 1.1;
	const lngPad = (region.longitudeDelta / 2) * 1.1;
	const inView = pins.filter(
		(p) =>
			allow.has(p.level) &&
			Math.abs(p.lat - region.latitude) <= latPad &&
			Math.abs(p.lng - region.longitude) <= lngPad,
	);
	if (inView.length <= max) return inView;
	// Over the cap: keep what is nearest the centre of the view. Squared
	// distance in degrees — no need for a real geodesic to rank a screenful,
	// and longitude is scaled so a degree of each counts roughly the same at
	// Georgia's latitude.
	const lngScale = Math.cos((region.latitude * Math.PI) / 180);
	const d2 = (p: SchoolPin) => {
		const dy = p.lat - region.latitude;
		const dx = (p.lng - region.longitude) * lngScale;
		return dy * dy + dx * dx;
	};
	return [...inView]
		.sort((a, b) => d2(a) - d2(b) || a.name.localeCompare(b.name))
		.slice(0, max);
}

/**
 * The cuts between the five colour steps a school pin can take, in % proficient.
 *
 * **These are NOT the county map's cuts, and the difference is the point.**
 *
 * The county fill classes by QUANTILE over the 29 metro counties, because the
 * question a filled county answers is comparative — "cheap or dear FOR AROUND
 * HERE" — and because equal intervals over a lopsided distribution paint a map
 * of one colour (see `classBreaks` in `@percho/shared/lenses`).
 *
 * A school pin answers a different question. It is read on its own — "is this
 * a strong school?" — by someone standing in one town, and the population
 * behind it is 2227 individual schools spanning 1% to 99%, not 29 averages
 * spanning 22% to 67%. Borrowing the county cuts would saturate it: every
 * school above 49% would take the darkest green, so a 55% school and a 99%
 * school would be the same colour.
 *
 * So the pins get fixed, absolute cuts, which also means a school does not
 * change colour when you pan — and the legend states both scales rather than
 * letting one ramp quietly mean two things (owner, 2026-09-11: "I don't know
 * the lens color meaning here").
 */
export const PROFICIENCY_BANDS = [25, 40, 55, 70] as const;

/** How the legend labels the two ends of the pin scale. */
export const PROFICIENCY_LEGEND = {
	low: `<${PROFICIENCY_BANDS[0]}%`,
	high: `${PROFICIENCY_BANDS[3]}%+`,
} as const;

/**
 * The ramp step a school's proficiency sits in, 0 (lightest) … 4, or undefined
 * when the state published no figure.
 */
export function proficiencyStep(pct: number | undefined): number | undefined {
	if (pct === undefined || !Number.isFinite(pct)) return undefined;
	let step = 0;
	for (const b of PROFICIENCY_BANDS) if (pct >= b) step++;
	return step;
}

/**
 * The most pins that can carry a NAME without the labels colliding.
 *
 * A 390pt phone fits roughly three name chips across and the map is about
 * 700pt tall, so two dozen labels is the point where they start stacking on
 * each other rather than sitting beside their dots. Measured against the real
 * distribution: downtown Atlanta, the densest square in the state, holds 13
 * high schools at city zoom and 18 schools of all three levels at street zoom.
 */
export const NAMED_MAX = 24;

/**
 * Whether this many pins should carry their names.
 *
 * Count-driven rather than zoom-driven, and deliberately so: the same zoom is
 * 18 schools over Buckhead and 8 over Alpharetta, and a fixed zoom threshold
 * would either label the sparse case too late or the dense case into a mess.
 * Asking the number that is actually about to be drawn is self-tuning, and it
 * is the number we already have in hand.
 */
export function shouldLabel(pinCount: number): boolean {
	return pinCount > 0 && pinCount <= NAMED_MAX;
}

/**
 * "Hollis Hand Elementary School" → "Hollis Hand Elem."
 *
 * Every school in the table ends in the word "School", which on a map pin is
 * 6 characters saying nothing — the dot already said it is a school. The level
 * word is kept but abbreviated, because at a zoom showing both middles and
 * elementaries it is the only thing distinguishing two pins a block apart.
 *
 * This replaces the H / M / E initial the pins carried in phase274, which the
 * owner read as noise (2026-09-11: "school show names instead of H, M, E").
 * A letter that needs a legend to mean anything is worse than a name that
 * needs none.
 */
export function shortSchoolName(name: string): string {
	const trimmed = name
		.replace(/\s+/g, " ")
		.trim()
		.replace(/\s+school$/i, "")
		.replace(/\belementary\b/i, "Elem.")
		.replace(/\bmiddle\b/i, "Mid.")
		.trim();
	if (trimmed.length === 0) return name.trim();
	// One line, and the chip is sized to its text — past this it crowds the
	// map it is annotating.
	return trimmed.length > 22 ? `${trimmed.slice(0, 21).trimEnd()}…` : trimmed;
}

/** "Milton High · 67% proficient" — the callout's one line. */
export function schoolNote(pin: SchoolPin): string {
	const level =
		pin.level === "high"
			? "High"
			: pin.level === "middle"
				? "Middle"
				: "Elementary";
	const score =
		pin.proficiencyPct === undefined
			? "no state score published"
			: `${pin.proficiencyPct}% proficient`;
	return `${level} · ${score}`;
}
