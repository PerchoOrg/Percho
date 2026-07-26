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
			soundOn: false, // default muted per §0.7
			hydrated: false,
			toggle: () => set((s) => ({ soundOn: !s.soundOn })),
		}),
		{
			name: "percho-v3:sound:v1",
			storage: createJSONStorage(() => AsyncStorage),
			partialize: (s) => ({ soundOn: s.soundOn }),
			onRehydrateStorage: () => () => {
				useSoundStore.setState({ hydrated: true });
			},
		},
	),
);
