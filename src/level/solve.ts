import { Grid } from '../movement/Grid';
import type { TilePos } from '../movement/types';
import type { LevelDef } from './types';
import { stepEnemy } from '../enemies/step';

/**
 * Avoidability certificate: proves a level can be completed (all pickups
 * + exit) WITHOUT ever touching an enemy, playing the exact game rules.
 *
 * Both generators (AI + fallback) must pass this — it is the "no
 * softlock" guarantee. Search is A* over (player, enemies, pickup mask,
 * turn parity) with 5 actions (4 steps + wait); enemy moves replay the
 * shared deterministic core in enemies/step.ts, and applyAction() below
 * is differential-tested against resolveTurn/waitTurn in level-lab, so a
 * certified escape plays back in the real game move for move.
 */

export interface CertOptions {
  /** cap on expanded states (default 120_000). */
  maxVisited?: number;
  /** wall-clock budget in ms (default 1500). */
  timeMs?: number;
}

export interface CertResult {
  ok: boolean;
  /** human-readable reason (unsolvable vs budget-exhausted). */
  reason: string;
  solutionLength: number;
  visited: number;
  ms: number;
}

interface SolverEnemy {
  kind: 'chaser' | 'patrol';
  pos: TilePos;
  path: TilePos[];
  pathIdx: number;
  tempo: number;
}

/** Precomputed static level view shared by the search + lab tests. */
export interface SolverLevel {
  walk: (t: TilePos) => boolean;
  width: number;
  height: number;
  exit: TilePos;
  /** pickup index -> tile. */
  pickups: TilePos[];
  enemies: SolverEnemy[];
  /** static BFS distance fields from exit + each pickup (admissible h). */
  distExit: Int32Array;
  distPick: Int32Array[];
}

export type SolverAction = { dx: number; dy: number } | 'wait';

export interface SolverState {
  player: TilePos;
  enemies: SolverEnemy[];
  /** bitmask over SolverLevel.pickups (1 = still to collect). */
  mask: number;
  turn: number;
}

export function prepareSolver(level: LevelDef): SolverLevel {
  const grid = Grid.fromAscii(level.tiles);
  for (const p of level.props) {
    if (!p.blocksMovement) continue;
    for (const t of p.footprint) grid.setWalkable(t, false);
  }
  const width = grid.width;
  const height = grid.height;
  const walk = (t: TilePos): boolean => grid.isWalkable(t);
  const field = (src: TilePos): Int32Array => {
    const d = new Int32Array(width * height).fill(-1);
    if (!walk(src)) return d;
    d[src.y * width + src.x] = 0;
    const q: TilePos[] = [{ ...src }];
    while (q.length > 0) {
      const cur = q.shift()!;
      for (const c of [
        { x: cur.x + 1, y: cur.y },
        { x: cur.x - 1, y: cur.y },
        { x: cur.x, y: cur.y + 1 },
        { x: cur.x, y: cur.y - 1 },
      ]) {
        if (c.x < 0 || c.y < 0 || c.x >= width || c.y >= height) continue;
        if (d[c.y * width + c.x] !== -1) continue;
        if (!walk(c)) continue;
        d[c.y * width + c.x] = d[cur.y * width + cur.x] + 1;
        q.push(c);
      }
    }
    return d;
  };
  return {
    walk,
    width,
    height,
    exit: { ...level.exit },
    pickups: level.pickups.map((p) => ({ x: p.x, y: p.y })),
    enemies: level.enemies.map((e) => ({
      kind: e.kind,
      pos: { x: e.x, y: e.y },
      path: (e.path ?? []).map((t) => ({ ...t })),
      pathIdx: 0,
      tempo: e.tempo ?? 1,
    })),
    distExit: field(level.exit),
    distPick: level.pickups.map((p) => field(p)),
  };
}

function distAt(d: Int32Array, width: number, t: TilePos): number {
  const v = d[t.y * width + t.x];
  // statically unreachable here means the validator's flood-fill already
  // failed; fall back to manhattan (still admissible) so we never crash.
  return v >= 0 ? v : Math.abs(t.x) + Math.abs(t.y);
}

