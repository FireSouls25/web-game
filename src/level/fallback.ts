import type { TilePos } from '../movement/types';
import type { LevelDef, LevelTheme } from './types';
import { THEME_CATALOGS } from './catalog';
import { difficultyFor } from './difficulty';
import { validateLevel } from './validate';
import { floodFill } from '../enemies/pathfind';

/**
 * Deterministic fallback generator — guarantees a playable level with
 * no network/AI. Used when the Vercel function is unreachable, the key
 * is missing, or the model output fails validation. Seeded so replays
 * and death-restarts are stable.
 */

/**
 * Deterministic empty room at full depth budgets: pickups spread across
 * the middle band, chasers in far corners, patrols ping-ponging mid-room.
 * Open space + capped pursuers keep it certifiable (verified in level-lab).
 */
function emptyRoom(
  theme: LevelTheme,
  width: number,
  height: number,
  difficulty: ReturnType<typeof difficultyFor>,
  variant: number,
): LevelDef {
  const cat = THEME_CATALOGS[theme];
  const rows = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) =>
      x === 0 || y === 0 || x === width - 1 || y === height - 1 ? '#' : '.',
    ).join(''),
  );
  rows[1] = `${rows[1].slice(0, 1)}S${rows[1].slice(2)}`;
  rows[height - 1] = `${rows[height - 1].slice(0, width - 3)}E${rows[height - 1].slice(width - 2)}`;
  const pickups: LevelDef['pickups'] = [];
  for (let i = 0; i < difficulty.pickups; i++) {
    const x = 2 + Math.floor((i * (width - 5)) / Math.max(1, difficulty.pickups - 1));
    const y = i % 2 === 0 ? 2 + variant : height - 3 - variant;
    pickups.push({
      id: `key_${i + 1}`,
      x,
      y,
      sprite: `${theme}:${cat.pickups[i % cat.pickups.length]}:S`,
    });
  }
  const enemies: LevelDef['enemies'] = [];
  const corners = [
    { x: width - 3, y: 1 },
    { x: width - 3, y: height - 4 },
  ];
  for (let i = 0; i < difficulty.chasers; i++) {
    const c = corners[i % corners.length];
    enemies.push({
      id: `chaser_${i + 1}`,
      kind: 'chaser',
      x: c.x,
      y: Math.min(height - 2, Math.max(1, c.y + variant)),
      tempo: difficulty.chaserTempo,
    });
  }
  for (let i = 0; i < difficulty.patrols; i++) {
    const x = 3 + i * 4;
    const y = Math.floor(height / 2);
    enemies.push({
      id: `patrol_${i + 1}`,
      kind: 'patrol',
      x,
      y,
      path: [
        { x, y },
        { x: x + 1, y },
      ],
      tempo: 1,
    });
  }
  return {
    id: `fallback-${theme}-empty-${difficulty.depth}-${variant}`,
    theme,
    tiles: rows,
    spawn: { x: 1, y: 1 },
    exit: { x: width - 3, y: height - 1 },
    pickups,
    enemies,
    props: [],
  };
}

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
  const depth = Math.max(1, Math.min(20, opts.depth ?? 1));
  // Budgets come from the difficulty curve (single source of truth —
  // the AI prompt uses the same numbers). Only size may be overridden.
  const difficulty = difficultyFor(depth, opts.theme);
  const width = Math.min(24, Math.max(9, opts.width ?? difficulty.width));
  const height = Math.min(24, Math.max(9, opts.height ?? difficulty.height));
  const theme = difficulty.theme;
  const cat = THEME_CATALOGS[theme];
  const pickupsWant = difficulty.pickups;
  const chasersWant = difficulty.chasers;
  const patrolsWant = difficulty.patrols;

  for (let attempt = 0; attempt < 40; attempt++) {
    const rnd = mulberry32(opts.seed * 1000 + attempt * 77 + depth);
    // '#' is border-only: interior obstacles are furniture props (crates,
    // shelves, bales), which read as objects instead of broken wall stubs.
    const tiles: string[][] = Array.from({ length: height }, (_, y) =>
      Array.from({ length: width }, (_, x) =>
        x === 0 || y === 0 || x === width - 1 || y === height - 1 ? '#' : '.',
      ),
    );
    const spawn: TilePos = { x: 1, y: 1 };
    // Exit door sits IN the south border wall (connected, never floating).
    const exit: TilePos = { x: width - 3, y: height - 1 };
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
    const chasers: LevelDef['enemies'] = [];
    for (const t of floors) {
      if (chasers.length >= chasersWant) break;
      if (pickups.some((p) => p.x === t.x && p.y === t.y)) continue;
      if (chasers.some((e) => e.x === t.x && e.y === t.y)) continue;
      if (manhattan(t, spawn) < 5) continue;
      chasers.push({ id: `chaser_${chasers.length + 1}`, kind: 'chaser', x: t.x, y: t.y, tempo: difficulty.chaserTempo });
    }
    if (chasers.length < chasersWant) continue;
    // patrols: ping-pong pairs on free floors (readable, dodgeable loops).
    const claimed = new Set([
      `${spawn.x},${spawn.y}`,
      `${exit.x},${exit.y}`,
      ...pickups.map((p) => `${p.x},${p.y}`),
      ...chasers.map((e) => `${e.x},${e.y}`),
    ]);
    const patrols: LevelDef['enemies'] = [];
    for (const t of floors) {
      if (patrols.length >= patrolsWant) break;
      if (claimed.has(`${t.x},${t.y}`)) continue;
      if (manhattan(t, spawn) < 5) continue;
      const nb = [
        { x: t.x + 1, y: t.y },
        { x: t.x - 1, y: t.y },
        { x: t.x, y: t.y + 1 },
        { x: t.x, y: t.y - 1 },
      ].find((c) => rows[c.y]?.[c.x] === '.' && !claimed.has(`${c.x},${c.y}`));
      if (!nb) continue;
      claimed.add(`${t.x},${t.y}`);
      claimed.add(`${nb.x},${nb.y}`);
      patrols.push({
        id: `patrol_${patrols.length + 1}`,
        kind: 'patrol',
        x: t.x,
        y: t.y,
        path: [{ ...t }, { ...nb }],
        tempo: 1,
      });
    }
    if (patrols.length < patrolsWant) continue;
    const enemies: LevelDef['enemies'] = [...chasers, ...patrols];
    // interior obstacles: compact furniture blockers on free floors —
    // never on claimed tiles, never crowding the spawn.
    const taken = new Set([
      `${spawn.x},${spawn.y}`,
      `${exit.x},${exit.y}`,
      ...pickups.map((p) => `${p.x},${p.y}`),
      ...enemies.map((e) => `${e.x},${e.y}`),
      ...patrols.flatMap((e) => (e.path ?? []).map((t) => `${t.x},${t.y}`)),
    ]);
    const free = floors.filter(
      (t) => !taken.has(`${t.x},${t.y}`) && manhattan(t, spawn) >= 2,
    );
    const propsWant = Math.min(free.length, Math.floor((width * height) / 28) + depth);
    const props: LevelDef['props'] = [];
    for (let i = 0; i < propsWant; i++) {
      const t = free[(i * 2 + Math.floor(rnd() * free.length)) % free.length];
      if (taken.has(`${t.x},${t.y}`)) continue;
      taken.add(`${t.x},${t.y}`);
      const base = cat.blockers[(i + attempt) % cat.blockers.length];
      props.push({
        id: `prop_${i + 1}`,
        sprite: `${theme}:${base}:S`,
        anchor: { ...t },
        footprint: [{ ...t }],
        blocksMovement: true,
      });
    }

    const level: LevelDef = {
      id: `fallback-${theme}-${opts.seed}-${depth}`,
      theme,
      tiles: rows,
      spawn,
      exit,
      pickups,
      enemies,
      props,
    };
    const v = validateLevel(level, depth);
    if (v.ok) return level;
  }
  // Last resort: empty room built to the SAME budgets (never hardcoded
  // counts), validated like everything else — an under-budgeted fallback
  // would fail its own validator and could 500 the api route.
  let last: LevelDef = emptyRoom(theme, width, height, difficulty, 0);
  for (let s = 0; s < 3; s++) {
    const cand = emptyRoom(theme, width, height, difficulty, s);
    if (validateLevel(cand, depth).ok) return cand;
    last = cand;
  }
  return last;
}
