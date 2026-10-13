import type { LevelTheme } from './types';

/**
 * Difficulty curve: depth (1-based level number) decides everything the
 * AI must place — theme, size, pickup/enemy budgets, level archetype,
 * and par. Deterministic so progression reads clearly and replays,
 * daily seeds, and the fallback generator all agree on the shape
 * before any model output arrives.
 */

export type LevelArchetype = 'arena' | 'maze' | 'vault' | 'gauntlet';

export interface Difficulty {
  depth: number;
  theme: LevelTheme;
  width: number;
  height: number;
  pickups: number;
  chasers: number;
  patrols: number;
  /** player turns per chaser step (2 at depth 1-2, else 1). */
  chaserTempo: number;
  archetype: LevelArchetype;
  /** rough expected solution length, for par/stars. */
  par: number;
}

export const THEME_ROTATION: LevelTheme[] = ['dungeon', 'library', 'farm', 'base'];
export const ARCHETYPE_ROTATION: LevelArchetype[] = ['arena', 'maze', 'vault', 'gauntlet'];

export const ARCHETYPE_BRIEF: Record<LevelArchetype, string> = {
  arena: 'open room with scattered pillar stubs; chasers have long sightlines, use pillars to break pursuit',
  maze: 'corridor-like wall nubs forming 2-3 routes; pickups at route ends so the player must commit',
  vault: 'pickups clustered in a guarded pocket with 1-2 entrances; enemies start near the pocket',
  gauntlet: 'spawn and exit at opposite ends with pickups along the way; patrol (if any) crosses the middle',
};

export function difficultyFor(depthRaw: number, themeOverride?: LevelTheme): Difficulty {
  const depth = Math.min(20, Math.max(1, Math.floor(depthRaw)));
  const theme = themeOverride ?? THEME_ROTATION[(depth - 1) % THEME_ROTATION.length];
  const width = Math.min(20, 12 + depth);
  const height = Math.min(16, 10 + depth);
  const pickups = Math.min(5, 2 + Math.floor(depth / 3));
  const chasers = Math.min(3, 1 + Math.floor((depth - 1) / 2));
  const patrols = depth >= 4 ? 1 : 0;
  const chaserTempo = depth <= 2 ? 2 : 1;
  const archetype = ARCHETYPE_ROTATION[(depth - 1) % ARCHETYPE_ROTATION.length];
  const par = Math.floor((width + height) / 2) + pickups * 6 + chasers * 3;
  return { depth, theme, width, height, pickups, chasers, patrols, chaserTempo, archetype, par };
}
