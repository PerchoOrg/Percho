/**
 * CollapsedAppBar (phase118 spec §3.2) — fades in once the hero has scrolled
 * away, carrying the price line and the section tabs.
 *
 * Absolutely positioned OVER the scroll view (the hero owns the top of the
 * page; a static bar would steal its height). Opacity is a 160ms timing on the
 * native driver; `pointerEvents` follows visibility so an invisible bar can
 * never eat the hero's taps.
 *
 * Tabs are built by the SCREEN from the sections it actually rendered — a tab
 * cannot outlive its section (same rule as the old chip strip).
 */
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { explore, fonts } from "../../../theme/tokens";

export interface AppBarTab {
	id: string;
	label: string;
}

export interface CollapsedAppBarProps {
	visible: boolean;
	title: string;
	subtitle: string;
	saved: boolean;
	tabs: readonly AppBarTab[];
	activeTab: string | null;
	onTab: (id: string) => void;
	onBack: () => void;
	onToggleSave: () => void;
}

export function CollapsedAppBar(props: CollapsedAppBarProps) {
	const {
		visible,
		title,
		subtitle,
		saved,
		tabs,
		activeTab,
		onTab,
		onBack,
		onToggleSave,
	} = props;
	const insets = useSafeAreaInsets();
	const opacity = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		Animated.timing(opacity, {
			toValue: visible ? 1 : 0,
			duration: 160,
			useNativeDriver: true,
		}).start();
	}, [opacity, visible]);

	return (
		<Animated.View
			style={[styles.bar, { opacity, paddingTop: insets.top }]}
			pointerEvents={visible ? "auto" : "none"}
		>
			<View style={styles.row}>
				<Pressable onPress={onBack} hitSlop={10} style={styles.iconBtn}>
					<Text style={styles.icon}>←</Text>
				</Pressable>
				<View style={styles.titleWrap}>
					<Text style={styles.title} numberOfLines={1}>
						{title}
					</Text>
					<Text style={styles.subtitle} numberOfLines={1}>
						{subtitle}
					</Text>
				</View>
				<Pressable onPress={onToggleSave} hitSlop={10} style={styles.iconBtn}>
					<Text style={styles.icon}>{saved ? "♥" : "♡"}</Text>
				</Pressable>
			</View>
			{tabs.length > 1 && (
				<View style={styles.tabs}>
					{tabs.map((tab) => {
						const active = tab.id === activeTab;
						return (
							<Pressable
								key={tab.id}
								onPress={() => onTab(tab.id)}
								hitSlop={6}
								style={styles.tab}
							>
								<Text
									style={[styles.tabLabel, active && styles.tabLabelActive]}
								>
									{tab.label}
								</Text>
								{active && <View style={styles.tabRule} />}
							</Pressable>
						);
					})}
				</View>
			)}
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	bar: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		zIndex: 8,
		backgroundColor: explore.appbar,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: explore.line,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 14,
		paddingTop: 4,
	},
	iconBtn: { width: 24, alignItems: "center" },
	icon: { fontSize: 17, color: explore.ink },
	titleWrap: { flex: 1, minWidth: 0 },
	title: {
		fontSize: 15,
		fontWeight: "700",
		letterSpacing: -0.3,
		color: explore.ink,
		fontFamily: fonts.ui,
	},
	subtitle: {
		fontSize: 11,
		color: explore.muted,
		marginTop: 1,
		fontFamily: fonts.ui,
	},
	tabs: {
		flexDirection: "row",
		gap: 20,
		paddingHorizontal: 16,
		paddingTop: 11,
	},
	tab: { paddingBottom: 9 },
	tabLabel: {
		fontSize: 11,
		fontWeight: "600",
		letterSpacing: 0.4,
		color: explore.muted,
		fontFamily: fonts.ui,
	},
	tabLabelActive: { color: explore.ink },
	tabRule: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: 2,
		borderRadius: 2,
		backgroundColor: explore.brand,
	},
});
