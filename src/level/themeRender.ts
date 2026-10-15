import type { LevelTheme } from './types';

/**
 * Theme rendering map: LevelDef tiles/sprites -> pack-qualified sprite ids.
 * Pure (no Phaser) so level-lab pins every emitted id to KNOWN_SPRITES.
 *
 * Level tiles only use '#', '.', 'S', 'E' — no doors/windows/stairs chars —
 * so walls render from each theme's wall family with border-specific
 * facings: every border shows its OUTER edge (x-runs face N on the south
 * border else S; y-runs face W on the east border else E), which keeps the
 * exterior silhouette clean and the wall feet on the tile. L-turns take
 * the arm-matched convex corner block; farm has no L-block so its
 * corners render both edge panels ('a+b' ids — renderers split on '+').
 * Library and base have no corner/door variants in their packs; library
 * reuses the dungeon stone corner and doorway, base reuses a block.
 */

/**
 * Ground sprite id for a theme room. Explicit file table, because two
 * packs ship no usable floor of their own: library floors with dungeon
 * dark planks (floorCarpet* are floating rugs, art mid-image), and base
 * uses square platforms (base_* round tiles leave corner gaps).
 */
const GROUND_FILE: Record<LevelTheme, { pack: string; base: string }> = {
  dungeon: { pack: 'dungeon', base: 'stone' },
  library: { pack: 'dungeon', base: 'planks' },
  farm: { pack: 'farm', base: 'dirt' },
  base: { pack: 'base', base: 'square_grass_flat' },
};

export function themeGround(theme: LevelTheme): string {
  const g = GROUND_FILE[theme];
  return `${g.pack}:${g.base}:S`;
}

