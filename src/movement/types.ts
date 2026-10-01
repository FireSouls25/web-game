export interface TilePos {
  x: number;
  y: number;
}

export type MoveResult =
  | { ok: true; to: TilePos }
  | { ok: false; reason: 'blocked' | 'out-of-bounds' | 'busy' };