/** Admissible: must still visit every remaining pickup, then the exit. */
function heuristic(lv: SolverLevel, player: TilePos, mask: number): number {
  if (mask === 0) return distAt(lv.distExit, lv.width, player);
  let best = Infinity;
  for (let i = 0; i < lv.pickups.length; i++) {
    if (!(mask & (1 << i))) continue;
    const via =
      distAt(lv.distPick[i], lv.width, player) + distAt(lv.distExit, lv.width, lv.pickups[i]);
    if (via < best) best = via;
  }
  return best;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export interface ApplyResult {
  /** false = illegal/blocked in the real game too. */
  ok: boolean;
  state?: SolverState;
  died?: boolean;
  exited?: boolean;
  /** pickup index collected by this action, or -1. */
  collected?: number;
}

/**
 * One game-order transition (player -> pickup -> enemies -> death/exit),
 * twin of resolveTurn/waitTurn. Differential-tested in level-lab: any
 * divergence fails the build.
 */
export function applyAction(lv: SolverLevel, s: SolverState, a: SolverAction): ApplyResult {
  let dest: TilePos;
  if (a === 'wait') {
    dest = { ...s.player };
  } else {
    if (Math.abs(a.dx) + Math.abs(a.dy) !== 1) return { ok: false };
    dest = { x: s.player.x + a.dx, y: s.player.y + a.dy };
    if (dest.x < 0 || dest.y < 0 || dest.x >= lv.width || dest.y >= lv.height) return { ok: false };
    if (!lv.walk(dest)) return { ok: false };
  }
  // Stepping onto a standing enemy is death — but the game still moves the
  // player onto the tile and runs the enemy phase (death sticks). Mirror
  // that exactly so the twin stays in lockstep past fatal steps.
  const enteredEnemy = s.enemies.some((e) => e.pos.x === dest.x && e.pos.y === dest.y);
  let mask = s.mask;
  let collected = -1;
  for (let i = 0; i < lv.pickups.length; i++) {
    if (mask & (1 << i)) {
      const p = lv.pickups[i];
      if (p.x === dest.x && p.y === dest.y) {
        mask &= ~(1 << i);
        collected = i;
        break;
      }
    }
  }
  const turn = s.turn + 1;
  const enemies: SolverEnemy[] = s.enemies.map((e) => ({
    kind: e.kind,
    pos: { ...e.pos },
    path: e.path,
    pathIdx: e.pathIdx,
    tempo: e.tempo,
  }));
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const others = enemies.filter((_, j) => j !== i).map((o) => ({ ...o.pos }));
    const r = stepEnemy(
      { kind: e.kind, pos: e.pos, path: e.path, pathIdx: e.pathIdx, tempo: e.tempo },
      dest,
      turn,
      lv.walk,
      lv.width,
      lv.height,
      others,
    );
    e.pos = r.pos;
    e.pathIdx = r.pathIdx;
  }
  if (enteredEnemy || enemies.some((e) => e.pos.x === dest.x && e.pos.y === dest.y)) {
    return { ok: true, state: { player: dest, enemies, mask, turn }, died: true, exited: false, collected };
  }
  const exited = dest.x === lv.exit.x && dest.y === lv.exit.y && mask === 0;
  return { ok: true, state: { player: dest, enemies, mask, turn }, died: false, exited, collected };
}

const MOVES: SolverAction[] = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  'wait',
];

export function certifyAvoidable(level: LevelDef, opts: CertOptions = {}): CertResult {
  const t0 = Date.now();
  const maxVisited = opts.maxVisited ?? 120_000;
  const timeMs = opts.timeMs ?? 1500;
  const fail = (reason: string, visited: number): CertResult => ({
    ok: false,
    reason,
    solutionLength: 0,
    visited,
    ms: Date.now() - t0,
  });

  const lv = prepareSolver(level);
  const fullMask = (1 << lv.pickups.length) - 1;
  // turn parity matters (tempo beats), so it joins the visited key.
  let lcm = 1;
  for (const e of lv.enemies) lcm = (lcm * e.tempo) / gcd(lcm, e.tempo);
  const start: SolverState = {
    player: { ...level.spawn },
    enemies: lv.enemies.map((e) => ({ ...e, pos: { ...e.pos }, path: e.path.map((t) => ({ ...t })) })),
    mask: fullMask,
    turn: 0,
  };
  const key = (s: SolverState): string =>
    `${s.player.x},${s.player.y}|${s.enemies.map((e) => `${e.pos.x},${e.pos.y},${e.pathIdx}`).join(';')}|${s.mask}|${s.turn % lcm}`;

  // binary heap ordered by f = g + h
  const heap: Array<{ f: number; g: number; s: SolverState }> = [];
  const push = (f: number, g: number, s: SolverState): void => {
    heap.push({ f, g, s });
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].f <= heap[i].f) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = (): { f: number; g: number; s: SolverState } => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l].f < heap[m].f) m = l;
        if (r < heap.length && heap[r].f < heap[m].f) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };

  const seen = new Set<string>([key(start)]);
  push(heuristic(lv, start.player, fullMask), 0, start);
  let visited = 0;
  while (heap.length > 0) {
    if (visited >= maxVisited) return fail(`uncertified: search budget exhausted (${visited} states) — simplify the layout`, visited);
    if ((visited & 1023) === 0 && Date.now() - t0 > timeMs) {
      return fail(`uncertified: solver timed out (${visited} states) — simplify the layout`, visited);
    }
    const { g, s } = pop();
    visited += 1;
    for (const a of MOVES) {
      const r = applyAction(lv, s, a);
      if (!r.ok || !r.state) continue;
      if (r.died) continue;
      if (r.exited) {
        return { ok: true, reason: 'escape certified', solutionLength: g + 1, visited, ms: Date.now() - t0 };
      }
      const k = key(r.state);
      if (seen.has(k)) continue;
      seen.add(k);
      push(g + 1 + heuristic(lv, r.state.player, r.state.mask), g + 1, r.state);
    }
  }
  return fail('unsolvable: no escape path collects everything and reaches the exit alive', visited);
}
