/**
 * Sign-in screen. Pushed over whatever prompted it (a bookmark tap, the You
 * tab's account row); success dismisses it and the caller's surface reacts to
 * the session via `useAuthStore` — nothing is passed back.
 *
 * Laid out the way sign-in screens usually are (phase311, owner: sign-up
 * belongs under the sign-in form, not "New here, or forgot it? Email me a
 * code"):
 *   - Sign in: Apple, or email + password, a "Forgot password?" link, and
 *     "Don't have an account? Sign up" at the foot.
 *   - Sign up: Apple, or email + password (`signUpWithPassword`), with
 *     "Already have an account? Sign in".
 *   - Forgot password: email → 6-digit code → signed in → Set a password.
 *     `lib/auth-form.ts` explains why recovery is a code rather than a link.
 *
 * Dismissal is driven by the SESSION, not the button handler: whichever path
 * signs in, `onAuthStateChange` fills the store and the effect below leaves
 * the screen — back to the caller, or on to Set a password after a reset.
 */
import * as AppleAuthentication from "expo-apple-authentication";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
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
	signInWithPassword,
	signUpWithPassword,
	verifyEmailCode,
} from "../lib/auth";
import {
	MIN_PASSWORD_LENGTH,
	credentialMessage,
	isEmailShaped,
	normalizeEmail,
	validateCredentials,
} from "../lib/auth-form";
import { useAuthStore } from "../state/auth";
import { colors, radii } from "../theme/tokens";
import { textStyles } from "../theme/typography";

type Mode = "signIn" | "signUp" | "reset";

const TITLES: Record<Mode, string> = {
	signIn: "Sign in",
	signUp: "Create account",
	reset: "Reset password",
};

