import { TileActor, isIsoStep } from '../movement/IsoTiles';
import type { TilePos } from '../movement/types';
import { stepEnemy } from '../enemies/step';

/**
 * Turn resolution for the movement-puzzle game (no clock, no dialogue).
 * One player step = one turn:
 *   1. illegal (diagonal) / blocked (wall, prop, OOB) -> no turn;
 *   2. player advances; stepping onto an enemy tile = death;
 *   3. pickup on destination is collected;
 *   4. each chaser takes 1 BFS step toward the player (patrols advance
 *      along their loop); stepping onto the player = death;
 *   5. player on exit with all pickups = level complete.
 */

export interface PuzzleEnemyState {
  id: string;
  kind: 'chaser' | 'patrol';
  actor: TileActor;
  path?: TilePos[];
  pathIdx?: number;
  /** player turns per step (default 1; slow early-game chasers use 2). */
  tempo?: number;
}

export interface PuzzleTurnState {
  player: TileActor;
  enemies: PuzzleEnemyState[];
  isWalkable: (t: TilePos) => boolean;
  width: number;
  height: number;
  /** remaining pickup tiles (id -> pos). */
  pickups: Map<string, TilePos>;
  exit: TilePos;
  /** completed player turns; incremented on every moved turn. */
  turn: number;
}

export type TurnOutcome =
  | { kind: 'illegal' }
  | { kind: 'blocked'; at: TilePos }
  | {
      kind: 'moved';
      from: TilePos;
      to: TilePos;
      facing: number;
      collectedId?: string;
      enemyMoves: Array<{ id: string; from: TilePos; to: TilePos }>;
      died: boolean;
      exited: boolean;
    };

export function resolveTurn(state: PuzzleTurnState, dx: number, dy: number): TurnOutcome {
  if (!isIsoStep(dx, dy)) return { kind: 'illegal' };
  const dest: TilePos = { x: state.player.tile.x + dx, y: state.player.tile.y + dy };
  if (dest.x < 0 || dest.y < 0 || dest.x >= state.width || dest.y >= state.height) {
    return { kind: 'blocked', at: dest };
  }
  if (!state.isWalkable(dest)) return { kind: 'blocked', at: dest };

  const from = { ...state.player.tile };
  const stepped = state.player.stepTo(dx, dy);
  if (stepped === null) return { kind: 'illegal' };
  const to = { ...stepped };

  // pickup?
  let collectedId: string | undefined;
  for (const [id, pos] of state.pickups) {
    if (pos.x === to.x && pos.y === to.y) {
      collectedId = id;
      state.pickups.delete(id);
      break;
    }
  }

  // player stepped onto an enemy?
  let died = state.enemies.some((e) => e.actor.tile.x === to.x && e.actor.tile.y === to.y);

  // Enemy phase (shared deterministic core in enemies/step.ts — the
  // avoidability certifier replays this exact order). Death already decided
  // above still sticks; movers run for replay consistency.
  state.turn += 1;
  const phase = runEnemyPhase(state, to);
  if (phase.killed) died = true;

  const exited =
    !died && to.x === state.exit.x && to.y === state.exit.y && state.pickups.size === 0;

  return {
    kind: 'moved',
    from,
    to,
    facing: state.player.facing,
    ...(collectedId ? { collectedId } : {}),
    enemyMoves: phase.moves,
    died,
    exited,
  };
}

/**
 * Hold position for one turn. Enemies still move on their tempo beats,
 * so waiting is a real (usually bad) decision, not a free pass — and it
 * gives the solver a complete action set, which is what makes the
 * avoidability certificate sound. Waiting on the exit with all pickups
 * collected still wins, if nothing steps onto you first.
 */
export function waitTurn(state: PuzzleTurnState): TurnOutcome {
  const at = { ...state.player.tile };
  state.turn += 1;
  const phase = runEnemyPhase(state, at);
  const died = phase.killed;
  const exited =
    !died && at.x === state.exit.x && at.y === state.exit.y && state.pickups.size === 0;
  return {
    kind: 'moved',
    from: at,
    to: at,
    facing: state.player.facing,
    enemyMoves: phase.moves,
    died,
    exited,
  };
}

/**
 * Shared enemy phase: every enemy steps (in array order, seeing
 * already-moved enemies as obstacles) via the deterministic core in
 * enemies/step.ts, then reports whether anything stands on the player.
 */
function runEnemyPhase(
  state: PuzzleTurnState,
  playerPos: TilePos,
): { moves: Array<{ id: string; from: TilePos; to: TilePos }>; killed: boolean } {
  const moves: Array<{ id: string; from: TilePos; to: TilePos }> = [];
  for (const e of state.enemies) {
    const efrom = { ...e.actor.tile };
    const others = state.enemies
      .filter((o) => o !== e)
      .map((o) => ({ ...o.actor.tile }));
    const r = stepEnemy(
      { kind: e.kind, pos: e.actor.tile, path: e.path, pathIdx: e.pathIdx ?? 0, tempo: e.tempo ?? 1 },
      playerPos,
      state.turn,
      state.isWalkable,
      state.width,
      state.height,
      others,
    );
    if (r.moved && e.kind !== 'patrol') {
      // chaser glide keeps facing fresh for the renderer (always 1 tile)
      e.actor.stepTo(r.pos.x - efrom.x, r.pos.y - efrom.y);
    } else {
      e.actor.tile = { ...r.pos };
    }
    e.pathIdx = r.pathIdx;
    if (r.moved) moves.push({ id: e.id, from: efrom, to: { ...r.pos } });
  }
  const killed = state.enemies.some(
    (e) => e.actor.tile.x === playerPos.x && e.actor.tile.y === playerPos.y,
  );
  return { moves, killed };
}
