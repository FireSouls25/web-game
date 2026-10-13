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
 * Y-run facing per theme, chosen by LOOKING at the sprites (fronts vs
 * backs), not by convention: dungeon/farm/base pieces are symmetric, but
 * wallBooks shows shelves only on S and E (N/W are plain stone backs).
 */
const WALL_YDIR: Record<LevelTheme, string> = {
  dungeon: 'W',
  library: 'E',
  farm: 'W',
  base: 'W',
};

/**
 * Convex corner block per theme. Library has no corner piece of its own,
 * so it reuses the dungeon stone corner: wallBooks carries stone jambs in
 * the same Kenney light, so a stone pier between shelf runs reads as built.
 *
 * Facing choice is lean-matched, not arm-matched: every wall art leans to
 * one side (S runs lean east, W runs lean east, E runs lean west). The
 * centered S tower covers the (e,s)/(w,n) diagonal pair; the east-leaning
 * W block covers (s,w) and (n,e): its mass sits over the x-run ends (whose
 * west tips are thin) and gives a clean outer silhouette on the east side.
 * The west-leaning E block chips the skyline and notches the south face;
 * the short N block dents below run tops: neither is used for L-turns.
 * Farm has no L-block at all (its corner sprites are narrow joint posts
 * that float above the runs), so farm L-turns bypass this table and
 * butt-joint through the y-run.
 */
const WALL_CORNER_FILE: Record<LevelTheme, { pack: string; base: string }> = {
  dungeon: { pack: 'dungeon', base: 'stoneWallCorner' },
  library: { pack: 'dungeon', base: 'stoneWallCorner' },
  farm: { pack: 'farm', base: 'woodWallCorner' },
  base: { pack: 'base', base: 'square_stone_high' },
};

/**
 * Wall sprite id for a '#' tile from its 4-neighborhood — the connection
 * rules. Every sprite may only side tiles it visually joins:
 * - straight runs share one facing (x-runs S, y-runs W), so side faces
 *   tile continuously with no notches;
 * - L-turns take the lean-matched convex corner block: (e,s)->S, (w,n)->S,
 *   (s,w)->W, (n,e)->W. Farm has no
 *   L-block, so its L-turns butt-joint: the y-run continues through and
 *   the x-run ends into its side (verified joint, no floating posts);
 * - T-junctions/crossings run straight through the majority axis (the
 *   side arm butts its end face into the run, like real masonry);
 * - isolated tiles become pillars, never a lone wall block.
 *
 * Facing baselines differ per art (S walls sit ~12px above W walls at
 * native scale); the wide corner blocks and panel overlaps hide the step
 * at joints, so no per-sprite offset is needed for border rooms.
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
  // Library fronts exist only on S/E: runs whose interior faces N/W get
  // the low half-shelf (faced outward) so you see over it instead of
  // stone backs. Other themes are symmetric and stay tall everywhere.
  if (theme === 'library') {
    const xRun = (int: InteriorSide | undefined): string =>
      int === 'N' ? 'library:bookcaseHalfBooks:S' : 'library:wallBooks:S';
    const yRun = (int: InteriorSide | undefined): string =>
      int === 'W' ? 'library:bookcaseHalfBooks:E' : 'library:wallBooks:E';
    const alongX = e || w;
    const alongY = n || s;
    if (alongX && !alongY) return xRun(interior);
    if (alongY && !alongX) return yRun(interior);
    if (count === 2) {
      const corner = WALL_CORNER_FILE[theme];
      const cid = `${corner.pack}:${corner.base}`;
      if (e && s) return `${cid}:S`;
      if (w && n) return `${cid}:S`;
      return `${cid}:W`; // (s,w) and (n,e) both take the east-leaning block
    }
    return e && w ? xRun(interior) : yRun(interior);
  }
  const alongX = e || w;
  const alongY = n || s;
  const yDir = WALL_YDIR[theme];
  if (alongX && !alongY) return `${theme}:${WALL_BASE[theme]}:S`;
  if (alongY && !alongX) return `${theme}:${WALL_BASE[theme]}:${yDir}`;
  const corner = WALL_CORNER_FILE[theme];
  const cid = `${corner.pack}:${corner.base}`;
  if (count === 2) {
    // Farm corner sprites are joint posts, not L-blocks: butt-joint the
    // y-run straight through instead (verified connected in renders).
    if (theme === 'farm') return `${theme}:${WALL_BASE[theme]}:${yDir}`;
    if (e && s) return `${cid}:S`;
    if (w && n) return `${cid}:S`;
    return `${cid}:W`; // (s,w) and (n,e) both take the east-leaning block
  }
  // T-junction or crossing: straight through the majority axis.
  return `${theme}:${WALL_BASE[theme]}:${e && w ? 'S' : yDir}`;
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
