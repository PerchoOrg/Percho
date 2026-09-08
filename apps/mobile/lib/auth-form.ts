/**
 * Sign-in form rules. Pure — no Supabase, no React — so the decisions the
 * screen makes are testable without an auth server or a native module.
 *
 * ── Why a password path exists at all ──────────────────────────────────────
 *
 * The app shipped with Apple + email OTP only, on the reasoning that neither
 * has a redirect leg. That reasoning still holds for a NEW account. It is
 * wrong for a returning one: the owner already had an account — created on
 * web, which has always been email + password — and was made to wait for a
 * code to get into an account whose password he knows. 「我已经注册过的要允许
 * 密码登陆」. Both surfaces are the same `auth.users`, so a password that works
 * on percho.co now works here.
 *
 * ── The awkward case, stated plainly ───────────────────────────────────────
 *
 * An account created in this app by OTP has NO password. Supabase answers a
 * password attempt on it with the same "Invalid login credentials" it gives a
 * wrong password, and it is right to: distinguishing them would tell an
 * attacker which addresses are registered. So the screen cannot know which
 * happened, and `passwordFailureHint` deliberately does not guess. It offers
 * the code instead, which works in both cases, and the You tab then offers to
 * set a password so the next sign-in is one step.
 *
 * The code path is therefore also the password RESET path. There is no
 * `resetPasswordForEmail` here on purpose: that mails a LINK, which needs a
 * `percho://` deep link, a Supabase redirect allowlist and a recovery screen —
 * three moving parts to reach a place the existing, working code flow already
 * reaches. Sign in with the code, then set a new password.
 */

/** Supabase's own minimum, and the same floor `apps/web/lib/zod/auth.ts` uses.
 *  Kept in sync by hand: the two are separate stacks and a shared zod schema
 *  would pull zod into the phone bundle for one number. */
export const MIN_PASSWORD_LENGTH = 8;

/** Deliberately loose. The address is verified by the mail arriving, not by
 *  this; a stricter pattern only ever rejects a real address. */
const EMAIL_SHAPE = /^\S+@\S+\.\S+$/;

export function normalizeEmail(raw: string): string {
	return raw.trim().toLowerCase();
}

export function isEmailShaped(raw: string): boolean {
	return EMAIL_SHAPE.test(normalizeEmail(raw));
}

export type CredentialError = "email" | "password" | null;

/** What to complain about before touching the network, if anything. */
export function validateCredentials(
	email: string,
	password: string,
): CredentialError {
	if (!isEmailShaped(email)) return "email";
	if (password.length < MIN_PASSWORD_LENGTH) return "password";
	return null;
}

export function credentialMessage(err: CredentialError): string | null {
	switch (err) {
		case "email":
			return "That doesn’t look like an email address.";
		case "password":
			return `Your password is at least ${MIN_PASSWORD_LENGTH} characters.`;
		default:
			return null;
	}
}

/**
 * What to show after the server rejects a password.
 *
 * One message for every rejection, because we genuinely cannot tell a wrong
 * password from an account that has never had one — see the header. Naming the
 * way out matters more than naming the cause.
 */
export function passwordFailureHint(): string {
	return "That email and password don’t match. If you’ve only ever signed in with a code, use the code — you can set a password afterwards.";
}

/** Whether a new password can be saved. Confirmation must match so a typo
 *  cannot lock someone out of the account they just secured. */
export function validateNewPassword(
	password: string,
	confirm: string,
): string | null {
	if (password.length < MIN_PASSWORD_LENGTH) {
		return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
	}
	if (password !== confirm) return "The two passwords don’t match.";
	return null;
}
