import type { TraitKey, TraitScores } from './types';

export const TRAIT_KEYS: readonly TraitKey[] = [
  'family',
  'walkable',
  'quiet',
  'hip',
  'schools',
  'green',
  'nightlife',
  'commute',
] as const;

export const TRAIT_LABELS: Record<TraitKey, string> = {
  family: '👨‍👩‍👧 Family',
  walkable: '🚶 Walkable',
  quiet: '🌙 Quiet',
  hip: '🎨 Hip',
  schools: '🏫 Schools',
  green: '🌳 Green',
  nightlife: '🌃 Nightlife',
  commute: '🚗 Commute',
};

export function emptyTraits(): TraitScores {
  return {};
}

export function clampTrait(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}