/** Deterministic 0..1 hash for per-tile ground variation (stable per tile). */
function hash2(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 974634211) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = (h * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/**
 * Ground sprite id for a floor tile, with bounded deterministic variety:
 * dungeon mixes uneven/tile/inset/dirt accents into the stone; farm
 * rotates the dirt facing per tile with tilled patches; library stays
 * planks and base stays grass (their variety comes from rugs/substrate
 * and platform edges, verified cleaner as singles).
 */
export function themeGroundFor(theme: LevelTheme, x: number, y: number): string {
  switch (theme) {
    case 'dungeon': {
      // Accents cluster in 2x2 blocks and stay on the same plane: raised
      // stoneTile reads as holes, inset panels as pits, dirtTiles as
      // stains (all verified in renders). Uneven mottling is the only
      // safe wear accent.
      const b = hash2(Math.floor(x / 2), Math.floor(y / 2), 7);
      return b < 0.78 ? 'dungeon:stone:S' : 'dungeon:stoneUneven:S';
    }
    case 'farm': {
      if (hash2(x, y, 21) < 0.14) return 'farm:dirtFarmland:S';
      const dirs = ['N', 'E', 'S', 'W'] as const;
      return `farm:dirt:${dirs[Math.floor(hash2(x, y, 7) * 4) % 4]}`;
    }
    default:
      return themeGround(theme);
  }
}

/**
 * Extra substrate sprite rendered UNDER a theme's ground (same tile, same
 * layer, painted first): base pads float over void at platform gaps, so
 * a stone slab beneath closes the see-through seams. Null for themes
 * whose grounds are already full-bleed.
 */
export function themeSubstrate(theme: LevelTheme): string | null {
  return theme === 'base' ? 'dungeon:stone:S' : null;
}

const WALL_BASE: Record<LevelTheme, string> = {
  dungeon: 'stoneWall',
  library: 'wallBooks',
  farm: 'woodWall',
  base: 'square_stone_high',
};

/**
 * Freestanding pillar for a wall tile with no wall neighbors (defensive;
 * the validator rejects free-floating walls, so this only shows for
 * hand-made/experimental maps). Each reads as intentional, not broken:
 * a column, a fence fragment, a shelved niche, a raised block.
 */
const WALL_PILLAR: Record<LevelTheme, string> = {
  dungeon: 'stoneColumn',
  library: 'wallBooks',
  farm: 'woodWallSupport',
  base: 'square_stone_high',
};

/**
 * Convex corner block per theme. Library has no corner piece of its own,
 * so it reuses the dungeon stone corner: wallBooks carries stone jambs in
 * the same Kenney light, so a stone pier between shelf runs reads as built.
 *
 * Facing is arm-matched: each L-turn takes the corner facing whose arms
 * run along the same edges (es->S, sw->W, ne->E, wn->N), so both run ends
 * tuck under the block's mass and the exterior silhouette stays clean.
 * Farm has no L-block (its corner sprites are narrow joint posts), so
 * farm L-turns render BOTH edge panels ('a+b' ids) forming a real L-joint.
 * Base pads are symmetric blocks; corners render the block itself.
 */
const WALL_CORNER_FILE: Record<LevelTheme, { pack: string; base: string }> = {
  dungeon: { pack: 'dungeon', base: 'stoneWallCorner' },
  library: { pack: 'dungeon', base: 'stoneWallCorner' },
  farm: { pack: 'farm', base: 'woodWallCorner' },
  base: { pack: 'base', base: 'square_stone_high' },
};

/** Farm L-corner as both edge panels (no L-block in the pack). */
function farmCornerPair(e: boolean, s: boolean, w: boolean, n: boolean): string {
  if (e && s) return 'farm:woodWall:E+farm:woodWall:S';
  if (s && w) return 'farm:woodWall:S+farm:woodWall:W';
  if (n && e) return 'farm:woodWall:E+farm:woodWall:N';
  return 'farm:woodWall:W+farm:woodWall:N'; // w && n
}

/**
 * Wall sprite id for a '#' tile from its 4-neighborhood — the connection
 * rules. Every border shows its OUTER edge (x-runs face N on the south
 * border else S; y-runs face W on the east border else E), so the
 * exterior silhouette is clean and low fronts let you see over them:
 * - straight runs share one facing per border, tiling continuously;
 * - L-turns take the arm-matched convex corner block: (e,s)->S, (s,w)->W,
 *   (n,e)->E, (w,n)->N. Farm has no L-block, so its L-turns render both
 *   edge panels ('a+b' — renderers split on '+') forming a real L-joint;
 * - T-junctions/crossings run straight through the majority axis with
 *   the same border facings (the side arm butts into the run);
 * - isolated tiles become pillars, never a lone wall block.
 *
 * Base pads are symmetric blocks and keep the old faces (x-runs S,
 * y-runs W, corners the block itself).
 */
/** Direction from a wall tile toward the room interior (border tiles). */
export type InteriorSide = 'N' | 'S' | 'E' | 'W';

export function themeWallFor(
  theme: LevelTheme,
  x: number,
  y: number,
  isWall: (x: number, y: number) => boolean,
  interior?: InteriorSide,
): string {
  const n = isWall(x, y - 1);
  const s = isWall(x, y + 1);
  const e = isWall(x + 1, y);
  const w = isWall(x - 1, y);
  const count = (n ? 1 : 0) + (s ? 1 : 0) + (e ? 1 : 0) + (w ? 1 : 0);
  if (count === 0) return `${theme}:${WALL_PILLAR[theme]}:S`;
  // Base pads are symmetric: fixed faces, block corners (unchanged).
  if (theme === 'base') {
    const alongX = e || w;
    const alongY = n || s;
    if (alongX && !alongY) return 'base:square_stone_high:S';
    if (alongY && !alongX) return 'base:square_stone_high:W';
    if (count === 2) return 'base:square_stone_high:S';
    return e && w ? 'base:square_stone_high:S' : 'base:square_stone_high:W';
  }
  const base = WALL_BASE[theme];
  const xFace = interior === 'N' ? 'N' : 'S';
  const yFace = interior === 'W' ? 'W' : 'E';
  const alongX = e || w;
  const alongY = n || s;
  if (alongX && !alongY) return `${theme}:${base}:${xFace}`;
  if (alongY && !alongX) return `${theme}:${base}:${yFace}`;
  if (count === 2) {
    if (theme === 'farm') return farmCornerPair(e, s, w, n);
    const corner = WALL_CORNER_FILE[theme];
    const cid = `${corner.pack}:${corner.base}`;
    if (e && s) return `${cid}:S`;
    if (s && w) return `${cid}:W`;
    if (n && e) return `${cid}:E`;
    return `${cid}:N`; // w && n
  }
  // T-junction or crossing: straight through the majority axis.
  return e && w ? `${theme}:${base}:${xFace}` : `${theme}:${base}:${yFace}`;
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

/**
 * Exit-door sprites: locked (keys remain) vs unlocked. Doors sit in the
 * south border run, which faces N (outer edge), so doors face N too and
 * share the run's height — no step at the jambs.
 */
export function themeExitSprites(theme: LevelTheme): ExitSprites {
  switch (theme) {
    case 'dungeon':
      return { closed: 'dungeon:stoneWallDoorClosed:N', open: 'dungeon:stoneWallDoorOpen:N' };
    case 'farm':
      return { closed: 'farm:woodWallDoorClosed:N', open: 'farm:woodWallDoorOpen:N' };
    case 'library':
      return { closed: 'library:wallDoorway:N', open: 'library:wallDoorway:N', tintClosed: 0x8899bb };
    case 'base':
      return { closed: 'base:square_stone_high:S', open: 'base:square_stone_high:S', tintClosed: 0x8899bb };
  }
}
