/**
 * Sign-in / sign-out actions. UI-free: screens call these and render the
 * returned error, the session itself lands in `state/auth.ts` via
 * `onAuthStateChange` — no action here writes the store directly.
 *
 * Two ways in, both chosen for having NO redirect leg:
 *   - Sign in with Apple: native sheet → identity token →
 *     `signInWithIdToken`. Requires the Apple provider enabled in Supabase
 *     Auth with client id `co.percho.app`.
 *   - Email OTP: 6-digit code typed into the app (`signInWithOtp` →
 *     `verifyOtp`). A magic LINK would round-trip through a browser and a
 *     `percho://` redirect — more moving parts and a Supabase redirect
 *     allowlist — for a worse phone UX than "type the code".
 *
 * Account deletion is the one server-mediated call (`DELETE
 * /api/mobile/account`): removing an auth user takes the service role, which
 * never ships in this bundle.
 */
import * as AppleAuthentication from "expo-apple-authentication";
import { accountUrl } from "./api/base";
import { supabase } from "./supabase";

export interface AuthResult {
	ok: boolean;
	/** User-facing message. Unset when `ok` or when the user just canceled. */
	error?: string;
}

const CANCELED: AuthResult = { ok: false };

function fail(message: string): AuthResult {
	return { ok: false, error: message };
}

/** Native Apple sheet. Resolves ok:false with no error if the user bails. */
export async function signInWithApple(): Promise<AuthResult> {
	let identityToken: string | null;
	try {
		const credential = await AppleAuthentication.signInAsync({
			requestedScopes: [
				AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
				AppleAuthentication.AppleAuthenticationScope.EMAIL,
			],
		});
		identityToken = credential.identityToken;
	} catch (err) {
		const code = (err as { code?: string })?.code;
		if (code === "ERR_REQUEST_CANCELED") return CANCELED;
		return fail("Apple sign-in didn't complete. Please try again.");
	}
	if (!identityToken) return fail("Apple didn't return a sign-in token.");

	const { error } = await supabase().auth.signInWithIdToken({
		provider: "apple",
		token: identityToken,
	});
	return error ? fail(error.message) : { ok: true };
}

/** Whether the Apple sheet exists on this device (false on Android/simulators). */
export function appleSignInAvailable(): Promise<boolean> {
	return AppleAuthentication.isAvailableAsync().catch(() => false);
}

/** Step 1: email in, 6-digit code out (creates the account on first use). */
export async function requestEmailCode(email: string): Promise<AuthResult> {
	const { error } = await supabase().auth.signInWithOtp({
		email,
		options: { shouldCreateUser: true },
	});
	return error ? fail(error.message) : { ok: true };
}

/** Step 2: the typed code. Success fires `onAuthStateChange` with a session. */
export async function verifyEmailCode(
	email: string,
	code: string,
): Promise<AuthResult> {
	const { error } = await supabase().auth.verifyOtp({
		email,
		token: code.trim(),
		type: "email",
	});
	return error ? fail(error.message) : { ok: true };
}

export async function signOut(): Promise<void> {
	// Local scope is enough — and it cannot strand the user in a half-state
	// the way a failed network round-trip on global sign-out can.
	await supabase().auth.signOut({ scope: "local" });
}

/**
 * Deletes the auth user server-side (App Review 5.1.1(v) requires this to be
 * reachable in-app), then clears the local session. The user's saves go with
 * the account — `saved_*.user_id` references `auth.users on delete cascade`.
 */
export async function deleteAccount(): Promise<AuthResult> {
	const { data } = await supabase().auth.getSession();
	const token = data.session?.access_token;
	if (!token) return fail("You're not signed in.");

	try {
		const res = await fetch(accountUrl(), {
			method: "DELETE",
			headers: { Authorization: `Bearer ${token}` },
		});
		if (!res.ok) {
			return fail("Couldn't delete the account. Please try again.");
		}
	} catch {
		return fail(
			"Couldn't reach the server. Check your connection and try again.",
		);
	}

	// The server already revoked the user; this just clears local storage.
	await supabase()
		.auth.signOut({ scope: "local" })
		.catch(() => {});
	return { ok: true };
}
