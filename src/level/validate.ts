import { Grid } from '../movement/Grid';
import type { LevelDef } from './types';
import { bfsDistance, floodFill } from '../enemies/pathfind';
import { isKnownSprite, parseEntitySprite } from './catalog';
import { certifyAvoidable } from './solve';

/**
 * Shared level validator — runs on the server (api/) AND the client
 * before accepting an AI layout. Never trust the model; enforce:
 * rectangle, charset, border walls, footprint bounds/overlap,
 * single connected region, spawn/exit/pickup/enemy placement rules.
 */

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** Walkability for a level: ascii walk tiles minus blocking footprints. */
export function levelWalkability(level: LevelDef): {
  grid: Grid;
  isWalkable: (t: { x: number; y: number }) => boolean;
  width: number;
  height: number;
} {
  const grid = Grid.fromAscii(level.tiles, LEVEL_WALK);
  for (const p of level.props) {
    if (!p.blocksMovement) continue;
    for (const t of p.footprint) grid.setWalkable(t, false);
  }
  const width = grid.width;
  const height = grid.height;
  return { grid, isWalkable: (t) => grid.isWalkable(t), width, height };
}

/** Level tiles use exactly four chars: legacy v1 chars (P, >, G, …) have no
 * art in the level renderer and would silently flatten to floor. */
const LEVEL_CHARS = new Set(['.', 'S', 'E']);
/** Walkability mirror of LEVEL_CHARS for Grid.fromAscii. */
const LEVEL_WALK = ['.', 'S', 'E'];

