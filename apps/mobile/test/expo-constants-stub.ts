/**
 * expo-constants stub for vitest — the real package ships Flow syntax that
 * node cannot parse. Modules under test that reach `lib/api/base.ts` only
 * read `expoConfig.extra`, so an empty manifest is enough: `apiBase()` then
 * falls through to its production fallback.
 */
const Constants = { expoConfig: { extra: {} as Record<string, unknown> } };
export default Constants;