export default function AuthScreen() {
	const insets = useSafeAreaInsets();
	const session = useAuthStore((s) => s.session);

	const [appleAvailable, setAppleAvailable] = useState(false);
	const [mode, setMode] = useState<Mode>("signIn");
	/** Reset only: whether the code has been sent and we are waiting for it. */
	const [codeSent, setCodeSent] = useState(false);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [code, setCode] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const codeRef = useRef<TextInput>(null);
	const passwordRef = useRef<TextInput>(null);
	// Read inside the session effect without making it re-run on mode changes.
	const modeRef = useRef<Mode>(mode);
	modeRef.current = mode;

	useEffect(() => {
		appleSignInAvailable().then(setAppleAvailable);
	}, []);

	// Session appeared → whichever path produced it, this screen is done. A
	// reset lands signed in with no password yet, so it goes on to set one.
	useEffect(() => {
		if (!session) return;
		if (modeRef.current === "reset") router.replace("/set-password");
		else router.back();
	}, [session]);

	const switchMode = (next: Mode) => {
		setMode(next);
		setCodeSent(false);
		setCode("");
		setPassword("");
		setError(null);
	};

	const runApple = async () => {
		setError(null);
		setBusy(true);
		const res = await signInWithApple();
		setBusy(false);
		if (!res.ok && res.error) setError(res.error);
	};

	const submitPassword = async () => {
		const problem = validateCredentials(email, password);
		if (problem) {
			setError(
				mode === "signUp" && problem === "password"
					? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
					: credentialMessage(problem),
			);
			return;
		}
		setError(null);
		setBusy(true);
		const addr = normalizeEmail(email);
		const res =
			mode === "signUp"
				? await signUpWithPassword(addr, password)
				: await signInWithPassword(addr, password);
		setBusy(false);
		// Success dismisses via the session effect; only failure lands here.
		if (!res.ok) setError(res.error ?? "That didn’t work.");
	};

	const sendCode = async () => {
		const addr = normalizeEmail(email);
		if (!isEmailShaped(addr)) {
			setError(credentialMessage("email"));
			return;
		}
		setError(null);
		setBusy(true);
		const res = await requestEmailCode(addr);
		setBusy(false);
		if (!res.ok) {
			setError(res.error ?? "Couldn’t send the code.");
			return;
		}
		setEmail(addr);
		setCodeSent(true);
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
		// Success moves on via the session effect; only failure lands here.
		if (!res.ok) setError(res.error ?? "That code didn’t work.");
	};

	const emailInput = (
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
			textContentType={mode === "signUp" ? "emailAddress" : "username"}
			editable={!busy && !codeSent}
			onSubmitEditing={() =>
				mode === "reset" ? sendCode() : passwordRef.current?.focus()
			}
			returnKeyType={mode === "reset" ? "send" : "next"}
			submitBehavior="submit"
		/>
	);

	const cta = (label: string, onPress: () => void) => (
		<Pressable
			style={[styles.cta, busy && styles.ctaDisabled]}
			onPress={onPress}
			disabled={busy}
			accessibilityRole="button"
		>
			{busy ? (
				<ActivityIndicator color={colors.onCard} />
			) : (
				<Text style={styles.ctaTxt}>{label}</Text>
			)}
		</Pressable>
	);

	return (
		<KeyboardAvoidingView
			style={styles.screen}
			behavior={Platform.OS === "ios" ? "padding" : undefined}
		>
			<ScrollView
				contentContainerStyle={[
					styles.body,
					{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
				]}
				keyboardShouldPersistTaps="handled"
			>
				<Pressable
					style={styles.cancel}
					onPress={() => router.back()}
					accessibilityRole="button"
					accessibilityLabel="Close sign-in"
				>
					<Text style={styles.cancelTxt}>Cancel</Text>
				</Pressable>

				<Text style={styles.title}>{TITLES[mode]}</Text>
				<Text style={styles.sub}>
					{mode === "reset"
						? "We’ll email you a 6-digit code. Enter it, then choose a new password."
						: "Keep what you save, and pick up on any device."}
				</Text>

				{mode !== "reset" && appleAvailable ? (
					<>
						<AppleAuthentication.AppleAuthenticationButton
							buttonType={
								mode === "signUp"
									? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
									: AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
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

				{mode === "reset" ? (
					<>
						{emailInput}
						{codeSent ? (
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
								{cta("Continue", submitCode)}
							</>
						) : (
							cta("Send code", sendCode)
						)}
					</>
				) : (
					<>
						{emailInput}
						<TextInput
							ref={passwordRef}
							style={styles.input}
							value={password}
							onChangeText={setPassword}
							placeholder={
								mode === "signUp"
									? `Password (${MIN_PASSWORD_LENGTH}+ characters)`
									: "Password"
							}
							placeholderTextColor={colors.ink3}
							secureTextEntry
							autoCapitalize="none"
							autoCorrect={false}
							autoComplete={
								mode === "signUp" ? "new-password" : "current-password"
							}
							textContentType={mode === "signUp" ? "newPassword" : "password"}
							editable={!busy}
							onSubmitEditing={submitPassword}
							returnKeyType="go"
						/>
						{mode === "signIn" ? (
							<Pressable
								style={styles.forgot}
								onPress={() => switchMode("reset")}
								disabled={busy}
								accessibilityRole="button"
							>
								<Text style={styles.linkTxt}>Forgot password?</Text>
							</Pressable>
						) : null}
						{cta(
							mode === "signUp" ? "Create account" : "Sign in",
							submitPassword,
						)}
					</>
				)}

				{error ? <Text style={styles.error}>{error}</Text> : null}

				<View style={styles.foot}>
					{mode === "signIn" ? (
						<Text style={styles.footTxt}>
							Don’t have an account?{" "}
							<Text
								style={styles.footLink}
								onPress={() => switchMode("signUp")}
								accessibilityRole="button"
							>
								Sign up
							</Text>
						</Text>
					) : mode === "signUp" ? (
						<Text style={styles.footTxt}>
							Already have an account?{" "}
							<Text
								style={styles.footLink}
								onPress={() => switchMode("signIn")}
								accessibilityRole="button"
							>
								Sign in
							</Text>
						</Text>
					) : (
						<Text
							style={styles.footLink}
							onPress={() => switchMode("signIn")}
							accessibilityRole="button"
						>
							Back to sign in
						</Text>
					)}
				</View>
			</ScrollView>
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.bg },
	body: { flexGrow: 1, paddingHorizontal: 24 },
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
	forgot: {
		alignSelf: "flex-end",
		minHeight: 32,
		justifyContent: "center",
		marginTop: -4,
		marginBottom: 8,
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
	linkTxt: { ...textStyles.footnote, color: colors.accent },
	error: { ...textStyles.footnote, color: colors.neg, marginTop: 14 },
	/** Pinned to the bottom of the sheet when the form is short. */
	foot: {
		marginTop: "auto",
		paddingTop: 28,
		alignItems: "center",
	},
	footTxt: { ...textStyles.footnote, color: colors.ink2 },
	footLink: { ...textStyles.footnote, color: colors.accent, fontWeight: "600" },
});
