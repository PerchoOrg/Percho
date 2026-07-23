import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

export default function Index() {
	return (
		<View style={styles.container}>
			<Text style={styles.title}>Percho</Text>
			<Text style={styles.subtitle}>Homes that fit your vibe.</Text>
			<Link href="/feed" style={styles.cta}>
				Open feed →
			</Link>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#f3eee7",
		justifyContent: "center",
		alignItems: "center",
		padding: 24,
	},
	title: {
		fontSize: 48,
		fontWeight: "700",
		color: "#313131",
		letterSpacing: -1,
	},
	subtitle: {
		fontSize: 16,
		color: "#5a5651",
		marginTop: 8,
		marginBottom: 32,
	},
	cta: {
		fontSize: 18,
		color: "#313131",
		padding: 12,
		borderWidth: 1,
		borderColor: "rgba(49,49,49,0.32)",
		borderRadius: 999,
		paddingHorizontal: 24,
	},
});
