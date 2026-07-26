/**
 * Global sound state (§0.7). Video mounts muted; this single persisted flag is
 * the app-wide source of truth for whether audio plays. The SoundToggle chrome
 * button and every CardVideo read it.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SoundState {
	soundOn: boolean;
	setSoundOn: (on: boolean) => void;
	toggle: () => void;
}

export const useSoundStore = create<SoundState>()(
	persist(
		(set) => ({
			soundOn: false, // default muted per §0.7
			setSoundOn: (on) => set({ soundOn: on }),
			toggle: () => set((s) => ({ soundOn: !s.soundOn })),
		}),
		{
			name: "percho-v3:sound:v1",
			storage: createJSONStorage(() => AsyncStorage),
		},
	),
);
