/**
 * Set (or replace) the signed-in account's password.
 *
 * This is the second half of the recovery story. `lib/auth-form.ts` explains
 * why a forgotten password is recovered with an email code rather than a reset
 * link; this screen is where that code-based sign-in turns back into a
 * password, so the next sign-in is one step instead of a round-trip to an
 * inbox.
 *
 * It requires a live session by construction — `setPassword` acts on whoever
 * the client is authenticated as — so it can only ever change the password of
 * an account you are already inside. Reached from the You tab's ACCOUNT card.
 */
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { setPassword } from "../lib/auth";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "../lib/auth-form";
import { useAuthStore } from "../state/auth";
import { colors, radii } from "../theme/tokens";
import { textStyles } from "../theme/typography";

export default function SetPasswordScreen() {
	const insets = useSafeAreaInsets();
	const session = useAuthStore((s) => s.session);

	const [password, setPw] = useState("");
	const [confirm, setConfirm] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState(false);

	// Signing out from another surface while this is open leaves a form that
	// cannot submit; close rather than fail on the button.
	useEffect(() => {
		if (!session) router.back();
	}, [session]);

	const submit = async () => {
		const problem = validateNewPassword(password, confirm);
		if (problem) {
			setError(problem);
			return;
		}
		setError(null);
		setBusy(true);
		const res = await setPassword(password);
		setBusy(false);
		if (!res.ok) {
			setError(res.error ?? "Couldn’t save the password.");
			return;
		}
		setDone(true);
		setTimeout(() => router.back(), 900);
	};

	return (
		<KeyboardAvoidingView
			style={styles.screen}
			behavior={Platform.OS === "ios" ? "padding" : undefined}
		>
			<View
				style={[
					styles.body,
					{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
				]}
			>
				<Pressable
					style={styles.cancel}
					onPress={() => router.back()}
					accessibilityRole="button"
					accessibilityLabel="Close"
				>
					<Text style={styles.cancelTxt}>Cancel</Text>
				</Pressable>

				<Text style={styles.title}>Set a password</Text>
				<Text style={styles.sub}>
					Then you can sign in without waiting for a code. At least{" "}
					{MIN_PASSWORD_LENGTH} characters.
				</Text>

				<TextInput
					style={styles.input}
					value={password}
					onChangeText={setPw}
					placeholder="New password"
					placeholderTextColor={colors.ink3}
					secureTextEntry
					autoCapitalize="none"
					autoCorrect={false}
					autoComplete="new-password"
					textContentType="newPassword"
					editable={!busy && !done}
				/>
				<TextInput
					style={styles.input}
					value={confirm}
					onChangeText={setConfirm}
					placeholder="Repeat it"
					placeholderTextColor={colors.ink3}
					secureTextEntry
					autoCapitalize="none"
					autoCorrect={false}
					autoComplete="new-password"
					textContentType="newPassword"
					editable={!busy && !done}
					onSubmitEditing={submit}
					returnKeyType="go"
				/>

				<Pressable
					style={[styles.cta, (busy || done) && styles.ctaDisabled]}
					onPress={submit}
					disabled={busy || done}
					accessibilityRole="button"
				>
					{busy ? (
						<ActivityIndicator color={colors.onCard} />
					) : (
						<Text style={styles.ctaTxt}>
							{done ? "Saved" : "Save password"}
						</Text>
					)}
				</Pressable>

				{error ? <Text style={styles.error}>{error}</Text> : null}
			</View>
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.bg },
	body: { flex: 1, paddingHorizontal: 24 },
	cancel: {
		alignSelf: "flex-end",
		minHeight: 44,
		justifyContent: "center",
		paddingHorizontal: 4,
	},
	cancelTxt: { ...textStyles.headline, color: colors.ink2 },
	title: { ...textStyles.title1, color: colors.ink, marginTop: 8 },
	sub: {
		...textStyles.body,
		color: colors.ink2,
		marginTop: 6,
		marginBottom: 28,
	},
	input: {
		...textStyles.body,
		color: colors.ink,
		backgroundColor: colors.surface2,
		borderRadius: radii.btn,
		paddingHorizontal: 16,
		paddingVertical: 14,
		marginBottom: 12,
	},
	cta: {
		backgroundColor: colors.cta,
		borderRadius: radii.btn,
		minHeight: 48,
		alignItems: "center",
		justifyContent: "center",
	},
	ctaDisabled: { opacity: 0.6 },
	ctaTxt: { ...textStyles.headline, color: colors.onCard },
	error: { ...textStyles.footnote, color: colors.neg, marginTop: 14 },
});
