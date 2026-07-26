import { defineConfig } from "vitest/config";

// Pure-TS unit tests only (owner-approved #4) — no React Native runtime.
// Currently: the §0.5 gesture-decision core. Keep RN-dependent code out of
// this include glob.
export default defineConfig({
	test: {
		include: ["lib/**/*.test.ts"],
		environment: "node",
	},
});
