import type { TilePos } from '../movement/types';

/**
 * BFS pathfinding over a walkability callback (Grid-compatible).
 * 4-directional, no corner cutting — same graph as player movement.
 * Pure + unit-testable; enemies reuse it every turn.
 */

export function bfsDistance(
  isWalkable: (t: TilePos) => boolean,
  width: number,
  height: number,
  from: TilePos,
  to: TilePos,
): number {
  if (from.x === to.x && from.y === to.y) return 0;
  const key = (x: number, y: number): string => `${x},${y}`;
  const seen = new Set<string>([key(from.x, from.y)]);
  let frontier: Array<TilePos & { d: number }> = [{ ...from, d: 0 }];
  while (frontier.length > 0) {
    const next: Array<TilePos & { d: number }> = [];
    for (const cur of frontier) {
      const cands = [
        { x: cur.x + 1, y: cur.y },
        { x: cur.x - 1, y: cur.y },
        { x: cur.x, y: cur.y + 1 },
        { x: cur.x, y: cur.y - 1 },
      ];
      for (const c of cands) {
        if (c.x === to.x && c.y === to.y) return cur.d + 1;
        const k = key(c.x, c.y);
        if (seen.has(k)) continue;
        if (c.x < 0 || c.y < 0 || c.x >= width || c.y >= height) continue;
        if (!isWalkable(c)) continue;
        seen.add(k);
        next.push({ ...c, d: cur.d + 1 });
      }
    }
    frontier = next;
  }
  return Infinity;
}

/**
 * Next step from `from` toward `to` along the shortest path.
 * Returns null when already there or when no path exists.
 * `blocked` marks dynamic obstacles (other enemies); `to` itself is
 * always enterable (that's the player tile — stepping on it = death).
 */
export function bfsNextStep(
  isWalkable: (t: TilePos) => boolean,
  width: number,
  height: number,
  from: TilePos,
  to: TilePos,
  blocked?: (t: TilePos) => boolean,
): TilePos | null {
  if (from.x === to.x && from.y === to.y) return null;
  const key = (x: number, y: number): string => `${x},${y}`;
  const prev = new Map<string, string>();
  const seen = new Set<string>([key(from.x, from.y)]);
  const queue: TilePos[] = [{ ...from }];
  const enterable = (t: TilePos): boolean => {
    if (t.x === to.x && t.y === to.y) return true;
    if (blocked?.(t)) return false;
    return isWalkable(t);
  };
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.x === to.x && cur.y === to.y) {
      // walk back to the neighbor of `from`
      let ckey = key(cur.x, cur.y);
      let step: TilePos = { ...cur };
      while (prev.get(ckey) !== key(from.x, from.y)) {
        const p = prev.get(ckey);
        if (!p) return null;
        const [px, py] = p.split(',').map(Number);
        step = { x: px, y: py };
        ckey = p;
      }
      return step;
    }
    for (const c of [
      { x: cur.x + 1, y: cur.y },
      { x: cur.x - 1, y: cur.y },
      { x: cur.x, y: cur.y + 1 },
      { x: cur.x, y: cur.y - 1 },
    ]) {
      const k = key(c.x, c.y);
      if (seen.has(k)) continue;
      if (c.x < 0 || c.y < 0 || c.x >= width || c.y >= height) continue;
      if (!enterable(c)) continue;
      seen.add(k);
      prev.set(k, key(cur.x, cur.y));
      queue.push(c);
    }
  }
  return null;
}

/** All walkable tiles reachable from `start` (flood fill). */
export function floodFill(
  isWalkable: (t: TilePos) => boolean,
  width: number,
  height: number,
  start: TilePos,
): Set<string> {
  const out = new Set<string>();
  if (!isWalkable(start)) return out;
  const queue: TilePos[] = [{ ...start }];
  out.add(`${start.x},${start.y}`);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const c of [
      { x: cur.x + 1, y: cur.y },
      { x: cur.x - 1, y: cur.y },
      { x: cur.x, y: cur.y + 1 },
      { x: cur.x, y: cur.y - 1 },
    ]) {
      const k = `${c.x},${c.y}`;
      if (out.has(k)) continue;
      if (c.x < 0 || c.y < 0 || c.x >= width || c.y >= height) continue;
      if (!isWalkable(c)) continue;
      out.add(k);
      queue.push(c);
    }
  }
  return out;
}
