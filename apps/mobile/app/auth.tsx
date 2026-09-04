/**
 * Sign-in screen. Pushed over whatever prompted it (a bookmark tap, the You
 * tab's account row); success dismisses it and the caller's surface reacts to
 * the session via `useAuthStore` — nothing is passed back.
 *
 * Two paths, matching `lib/auth.ts`:
 *   - Sign in with Apple, rendered with Apple's own button component (their
 *     HIG requires the stock control) and only when the native sheet exists.
 *   - Email → 6-digit code. Two-step state machine on one screen; the code
 *     step names the address it mailed so a typo is discoverable.
 *
 * Dismissal is driven by the SESSION, not the button handler: whichever path
 * signs in, `onAuthStateChange` fills the store and the effect below pops the
 * screen. That keeps "signed in" defined in exactly one place.
 */
import * as AppleAuthentication from "expo-apple-authentication";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
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
import {
	appleSignInAvailable,
	requestEmailCode,
	signInWithApple,
	verifyEmailCode,
} from "../lib/auth";
import { useAuthStore } from "../state/auth";
import { colors, radii } from "../theme/tokens";
import { textStyles } from "../theme/typography";

type EmailStep = "email" | "code";

export default function AuthScreen() {
	const insets = useSafeAreaInsets();
	const session = useAuthStore((s) => s.session);

	const [appleAvailable, setAppleAvailable] = useState(false);
	const [step, setStep] = useState<EmailStep>("email");
	const [email, setEmail] = useState("");
	const [code, setCode] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const codeRef = useRef<TextInput>(null);

	useEffect(() => {
		appleSignInAvailable().then(setAppleAvailable);
	}, []);

	// Session appeared → whichever path produced it, this screen is done.
	useEffect(() => {
		if (session) router.back();
	}, [session]);

	const runApple = async () => {
		setError(null);
		setBusy(true);
		const res = await signInWithApple();
		setBusy(false);
		if (!res.ok && res.error) setError(res.error);
	};

	const sendCode = async () => {
		const addr = email.trim().toLowerCase();
		if (!/^\S+@\S+\.\S+$/.test(addr)) {
			setError("That doesn't look like an email address.");
			return;
		}
		setError(null);
		setBusy(true);
		const res = await requestEmailCode(addr);
		setBusy(false);
		if (!res.ok) {
			setError(res.error ?? "Couldn't send the code.");
			return;
		}
		setEmail(addr);
		setStep("code");
		setTimeout(() => codeRef.current?.focus(), 50);
	};

	const submitCode = async () => {
		if (code.trim().length < 6) {
			setError("Enter the 6-digit code from the email.");
			return;
		}
		setError(null);
		setBusy(true);
		const res = await verifyEmailCode(email, code);
		setBusy(false);
		// Success dismisses via the session effect; only failure lands here.
		if (!res.ok) setError(res.error ?? "That code didn't work.");
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
					accessibilityLabel="Close sign-in"
				>
					<Text style={styles.cancelTxt}>Cancel</Text>
				</Pressable>

				<Text style={styles.title}>Sign in</Text>
				<Text style={styles.sub}>
					Keep your saved homes, and pick up on any device.
				</Text>

				{appleAvailable ? (
					<>
						<AppleAuthentication.AppleAuthenticationButton
							buttonType={
								AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
							}
							buttonStyle={
								AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
							}
							cornerRadius={radii.btn}
							style={styles.appleBtn}
							onPress={busy ? () => {} : runApple}
						/>
						<Text style={styles.divider}>or</Text>
					</>
				) : null}

				{step === "email" ? (
					<>
						<TextInput
							style={styles.input}
							value={email}
							onChangeText={setEmail}
							placeholder="Email address"
							placeholderTextColor={colors.ink3}
							keyboardType="email-address"
							autoCapitalize="none"
							autoCorrect={false}
							autoComplete="email"
							editable={!busy}
							onSubmitEditing={sendCode}
							returnKeyType="send"
						/>
						<Pressable
							style={[styles.cta, busy && styles.ctaDisabled]}
							onPress={sendCode}
							disabled={busy}
							accessibilityRole="button"
						>
							{busy ? (
								<ActivityIndicator color={colors.onCard} />
							) : (
								<Text style={styles.ctaTxt}>Email me a code</Text>
							)}
						</Pressable>
					</>
				) : (
					<>
						<Text style={styles.codeHint}>
							Enter the 6-digit code sent to {email}.
						</Text>
						<TextInput
							ref={codeRef}
							style={styles.input}
							value={code}
							onChangeText={setCode}
							placeholder="123456"
							placeholderTextColor={colors.ink3}
							keyboardType="number-pad"
							textContentType="oneTimeCode"
							editable={!busy}
							onSubmitEditing={submitCode}
							returnKeyType="done"
							maxLength={6}
						/>
						<Pressable
							style={[styles.cta, busy && styles.ctaDisabled]}
							onPress={submitCode}
							disabled={busy}
							accessibilityRole="button"
						>
							{busy ? (
								<ActivityIndicator color={colors.onCard} />
							) : (
								<Text style={styles.ctaTxt}>Sign in</Text>
							)}
						</Pressable>
						<Pressable
							style={styles.linkRow}
							onPress={() => {
								setStep("email");
								setCode("");
								setError(null);
							}}
							disabled={busy}
							accessibilityRole="button"
						>
							<Text style={styles.linkTxt}>Use a different email</Text>
						</Pressable>
					</>
				)}

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
	appleBtn: { height: 48, width: "100%" },
	divider: {
		...textStyles.footnote,
		color: colors.ink3,
		textAlign: "center",
		marginVertical: 16,
	},
	codeHint: { ...textStyles.footnote, color: colors.ink2, marginBottom: 10 },
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
	linkRow: {
		minHeight: 44,
		justifyContent: "center",
		alignItems: "center",
		marginTop: 4,
	},
	linkTxt: { ...textStyles.footnote, color: colors.accent },
	error: { ...textStyles.footnote, color: colors.neg, marginTop: 14 },
});
