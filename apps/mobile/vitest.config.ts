import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Pure-TS unit tests only (owner-approved #4) — no React Native runtime.
// `lib/` holds the §0.5 gesture-decision core; `state/` holds the Zustand
// stores, which need no RN runtime once AsyncStorage is aliased to a stub;
// `theme/` is plain token data (tokens.ts imports nothing at all).
// Keep RN-dependent code out of this include glob.
export default defineConfig({
	test: {
		include: ["{lib,state,theme}/**/*.test.ts"],
		environment: "node",
		alias: {
			// Must be absolute — vitest does not resolve relative alias targets.
			"@react-native-async-storage/async-storage": resolve(
				__dirname,
				"test/async-storage-stub.ts",
			),
		},
	},
});
