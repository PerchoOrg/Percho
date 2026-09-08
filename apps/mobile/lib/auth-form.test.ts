import { describe, expect, it } from "vitest";
import {
	MIN_PASSWORD_LENGTH,
	credentialMessage,
	isEmailShaped,
	normalizeEmail,
	passwordFailureHint,
	validateCredentials,
	validateNewPassword,
} from "./auth-form";

describe("normalizeEmail", () => {
	it("trims and lowercases, so a typed capital is not a different account", () => {
		expect(normalizeEmail("  Roy@Example.COM ")).toBe("roy@example.com");
	});
});

describe("isEmailShaped", () => {
	it("accepts an address someone would actually type", () => {
		for (const ok of [
			"roy@example.com",
			"roy+percho@example.co.uk",
			" ROY@EXAMPLE.COM ",
		]) {
			expect(isEmailShaped(ok), ok).toBe(true);
		}
	});

	it("rejects what is plainly not an address", () => {
		for (const bad of ["", "roy", "roy@example", "roy example.com", "@x.com"]) {
			expect(isEmailShaped(bad), bad).toBe(false);
		}
	});
});

describe("validateCredentials", () => {
	it("passes a real pair", () => {
		expect(validateCredentials("roy@example.com", "correct-horse")).toBeNull();
	});

	it("complains about the email before the password", () => {
		// Both are wrong here; naming the first field the user filled is less
		// confusing than naming the second.
		expect(validateCredentials("nope", "short")).toBe("email");
	});

	it("holds the password to the documented floor", () => {
		const justUnder = "x".repeat(MIN_PASSWORD_LENGTH - 1);
		const exactly = "x".repeat(MIN_PASSWORD_LENGTH);
		expect(validateCredentials("roy@example.com", justUnder)).toBe("password");
		expect(validateCredentials("roy@example.com", exactly)).toBeNull();
	});

	it("does not trim the password — a trailing space may be part of it", () => {
		const withSpace = `${"x".repeat(MIN_PASSWORD_LENGTH)} `;
		expect(validateCredentials("roy@example.com", withSpace)).toBeNull();
	});
});

describe("credentialMessage", () => {
	it("has a message for each problem and none for success", () => {
		expect(credentialMessage("email")).toMatch(/email/i);
		expect(credentialMessage("password")).toContain(
			String(MIN_PASSWORD_LENGTH),
		);
		expect(credentialMessage(null)).toBeNull();
	});
});

describe("passwordFailureHint", () => {
	it("names the way out rather than guessing the cause", () => {
		const hint = passwordFailureHint();
		expect(hint).toMatch(/code/i);
		// It must not claim to know which of the two happened — saying "no
		// password set" would leak that the address is registered.
		expect(hint).not.toMatch(/no account|not registered|doesn’t exist/i);
	});
});

describe("validateNewPassword", () => {
	const good = "x".repeat(MIN_PASSWORD_LENGTH);

	it("accepts a long enough, matching pair", () => {
		expect(validateNewPassword(good, good)).toBeNull();
	});

	it("rejects one that is too short", () => {
		const short = "x".repeat(MIN_PASSWORD_LENGTH - 1);
		expect(validateNewPassword(short, short)).toContain(
			String(MIN_PASSWORD_LENGTH),
		);
	});

	it("rejects a mismatch, so a typo cannot lock the account", () => {
		expect(validateNewPassword(good, `${good}!`)).toMatch(/match/i);
	});
});
