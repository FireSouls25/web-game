import { THEME_CATALOGS } from './catalog';
import type { LevelTheme } from './types';

/**
 * Theme rendering map: LevelDef tiles/sprites -> pack-qualified sprite ids.
 * Pure (no Phaser) so level-lab pins every emitted id to KNOWN_SPRITES.
 *
 * Level tiles only use '#', '.', 'S', 'E' — no doors/windows/stairs chars —
 * so walls render from each theme's wall family with GameScene-like
 * orientation (x-runs face S, y-runs face W, corners use the corner piece).
 * Library and base have no corner/door variants in their packs; they reuse
 * the base wall (library) or a tinted block (base exit) — placeholders
 * until those packs grow, documented at each site.
 */

/** Ground sprite id for a theme room (grounds[0], S facing). */
export function themeGround(theme: LevelTheme): string {
  return `${theme}:${THEME_CATALOGS[theme].grounds[0]}:S`;
}

const WALL_BASE: Record<LevelTheme, string> = {
  dungeon: 'stoneWall',
  library: 'wallBooks',
  farm: 'woodWall',
  base: 'base_stone_high',
};

const WALL_CORNER: Record<LevelTheme, string> = {
  dungeon: 'stoneWallCorner',
  library: 'wallBooks',
  farm: 'woodWallCorner',
  base: 'base_stone_high',
};

/** Wall sprite id for a '#' tile, oriented by run direction. */
export function themeWallFor(
  theme: LevelTheme,
  x: number,
  y: number,
  isWall: (x: number, y: number) => boolean,
): string {
  const alongX = isWall(x + 1, y) || isWall(x - 1, y);
  const alongY = isWall(x, y + 1) || isWall(x, y - 1);
  if (alongX && !alongY) return `${theme}:${WALL_BASE[theme]}:S`;
  if (alongY && !alongX) return `${theme}:${WALL_BASE[theme]}:W`;
  return `${theme}:${WALL_CORNER[theme]}:S`;
}

export interface ExitSprites {
  closed: string;
  open: string;
  /**
   * Themes without a door pair (library, base) reuse one sprite and tint
   * the locked state instead.
   */
  tintClosed?: number;
}

/** Exit-door sprites: locked (keys remain) vs unlocked. */
export function themeExitSprites(theme: LevelTheme): ExitSprites {
  switch (theme) {
    case 'dungeon':
      return { closed: 'dungeon:stoneWallDoorClosed:S', open: 'dungeon:stoneWallDoorOpen:S' };
    case 'farm':
      return { closed: 'farm:woodWallDoorClosed:S', open: 'farm:woodWallDoorOpen:S' };
    case 'library':
      return { closed: 'library:wallDoorway:S', open: 'library:wallDoorway:S', tintClosed: 0x8899bb };
    case 'base':
      return { closed: 'base:square_stone_high:S', open: 'base:square_stone_high:S', tintClosed: 0x8899bb };
  }
}
