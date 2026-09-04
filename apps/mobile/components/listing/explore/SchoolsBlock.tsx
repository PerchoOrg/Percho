/**
 * SchoolsBlock (phase D) — the nearest public school per level.
 *
 * Three rows, one figure each: the state's own Milestones proficient-or-above
 * percentage, or nothing. No stars, no 1–10, no colour grading — a rating we
 * made up is the thing the trust line says we don't do. "Nearest" is
 * labelled as such until attendance zones are seeded (then `assigned`
 * flips and the caveat goes away per row).
 */
import { StyleSheet, Text, View } from "react-native";
import type { SchoolDTO } from "../../../lib/listing/detail-dto";
import { explore, fonts } from "../../../theme/tokens";

const LEVEL_LABEL: Record<SchoolDTO["level"], string> = {
	elementary: "Elementary",
	middle: "Middle",
	high: "High",
};

/** 0.29 → "0.2 mi"; 3.75 → "2.3 mi". */
function miles(km: number): string {
	const mi = km * 0.621371;
	return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
}

export interface SchoolsBlockProps {
	schools: SchoolDTO[];
}

export function SchoolsBlock({ schools }: SchoolsBlockProps) {
	const anyNearest = schools.some((s) => !s.assigned);
	const testYear = schools.find((s) => s.testYear)?.testYear;
	return (
		<View>
			{schools.map((s) => (
				<View key={s.level} style={styles.row}>
					<View style={styles.levelCol}>
						<Text style={styles.level}>{LEVEL_LABEL[s.level]}</Text>
						{s.grades && <Text style={styles.grades}>{s.grades}</Text>}
					</View>
					<View style={styles.nameCol}>
						<Text style={styles.name} numberOfLines={2}>
							{s.name}
						</Text>
						<Text style={styles.meta}>
							{[
								s.assigned ? "Assigned" : `Nearest · ${miles(s.distanceKm)}`,
								s.district,
							]
								.filter(Boolean)
								.join(" · ")}
						</Text>
					</View>
					<View style={styles.figureCol}>
						{s.proficiencyPct !== undefined ? (
							<>
								<Text style={styles.figure}>
									{`${Math.round(s.proficiencyPct)}%`}
								</Text>
								<Text style={styles.figureLabel}>proficient</Text>
							</>
						) : (
							<Text style={styles.figureLabel}>no test data</Text>
						)}
					</View>
				</View>
			))}
			<Text style={styles.note}>
				{anyNearest
					? "Nearest open public school by distance, not an assignment — verify with the district before you count on it. "
					: ""}
				{testYear
					? `Proficiency is the share of students at Proficient or above on Georgia Milestones, ${testYear} (GA DOE). Directory: NCES.`
					: "Directory: NCES."}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 10,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: explore.line,
	},
	levelCol: { width: 74 },
	level: {
		fontSize: 12.5,
		fontWeight: "600",
		color: explore.ink,
		fontFamily: fonts.ui,
	},
	grades: {
		fontSize: 10.5,
		color: explore.muted,
		marginTop: 1,
		fontFamily: fonts.ui,
	},
	nameCol: { flex: 1 },
	name: { fontSize: 13, color: explore.ink, fontFamily: fonts.ui },
	meta: {
		fontSize: 10.5,
		color: explore.muted,
		marginTop: 2,
		fontFamily: fonts.ui,
	},
	figureCol: { alignItems: "flex-end", minWidth: 52 },
	figure: {
		fontSize: 17,
		fontWeight: "700",
		letterSpacing: -0.3,
		color: explore.ink,
		fontFamily: fonts.ui,
		fontVariant: ["tabular-nums"],
	},
	figureLabel: {
		fontSize: 10,
		color: explore.muted,
		fontFamily: fonts.ui,
	},
	note: {
		fontSize: 10.5,
		lineHeight: 15.5,
		color: explore.muted,
		marginTop: 11,
		fontFamily: fonts.ui,
	},
});
