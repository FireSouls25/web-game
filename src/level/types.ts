import type { TilePos } from '../movement/types';

/** Art theme — one Kenney pack per level. */
export type LevelTheme = 'dungeon' | 'library' | 'farm' | 'base';

/** Chaser steps toward the player every turn; patrol loops waypoints. */
export type EnemyKind = 'chaser' | 'patrol';

export interface LevelPickup {
  id: string;
  x: number;
  y: number;
  /** pack-qualified sprite, e.g. "dungeon:chestClosed:S" (see catalog). */
  sprite: string;
}

export interface LevelEnemy {
  id: string;
  kind: EnemyKind;
  x: number;
  y: number;
  /** pack-qualified sprite; falls back to theme default chaser. */
  sprite?: string;
  /** patrol waypoints (patrol kind only). */
  path?: TilePos[];
  /**
   * Player turns per enemy step (default 1). Depth 1-2 chasers use 2:
   * equal-speed perfect pursuit is lethal even with optimal play, so
   * early chasers move every 2nd turn. Set by the difficulty curve.
   */
  tempo?: number;
}

/**
 * Placed entity: rendered ONCE at anchor, physically occupies footprint.
 * This is the footprint/hitbox split — wide furniture (bookcases, long
 * tables) anchors to one tile but blocks every footprint tile in Grid.
 * Footprint tiles are ABSOLUTE (not offsets) so the AI emits exact coords
 * and the validator can check bounds/overlap without resolving anchors.
 */
export interface EntityDef {
  id: string;
  /** pack-qualified sprite: "pack:base" (= S) or "pack:base:DIR". */
  sprite: string;
  anchor: TilePos;
  footprint: TilePos[];
  /** when true every footprint tile becomes unwalkable. */
  blocksMovement: boolean;
}

export interface LevelDef {
  id: string;
  theme: LevelTheme;
  /** ascii rows: '#' wall, '.' floor, 'S' spawn floor, 'E' exit floor. */
  tiles: string[];
  spawn: TilePos;
  exit: TilePos;
  /** exit opens when every pickup is collected. */
  pickups: LevelPickup[];
  enemies: LevelEnemy[];
  props: EntityDef[];
  /** expected solution length, for par/stars (optional). */
  par?: number;
}
