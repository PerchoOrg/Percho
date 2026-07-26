/**
 * BottomSheet (§0.6 #8) — minimal custom Reanimated sheet (owner-approved #5,
 * no @gorhom dependency). --surface base, 24pt top-corner radius, grabber, two
 * detents: medium (50%) / large (90%). Backdrop tap dismisses. Opening fires
 * the `cardSettle` impact (§0.5 "sheet 弹出").
 *
 * Task-0 scope: present + dismiss at a fixed detent. Drag-to-resize between
 * detents is a later concern; the detent API is here so it can grow.
 */
import { useEffect } from "react";
import {
	Modal,
	Pressable,
	StyleSheet,
	View,
	useWindowDimensions,
} from "react-native";
import Animated, {
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { haptics } from "../lib/haptics";
import { colors, radii } from "../theme/tokens";

type Detent = "medium" | "large";
const DETENT_FRACTION: Record<Detent, number> = { medium: 0.5, large: 0.9 };
const IN_MS = 260;
const OUT_MS = 200;

interface BottomSheetProps {
	visible: boolean;
	detent?: Detent;
	onClose: () => void;
	children?: React.ReactNode;
}

export function BottomSheet({
	visible,
	detent = "medium",
	onClose,
	children,
}: BottomSheetProps) {
	const { height } = useWindowDimensions();
	const sheetH = height * DETENT_FRACTION[detent];
	const translateY = useSharedValue(sheetH);

	useEffect(() => {
		if (visible) {
			translateY.value = sheetH;
			translateY.value = withTiming(0, { duration: IN_MS });
			haptics.cardSettle();
		}
	}, [visible, sheetH, translateY]);

	const close = () => {
		translateY.value = withTiming(sheetH, { duration: OUT_MS }, (finished) => {
			if (finished) runOnJS(onClose)();
		});
	};

	const sheetStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: translateY.value }],
	}));

	return (
		<Modal
			visible={visible}
			transparent
			animationType="fade"
			onRequestClose={close}
		>
			<View style={styles.root}>
				<Pressable style={styles.backdrop} onPress={close} />
				<Animated.View style={[styles.sheet, { height: sheetH }, sheetStyle]}>
					<View style={styles.grabber} />
					{children}
				</Animated.View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1, justifyContent: "flex-end" },
	backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.scrim },
	sheet: {
		backgroundColor: colors.surface,
		borderTopLeftRadius: radii.sheet,
		borderTopRightRadius: radii.sheet,
		paddingTop: 8,
		alignItems: "stretch",
	},
	grabber: {
		alignSelf: "center",
		width: 36,
		height: 5,
		borderRadius: radii.pill,
		backgroundColor: colors.ink3,
		marginBottom: 8,
	},
});
