/**
 * FmlsDisclosure — the FMLS IDX disclosure (rule 13.7(e)) plus the Technical
 * Entity statement (rule 13.8). Same wording as the web app's, from
 * `@percho/shared/fmls`; this only lays it out.
 *
 *   variant="results"  under a list of listing previews (Saved, Search, Compare)
 *   variant="detail"   at the bottom of the listing screen
 *
 * Render it only when an FMLS listing is on screen — callers gate on the
 * listing's `mlsNumber`.
 */
import {
	FMLS_DMCA_URL,
	FMLS_RESULTS_DISCLOSURE,
	type LinkedText,
	TECHNICAL_ENTITY_STATEMENT,
	fmlsDetailDisclosure,
} from "@percho/shared/fmls";
import {
	Linking,
	type StyleProp,
	StyleSheet,
	Text,
	View,
	type ViewStyle,
} from "react-native";
import { colors } from "../theme/tokens";
import { textStyles } from "../theme/typography";

export function FmlsDisclosure({
	variant,
	style,
}: {
	variant: "results" | "detail";
	style?: StyleProp<ViewStyle>;
}) {
	const text: LinkedText =
		variant === "detail"
			? fmlsDetailDisclosure(new Date().getFullYear())
			: FMLS_RESULTS_DISCLOSURE;
	return (
		<View style={[styles.wrap, style]}>
			<Text style={styles.text}>
				{text.before}
				<Text
					style={styles.link}
					accessibilityRole="link"
					onPress={() => {
						Linking.openURL(FMLS_DMCA_URL).catch(() => {});
					}}
				>
					{text.link}
				</Text>
				{text.after}
			</Text>
			<Text style={styles.text}>{TECHNICAL_ENTITY_STATEMENT}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { gap: 6 },
	text: {
		...textStyles.footnote,
		fontSize: 11,
		lineHeight: 16,
		color: colors.ink2,
	},
	link: { textDecorationLine: "underline" },
});
