import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function PlaceStub() {
	const router = useRouter();
	const { slug } = useLocalSearchParams<{ slug: string }>();
	return (
		<View style={styles.container}>
			<Text style={styles.kicker}>PLACE</Text>
			<Text style={styles.slug}>{slug}</Text>
			<Text style={styles.note}>Explore view — coming soon.</Text>
			<Pressable style={styles.back} onPress={() => router.back()}>
				<Text style={styles.backText}>← Back to feed</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#0d0d0f",
		justifyContent: "center",
		alignItems: "center",
		padding: 24,
	},
	kicker: {
		fontSize: 12,
		letterSpacing: 2,
		color: "#8a8a8f",
		marginBottom: 12,
	},
	slug: {
		fontSize: 32,
		fontWeight: "700",
		color: "#f5f5f7",
		marginBottom: 8,
	},
	note: { fontSize: 14, color: "#8a8a8f", marginBottom: 32 },
	back: {
		paddingHorizontal: 20,
		paddingVertical: 12,
		borderWidth: 1,
		borderColor: "rgba(245,245,247,0.32)",
		borderRadius: 999,
	},
	backText: { fontSize: 16, color: "#f5f5f7" },
});
