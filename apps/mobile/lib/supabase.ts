/**
 * The app's ONE Supabase client — auth + RLS-guarded saves, nothing else.
 *
 * Everything read-only still goes through the `/api/mobile/*` routes
 * (`lib/api/base.ts`); this client exists for what those routes cannot do
 * anonymously: hold a session and write the signed-in user's own rows.
 *
 * Config resolution mirrors `lib/api/base.ts` exactly:
 *   1. `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` — shell
 *      override for dev against another project.
 *   2. `app.json` → `expo.extra.supabaseUrl` / `supabaseAnonKey` — committed
 *      production values. The anon key is the PUBLISHABLE key: it ships in
 *      every web page bundle already and RLS is the access control, so
 *      committing it here is by design (unlike the Google Maps key —
 *      see `components/CardMap.tsx` for that story).
 *   3. Hardcoded production fallback.
 *
 * Session storage is AsyncStorage (the supabase-js default for RN); tokens
 * are refresh-rotated so this is not secret-at-rest material on the level of
 * an API key. `detectSessionInUrl` is off — sign-in is native Apple or email
 * OTP, never a redirect.
 */
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

const PRODUCTION_URL = "https://tavmbcghxjeyaoptndvn.supabase.co";
const PRODUCTION_ANON_KEY = "sb_publishable_OGGUv8IGIByhsoYpOm5Rpw_PsMOBQ5H";

function resolve(
	envValue: string | undefined,
	extraKey: string,
	fallback: string,
): string {
	if (envValue && envValue.trim().length > 0) return envValue.trim();
	const extra = Constants.expoConfig?.extra as
		| Record<string, unknown>
		| undefined;
	const configured = extra?.[extraKey];
	if (typeof configured === "string" && configured.trim().length > 0) {
		return configured.trim();
	}
	return fallback;
}

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
	if (client) return client;
	client = createClient(
		resolve(
			process.env.EXPO_PUBLIC_SUPABASE_URL,
			"supabaseUrl",
			PRODUCTION_URL,
		),
		resolve(
			process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
			"supabaseAnonKey",
			PRODUCTION_ANON_KEY,
		),
		{
			auth: {
				storage: AsyncStorage,
				autoRefreshToken: true,
				persistSession: true,
				detectSessionInUrl: false,
			},
		},
	);
	return client;
}
