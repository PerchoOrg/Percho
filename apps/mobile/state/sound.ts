/**
 * Global sound state (§0.7). Video mounts muted; this single persisted flag is
 * the app-wide source of truth for whether audio plays. The SoundToggle chrome
 * button and every CardVideo read it.
 *
 * AsyncStorage rehydrates asynchronously, so `soundOn` reads false on the first
 * render regardless of what is on disk. `hydrated` lets a caller wait before
 * treating the value as the user's choice.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SoundState {
	soundOn: boolean;
	/** False until the persisted flag has been read back from AsyncStorage. */
	hydrated: boolean;
	toggle: () => void;
}

export const useSoundStore = create<SoundState>()(
	persist(
		(set) => ({
			/**
			 * Sound ON by default (2026-07-28).
			 *
			 * §0.7's "mount muted" is about the PLAYER — a video element that
			 * autoplays with sound can be refused outright, which is why
			 * `CardVideo` still creates its player muted and unmutes on becoming
			 * top. It is not a claim about the default the buyer should get.
			 *
			 * Defaulting this flag to false shipped every listing tour silently:
			 * the tours are rendered with BGM (verified: aac track present on every
			 * Cloudflare Stream manifest), and the only affordance to turn it on
			 * was `SoundToggle`, which was mounted on the dev screen and NOT on the
			 * feed. So the owner's "视频没有声音" was literally unfixable in-app.
			 * The toggle is now feed chrome, and this default is on: a
			 * property-tour feed with music is the intended first impression.
			 */
			soundOn: true,
			hydrated: false,
			toggle: () => set((s) => ({ soundOn: !s.soundOn })),
		}),
		{
			/*
			 * v2 (2026-08-15): key bump, NOT a no-op. Devices that persisted
			 * `soundOn:false` before the 2026-07-28 default flip (or by an
			 * early mute tap) rehydrate that stale false forever — with the
			 * toggle off the feed, a buyer on the feed can't unmute, and
			 * "all videos have no sound" on Tia's phone was exactly that.
			 * New key → empty storage → fresh `soundOn: true` default.
			 * One-time reset; sound-on is the product default.
			 */
			name: "percho-v3:sound:v2",
			storage: createJSONStorage(() => AsyncStorage),
			partialize: (s) => ({ soundOn: s.soundOn }),
			onRehydrateStorage: () => () => {
				useSoundStore.setState({ hydrated: true });
			},
		},
	),
);
