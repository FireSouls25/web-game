import type { TilePos } from './types';

/**
 * Pure tile-grid logic (no Phaser dependency so it is unit-testable).
 * `walkable[y][x] === true` means the player may stand there.
 */
export class Grid {
  readonly width: number;
  readonly height: number;
  private walkable: boolean[][];

  constructor(walkable: boolean[][]) {
    this.height = walkable.length;
    this.width = walkable[0]?.length ?? 0;
    this.walkable = walkable.map((row) => [...row]);
  }

  static fromAscii(
    rows: string[],
    // Full legend (docs/manor-layout.md): '>' stairs are walkable; walls
    // (#, G window), furniture T table, B shelf, W water, C clock, D desk,
    // d bed, R railing are blocked (props/walk overrides can change this).
    walkableChars = ['.', 'S', 'E', 'P', '>'],
  ): Grid {
    const set = new Set(walkableChars);
    return new Grid(rows.map((r) => [...r].map((ch) => set.has(ch))));
  }

  inBounds(p: TilePos): boolean {
    return p.x >= 0 && p.y >= 0 && p.x < this.width && p.y < this.height;
  }

  isWalkable(p: TilePos): boolean {
    return this.inBounds(p) && this.walkable[p.y][p.x];
  }

  setWalkable(p: TilePos, v: boolean): void {
    if (this.inBounds(p)) this.walkable[p.y][p.x] = v;
  }

  neighbors(p: TilePos): TilePos[] {
    const cands = [
      { x: p.x + 1, y: p.y },
      { x: p.x - 1, y: p.y },
      { x: p.x, y: p.y + 1 },
      { x: p.x, y: p.y - 1 },
    ];
    return cands.filter((c) => this.isWalkable(c));
  }
}
