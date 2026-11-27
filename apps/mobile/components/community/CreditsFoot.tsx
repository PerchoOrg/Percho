/**
 * The foot of a community's page and a city's (phase373): one quiet line,
 * "Sources ›", that opens into the sources and the film's photo credits. (It
 * read "Sources & photo credits" until the owner shortened it, 2026-11-22.)
 *
 * Sources because every evidence block names where it came from (§3.4); photo
 * credits because Google's Places policy and a CC BY licence both ask for the
 * author. Folded behind one line since 2026-11-21 — a film of Google photos
 * credits twenty-odd people, and the owner found the foot "太多了". It was the
 * community page's own; the city page drew a bordered "Photo credits" card
 * instead, until he asked for the two to match ("photos credit 格式和community
 * 里的一致").
 */
import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { openLink } from "../../lib/open-link";
import { colors } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

export function CreditsFoot({
	sources,
	google,
	commons = [],
}: {
	/** One line of where the page's figures came from. */
	sources: string;
	/** Google Maps contributors whose photographs the film uses. */
	google: readonly string[];
	/** Wikimedia Commons photographs: a CC BY licence asks for author, licence and a link. */
	commons?: readonly { author: string; licence: string; url: string }[];
}) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<Pressable
				onPress={() => setOpen((was) => !was)}
				accessibilityRole="button"
				accessibilityState={{ expanded: open }}
				hitSlop={8}
			>
				<Text style={styles.head}>Sources {open ? "⌃" : "›"}</Text>
			</Pressable>
			{open && (
				<>
					{!!sources && <Text style={styles.line}>{sources}</Text>}
					{google.length > 0 && (
						<Text style={styles.line}>
							Film photos by {google.join(", ")}, via Google Maps.
						</Text>
					)}
					{commons.length > 0 && (
						<Text style={styles.line}>
							Film photos from Wikimedia Commons by{" "}
							{commons.map((c, i) => (
								<Text
									key={c.url}
									style={styles.link}
									onPress={() => void openLink(c.url)}
								>
									{i > 0 ? ", " : ""}
									{c.author}
									{c.licence ? ` (${c.licence})` : ""}
								</Text>
							))}
							.
						</Text>
					)}
				</>
			)}
		</>
	);
}

const styles = StyleSheet.create({
	head: {
		...textStyles.note,
		lineHeight: 18,
		color: colors.ink3,
		marginTop: 22,
	},
	line: {
		...textStyles.note,
		lineHeight: 18,
		color: colors.ink3,
		marginTop: 8,
	},
	link: { textDecorationLine: "underline" },
});
