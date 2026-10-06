import type { TilePos } from './types';

/**
 * Single source of truth for the isometric tile system.
 *
 * - Exactly one ground sprite == one walkable tile. Entities (player, NPCs)
 *   always stand ON a tile (feet on the diamond center), never on a vertex
 *   or an edge. `tile` is always integer; screen position is always derived
 *   via the helpers below.
 * - Movement graph is 4-directional, edge-to-edge: each step goes to the
 *   tile sharing a side with the current one. Vertex-touching (diagonal
 *   grid) steps are NOT tiles moves and are rejected by `isIsoStep`.
 *
 * Compass follows the Kenney Isometric pack (see
 * public/prototype_sprites/Information.png):
 *   N = screen up-right    (0, -1)  human facing 0
 *   E = screen down-right  (+1, 0)  human facing 2
 *   S = screen down-left   (0, +1)  human facing 4
 *   W = screen up-left     (-1, 0)  human facing 6
 * Screen-straight moves (up/down/left/right) hit vertices, not tiles.
 */

/** Displayed diamond footprint (native 256x128 scaled by SPRITE_SCALE). */
export const TILE_W = 64;
export const TILE_H = 32;
/** Back-compat alias (square-tile callers). */
export const TILE = TILE_W;
/** Native Kenney sprite width (256) -> displayed width. */
export const SPRITE_SCALE = TILE_W / 256;

export type IsoDirKey = 'N' | 'E' | 'S' | 'W';

export interface IsoDir {
  key: IsoDirKey;
  /** grid step */
  dx: number;
  dy: number;
  /** Human_* facing index for this direction (see Information.png) */
  facing: number;
  /** screen delta for one step in this direction */
  sx: number;
  sy: number;
}

export const ISO_DIRS: Record<IsoDirKey, IsoDir> = {
  N: { key: 'N', dx: 0, dy: -1, facing: 0, sx: TILE_W / 2, sy: -TILE_H / 2 },
  E: { key: 'E', dx: 1, dy: 0, facing: 2, sx: TILE_W / 2, sy: TILE_H / 2 },
  S: { key: 'S', dx: 0, dy: 1, facing: 4, sx: -TILE_W / 2, sy: TILE_H / 2 },
  W: { key: 'W', dx: -1, dy: 0, facing: 6, sx: -TILE_W / 2, sy: -TILE_H / 2 },
};

/** N/E/S/W in cycle order. */
export const ISO_DIR_LIST: IsoDir[] = [ISO_DIRS.N, ISO_DIRS.E, ISO_DIRS.S, ISO_DIRS.W];

/** Human facings used by 4-directional tile movement. */
export const ISO_FACINGS = [0, 2, 4, 6] as const;

/**
 * True only for edge-to-edge tile steps (|dx|+|dy| === 1).
 * Diagonal grid steps touch at a vertex and are not legal tile moves.
 */
export function isIsoStep(dx: number, dy: number): boolean {
  return Math.abs(dx) + Math.abs(dy) === 1;
}

/** Facing index for an iso step, or null for non-tile (vertex) steps. */
export function facingForStep(dx: number, dy: number): number | null {
  if (dx === 0 && dy === -1) return 0; // N
  if (dx === 1 && dy === 0) return 2; // E
  if (dx === 0 && dy === 1) return 4; // S
  if (dx === -1 && dy === 0) return 6; // W
  return null;
}

/** Grid (x,y) -> screen position of the diamond CENTER. */
export function tileToScreen(x: number, y: number): { sx: number; sy: number } {
  return { sx: ((x - y) * TILE_W) / 2, sy: ((x + y) * TILE_H) / 2 };
}

/**
 * Screen (ground point) -> tile containing that point.
 * Pure inverse of tileToScreen — no sprite-anchor offset. Use this for
 * pointer picking / hover (world points on the ground plane).
 */
export function screenToTile(wx: number, wy: number): { x: number; y: number } {
  const fx = wx / (TILE_W / 2);
  const fy = wy / (TILE_H / 2);
  return { x: Math.floor((fx + fy) / 2), y: Math.floor((fy - fx) / 2) };
}

/**
 * Screen position for the bottom-center anchor (origin 0.5, 1) of an entity
 * standing ON tile (x, y). The image bottom sits on the diamond's front
 * vertex (sy + TILE_H/2) so the feet — ~14px above the image bottom at this
 * scale — land on the diamond center. Every tile entity (player, NPCs,
 * tall props) must use this, so spawn and movement share one anchor.
 */
export function tileFootScreen(x: number, y: number): { tx: number; ty: number } {
  const { sx, sy } = tileToScreen(x, y);
  return { tx: sx, ty: sy + TILE_H / 2 };
}

/**
 * Tile for a bottom-anchored sprite position (e.g. dragging a prop image
 * whose x/y is its front-vertex anchor). Subtracts the anchor offset first,
 * then does the ground-plane inverse.
 */
export function tileFromFoot(wx: number, wy: number): { x: number; y: number } {
  return screenToTile(wx, wy - TILE_H / 2);
}

/** Y-sort key: tiles behind (smaller x+y) draw first. */
export function depthFor(x: number, y: number, layer = 0): number {
  return (x + y) * 10 + layer;
}

export function tileKey(p: TilePos): string {
  return `${p.x},${p.y}`;
}

export function tileEquals(a: TilePos, b: TilePos): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Minimal tile-entity state shared by the player and NPCs. Rendering stays
 * in the scene (tweens, textures); this only guarantees the invariant:
 * the entity is always exactly on one tile, and steps are always N/E/S/W.
 */
export class TileActor {
  tile: TilePos;
  facing: number;

  constructor(tile: TilePos, facing = 4) {
    this.tile = { ...tile };
    this.facing = facing;
  }

  /** Tile after stepping (dx,dy), or null when it is not an iso step. */
  stepTo(dx: number, dy: number): TilePos | null {
    if (!isIsoStep(dx, dy)) return null;
    const f = facingForStep(dx, dy);
    if (f !== null) this.facing = f;
    this.tile = { x: this.tile.x + dx, y: this.tile.y + dy };
    return { ...this.tile };
  }

  screen(): { tx: number; ty: number } {
    return tileFootScreen(this.tile.x, this.tile.y);
  }

  depth(layer = 0.2): number {
    return depthFor(this.tile.x, this.tile.y, layer);
  }
}