export function validateLevel(level: LevelDef, depth = 1): ValidationResult {
  const errors: string[] = [];
  const rows = level.tiles;
  if (rows.length < 5) errors.push('tiles: too few rows (min 5)');
  if (rows.length > 24) errors.push('tiles: too many rows (max 24)');
  const w = rows[0]?.length ?? 0;
  if (w < 5) errors.push('tiles: too few columns (min 5)');
  if (w > 24) errors.push('tiles: too many columns (max 24)');
  rows.forEach((r, y) => {
    if (r.length !== w) errors.push(`tiles: row ${y} length ${r.length} != ${w}`);
    [...r].forEach((ch, x) => {
      if (ch !== '#' && !LEVEL_CHARS.has(ch)) errors.push(`tiles: bad char '${ch}' at ${x},${y}`);
    });
  });
  if (errors.length > 0) return { ok: false, errors };

  // border must be fully walled, except the exit door tile
  const borderOk = (ch: string): boolean => ch === '#' || ch === 'E';
  for (let x = 0; x < w; x++) {
    if (!borderOk(rows[0][x])) errors.push(`tiles: open border at ${x},0`);
    if (!borderOk(rows[rows.length - 1][x])) errors.push(`tiles: open border at ${x},${rows.length - 1}`);
  }
  rows.forEach((r, y) => {
    if (!borderOk(r[0])) errors.push(`tiles: open border at 0,${y}`);
    if (!borderOk(r[w - 1])) errors.push(`tiles: open border at ${w - 1},${y}`);
  });

  // S/E census: exactly one S at the spawn, exactly one E at the exit.
  // The exit sits IN the south border wall (a connected door, never a
  // floating gate); the spawn stays interior.
  {
    const at = (x: number, y: number): string | undefined => rows[y]?.[x];
    let sCount = 0;
    let eCount = 0;
    for (const r of rows) {
      for (const ch of r) {
        if (ch === 'S') sCount += 1;
        if (ch === 'E') eCount += 1;
      }
    }
    if (sCount !== 1 || at(level.spawn.x, level.spawn.y) !== 'S') {
      errors.push('spawn: tiles must contain exactly one S, at the spawn tile');
    }
    if (eCount !== 1 || at(level.exit.x, level.exit.y) !== 'E') {
      errors.push('exit: tiles must contain exactly one E, at the exit tile');
    }
    if (!(level.exit.y === rows.length - 1 && level.exit.x >= 1 && level.exit.x <= w - 2)) {
      errors.push('exit: must sit in the south border wall (the door), not floating interior');
    }
    if (!(level.spawn.x > 0 && level.spawn.y > 0 && level.spawn.x < w - 1 && level.spawn.y < rows.length - 1)) {
      errors.push('spawn: must be interior, not on the border');
    }
  }

  // Wall connection rule: every '#' belongs to the shell (touches the
  // border) or to an interior ruin run of 3+ connected tiles. Lone
  // pillars and 2-stubs never render cleanly — interior obstacles must
  // be furniture props with footprints instead.
  {
    const seen = new Set<string>();
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < w; x++) {
        if (rows[y][x] !== '#' || seen.has(`${x},${y}`)) continue;
        const group: Array<{ x: number; y: number }> = [];
        const stack = [{ x, y }];
        seen.add(`${x},${y}`);
        let touchesBorder = false;
        while (stack.length > 0) {
          const cur = stack.pop()!;
          group.push(cur);
          if (cur.x === 0 || cur.y === 0 || cur.x === w - 1 || cur.y === rows.length - 1) {
            touchesBorder = true;
          }
          for (const [nx, ny] of [[cur.x + 1, cur.y], [cur.x - 1, cur.y], [cur.x, cur.y + 1], [cur.x, cur.y - 1]]) {
            const k = `${nx},${ny}`;
            if (!seen.has(k) && rows[ny]?.[nx] === '#') {
              seen.add(k);
              stack.push({ x: nx, y: ny });
            }
          }
        }
        if (!touchesBorder && group.length < 3) {
          errors.push(
            `walls: free-floating ${group.length}-tile stub at ${group[0].x},${group[0].y} (interior runs need 3+ tiles — use a furniture prop instead)`,
          );
        }
      }
    }
  }

  const inB = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < rows.length;
  const occ = new Map<string, string>(); // tile -> what occupies it
  const claim = (x: number, y: number, what: string): void => {
    const k = `${x},${y}`;
    if (!inB(x, y)) {
      errors.push(`${what}: out of bounds at ${x},${y}`);
      return;
    }
    const prev = occ.get(k);
    if (prev) errors.push(`${what}: overlaps ${prev} at ${x},${y}`);
    else occ.set(k, what);
  };

  if (!inB(level.spawn.x, level.spawn.y)) errors.push('spawn: out of bounds');
  if (!inB(level.exit.x, level.exit.y)) errors.push('exit: out of bounds');
  claim(level.spawn.x, level.spawn.y, 'spawn');
  claim(level.exit.x, level.exit.y, 'exit');

  const wantPickups = 2 + Math.floor(depth / 3);
  if (level.pickups.length < 2) errors.push('pickups: need at least 2');
  if (level.pickups.length > 5) errors.push('pickups: at most 5');
  if (level.pickups.length < wantPickups) {
    errors.push(`pickups: depth ${depth} wants >= ${wantPickups}`);
  }
  level.pickups.forEach((p, i) => {
    if (!inB(p.x, p.y)) {
      errors.push(`pickups[${i}]: out of bounds`);
      return;
    }
    claim(p.x, p.y, `pickup ${p.id}`);
    if (!isKnownSprite(p.sprite)) {
      errors.push(`pickups[${i}]: unknown sprite '${p.sprite}' (must be a real ${level.theme}-pack sprite from the catalog)`);
    } else if (parseEntitySprite(p.sprite).pack !== level.theme) {
      errors.push(`pickups[${i}]: sprite pack must match the room theme (${level.theme})`);
    }
  });
  // pickups must not be adjacent (spread them out)
  for (let i = 0; i < level.pickups.length; i++) {
    for (let j = i + 1; j < level.pickups.length; j++) {
      const a = level.pickups[i];
      const b = level.pickups[j];
      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 2) {
        errors.push(`pickups: ${a.id} adjacent to ${b.id}`);
      }
    }
  }

  if (level.enemies.length < 1) errors.push('enemies: need at least 1 chaser');
  if (level.enemies.length > 4) errors.push('enemies: at most 4');
  level.enemies.forEach((e, i) => {
    if (!inB(e.x, e.y)) {
      errors.push(`enemies[${i}]: out of bounds`);
      return;
    }
    claim(e.x, e.y, `enemy ${e.id}`);
    if (e.kind !== 'chaser' && e.kind !== 'patrol') errors.push(`enemies[${i}]: bad kind`);
    if (e.tempo !== undefined && (!Number.isInteger(e.tempo) || e.tempo < 1 || e.tempo > 3)) {
      errors.push(`enemies[${i}]: tempo must be 1..3`);
    }
    if (e.sprite !== undefined) {
      if (!isKnownSprite(e.sprite)) {
        errors.push(`enemies[${i}]: unknown sprite '${e.sprite}' (must be a real ${level.theme}-pack sprite)`);
      } else if (parseEntitySprite(e.sprite).pack !== level.theme) {
        errors.push(`enemies[${i}]: sprite pack must match the room theme (${level.theme})`);
      }
    }
    if (e.kind === 'patrol' && (!e.path || e.path.length < 2)) {
      errors.push(`enemies[${i}]: patrol needs >= 2 waypoints`);
    }
  });

  for (const p of level.props) {
    if (!isKnownSprite(p.sprite)) {
      errors.push(`prop ${p.id}: unknown sprite '${p.sprite}' (must be a real ${level.theme}-pack sprite from the catalog)`);
    } else if (parseEntitySprite(p.sprite).pack !== level.theme) {
      errors.push(`prop ${p.id}: sprite pack must match the room theme (${level.theme})`);
    }
    if (p.footprint.length === 0) errors.push(`prop ${p.id}: empty footprint`);
    if (p.footprint.length > 6) errors.push(`prop ${p.id}: footprint > 6 tiles`);
    let anchorIn = false;
    for (const t of p.footprint) {
      if (!inB(t.x, t.y)) {
        errors.push(`prop ${p.id}: footprint out of bounds at ${t.x},${t.y}`);
        continue;
      }
      if (rows[t.y][t.x] === '#') errors.push(`prop ${p.id}: footprint on wall at ${t.x},${t.y}`);
      if (t.x === p.anchor.x && t.y === p.anchor.y) anchorIn = true;
    }
    if (!anchorIn) errors.push(`prop ${p.id}: anchor not in footprint`);
    // blockers must not cover gameplay-critical tiles
    if (p.blocksMovement) {
      for (const t of p.footprint) {
        const k = `${t.x},${t.y}`;
        const prev = occ.get(k);
        if (prev) errors.push(`prop ${p.id}: blocks ${prev} at ${t.x},${t.y}`);
      }
    }
    for (const t of p.footprint) {
      const k = `${t.x},${t.y}`;
      if (!occ.has(k)) occ.set(k, `prop ${p.id}`);
    }
  }

  // walkability + connectivity (blockers applied)
  const { isWalkable, width, height } = levelWalkability(level);
  if (!isWalkable(level.spawn)) errors.push('spawn: not walkable (blocked by prop?)');
  if (!isWalkable(level.exit)) errors.push('exit: not walkable (blocked by prop?)');
  for (const p of level.pickups) {
    if (!isWalkable(p)) errors.push(`pickup ${p.id}: not walkable`);
  }
  for (const e of level.enemies) {
    if (!isWalkable(e)) errors.push(`enemy ${e.id}: not walkable`);
  }

  const reach = floodFill(isWalkable, width, height, level.spawn);
  const need = [
    `${level.exit.x},${level.exit.y}`,
    ...level.pickups.map((p) => `${p.x},${p.y}`),
  ];
  for (const k of need) {
    if (!reach.has(k)) errors.push(`unreachable tile ${k} from spawn`);
  }

  // pacing: spawn far enough from exit, enemies far enough from spawn
  const manhattan = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
    Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  if (manhattan(level.spawn, level.exit) < Math.floor((width + height) / 2)) {
    errors.push('spawn: too close to exit (instant win)');
  }
  for (const e of level.enemies) {
    const d = bfsDistance(isWalkable, width, height, level.spawn, e);
    if (d < 5) errors.push(`enemy ${e.id}: starts ${d} steps from spawn (min 5)`);
  }
  if (errors.length > 0) return { ok: false, errors };

  // No-softlock guarantee: a solver plays the exact game rules (steps +
  // wait, deterministic enemies) and must find a full collect-and-exit
  // path that never touches an enemy. Both AI and fallback levels pass
  // through here, so the guarantee holds in both cases.
  const cert = certifyAvoidable(level, { timeMs: 1500 });
  if (!cert.ok) errors.push(`enemies: ${cert.reason}`);

  return { ok: errors.length === 0, errors };
}
