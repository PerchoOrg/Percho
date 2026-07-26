/**
 * Discovery-funnel state machine skeleton (§0.2). One global `funnelStage`
 * (0–4) drives the feed rhythm engine (01), Search journey layer (04), and
 * You-tab familiarity (05).
 *
 * This task (task-0) defines only the machine + its promotion interface and
 * the hard invariant. The concrete promotion thresholds (§1.6 — how much
 * signal moves you from one stage to the next) belong to task-1.
 *
 * INVARIANT (§0.2): stage NEVER auto-regresses. `promoteTo` only ever moves
 * forward. A downshift happens exclusively through an explicit user action
 * (You-tab scope removal, Search deep-link) via `resetTo`.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type FunnelStage = 0 | 1 | 2 | 3 | 4;

interface FunnelState {
	stage: FunnelStage;
	/**
	 * Advance toward a later stage. Monotonic: a target at or below the current
	 * stage is ignored, so the funnel can never slide backward on its own.
	 * Returns true iff the stage actually advanced (feed uses this to fire the
	 * milestone card + success haptic — task-1).
	 */
	promoteTo: (target: FunnelStage) => boolean;
	/**
	 * Explicit user-driven jump (forward OR backward). The ONLY sanctioned way
	 * to move to an earlier stage. Not called by the automatic rhythm engine.
	 */
	resetTo: (stage: FunnelStage) => void;
}

export const useFunnelStore = create<FunnelState>()(
	persist(
		(set, get) => ({
			stage: 0,
			promoteTo: (target) => {
				if (target <= get().stage) return false;
				set({ stage: target });
				return true;
			},
			resetTo: (stage) => set({ stage }),
		}),
		{
			name: "percho-v3:funnel:v1",
			storage: createJSONStorage(() => AsyncStorage),
			partialize: (s) => ({ stage: s.stage }),
		},
	),
);
