import type { TilePos } from '../movement/types';
import type { LevelDef, LevelTheme } from './types';
import { THEME_CATALOGS } from './catalog';
import { validateLevel } from './validate';
import { floodFill } from '../enemies/pathfind';

/**
 * Deterministic fallback generator — guarantees a playable level with
 * no network/AI. Used when the Vercel function is unreachable, the key
 * is missing, or the model output fails validation. Seeded so replays
 * and death-restarts are stable.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FallbackOpts {
  seed: number;
  theme: LevelTheme;
  depth?: number;
  width?: number;
  height?: number;
}

export function fallbackLevel(opts: FallbackOpts): LevelDef {
  const depth = Math.max(1, opts.depth ?? 1);
  const width = Math.min(24, Math.max(9, opts.width ?? Math.min(12 + depth, 20)));
  const height = Math.min(24, Math.max(9, opts.height ?? Math.min(10 + depth, 16)));
  const theme = opts.theme;
  const cat = THEME_CATALOGS[theme];
  const pickupsWant = Math.min(5, 2 + Math.floor(depth / 3));
  const enemiesWant = Math.min(3, 1 + Math.floor((depth - 1) / 2));

  for (let attempt = 0; attempt < 40; attempt++) {
    const rnd = mulberry32(opts.seed * 1000 + attempt * 77 + depth);
    const tiles: string[][] = Array.from({ length: height }, (_, y) =>
      Array.from({ length: width }, (_, x) =>
        x === 0 || y === 0 || x === width - 1 || y === height - 1 ? '#' : '.',
      ),
    );
    // scatter pillar stubs (2-long wall nubs) for maze texture
    const nubs = Math.floor((width * height) / 28) + depth;
    for (let i = 0; i < nubs; i++) {
      const x = 1 + Math.floor(rnd() * (width - 2));
      const y = 1 + Math.floor(rnd() * (height - 2));
      tiles[y][x] = '#';
      if (rnd() < 0.6) {
        const dx = rnd() < 0.5 ? 1 : 0;
        const dy = dx === 1 ? 0 : 1;
        const nx = x + dx;
        const ny = y + dy;
        if (nx > 0 && ny > 0 && nx < width - 1 && ny < height - 1) tiles[ny][nx] = '#';
      }
    }
    // carve spawn (top-left) and exit (bottom-right) clearings
    const spawn: TilePos = { x: 1, y: 1 };
    const exit: TilePos = { x: width - 2, y: height - 2 };
    for (const [cx, cy] of [
      [spawn.x, spawn.y],
      [exit.x, exit.y],
    ]) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx > 0 && ny > 0 && nx < width - 1 && ny < height - 1) tiles[ny][nx] = '.';
        }
      }
    }
    tiles[spawn.y][spawn.x] = 'S';
    tiles[exit.y][exit.x] = 'E';

    const rows = tiles.map((r) => r.join(''));
    const walk = (t: TilePos): boolean => {
      if (t.x < 0 || t.y < 0 || t.x >= width || t.y >= height) return false;
      return rows[t.y][t.x] !== '#';
    };
    const reach = floodFill(walk, width, height, spawn);
    if (!reach.has(`${exit.x},${exit.y}`)) continue;
    // candidate floor tiles far from spawn
    const floors: TilePos[] = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (rows[y][x] === '#' || rows[y][x] === 'S' || rows[y][x] === 'E') continue;
        if (!reach.has(`${x},${y}`)) continue;
        floors.push({ x, y });
      }
    }
    // shuffle
    for (let i = floors.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [floors[i], floors[j]] = [floors[j], floors[i]];
    }
    const manhattan = (a: TilePos, b: TilePos): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const pickups: LevelDef['pickups'] = [];
    for (const t of floors) {
      if (pickups.length >= pickupsWant) break;
      if (manhattan(t, spawn) < 3) continue;
      if (pickups.some((p) => manhattan(p, t) < 2)) continue;
      const base = cat.pickups[pickups.length % cat.pickups.length];
      pickups.push({ id: `key_${pickups.length + 1}`, x: t.x, y: t.y, sprite: `${theme}:${base}:S` });
    }
    if (pickups.length < pickupsWant) continue;
    const enemies: LevelDef['enemies'] = [];
    for (const t of floors) {
      if (enemies.length >= enemiesWant) break;
      if (pickups.some((p) => p.x === t.x && p.y === t.y)) continue;
      if (enemies.some((e) => e.x === t.x && e.y === t.y)) continue;
      if (manhattan(t, spawn) < 5) continue;
      enemies.push({ id: `chaser_${enemies.length + 1}`, kind: 'chaser', x: t.x, y: t.y, tempo: depth <= 2 ? 2 : 1 });
    }
    if (enemies.length < enemiesWant) continue;

    const level: LevelDef = {
      id: `fallback-${theme}-${opts.seed}-${depth}`,
      theme,
      tiles: rows,
      spawn,
      exit,
      pickups,
      enemies,
      props: [],
    };
    const v = validateLevel(level, depth);
    if (v.ok) return level;
  }
  // last-resort empty room (always valid, boring but safe)
  const rows = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) =>
      x === 0 || y === 0 || x === width - 1 || y === height - 1 ? '#' : '.',
    )
      .join('')
      .split('')
      .map((ch, x) => (x === 1 && y === 1 ? 'S' : x === width - 2 && y === height - 2 ? 'E' : ch))
      .join(''),
  );
  return {
    id: `fallback-${theme}-empty-${depth}`,
    theme,
    tiles: rows,
    spawn: { x: 1, y: 1 },
    exit: { x: width - 2, y: height - 2 },
    pickups: [
      { id: 'key_1', x: Math.floor(width / 2), y: 2, sprite: `${theme}:${cat.pickups[0]}:S` },
      { id: 'key_2', x: Math.floor(width / 2), y: height - 3, sprite: `${theme}:${cat.pickups[1] ?? cat.pickups[0]}:S` },
    ],
    enemies: [{ id: 'chaser_1', kind: 'chaser', x: width - 3, y: 1, tempo: depth <= 2 ? 2 : 1 }],
    props: [],
  };
}
