/**
 * In-memory stand-in for @react-native-async-storage/async-storage, aliased in
 * vitest.config.ts. The persisted Zustand stores import it at module scope; the
 * real package needs a React Native runtime, the store logic under test does not.
 */
const store = new Map<string, string>();

export default {
	getItem: async (key: string) => store.get(key) ?? null,
	setItem: async (key: string, value: string) => {
		store.set(key, value);
	},
	removeItem: async (key: string) => {
		store.delete(key);
	},
};
