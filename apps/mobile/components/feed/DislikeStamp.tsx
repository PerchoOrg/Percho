/**
 * What lands on a card the buyer has just said is not for them (phase418,
 * the owner's pick "A" off `/demos/card-round4-v1`): the thumbs-down they
 * tapped, large, in the middle of the picture, with the words under it.
 *
 * `SwipeStack` places and times it (`leavingMark`); this is only the drawing.
 * The glyph is the corner control's own, so the mark reads as that button's
 * answer.
 */
import { StyleSheet, Text, View } from "react-native";
import { fonts, redline } from "../../theme/tokens";
import { RedlineIcon } from "../cards/redline/RedlineChrome";

const DISC = 112;

export function DislikeStamp() {
	return (
		<View style={styles.stamp} accessibilityLabel="Not for me">
			<View style={styles.disc}>
				<RedlineIcon
					name="thumbsDown"
					size={58}
					color={redline.onPhoto}
					weight="fill"
				/>
			</View>
			<Text style={styles.label}>NOT FOR ME</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	stamp: { alignItems: "center", gap: 10 },
	disc: {
		width: DISC,
		height: DISC,
		borderRadius: DISC / 2,
		borderWidth: 3,
		borderColor: redline.onPhoto,
		backgroundColor: "rgba(20,18,16,0.72)",
		alignItems: "center",
		justifyContent: "center",
	},
	label: {
		fontFamily: fonts.ui,
		fontSize: 13,
		fontWeight: "700",
		letterSpacing: 1.5,
		color: redline.onPhoto,
		textShadowColor: "rgba(0,0,0,0.6)",
		textShadowRadius: 4,
		textShadowOffset: { width: 0, height: 1 },
	},
});
