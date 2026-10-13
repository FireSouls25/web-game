import type { TilePos } from '../movement/types';
import { bfsNextStep } from './pathfind';

/**
 * Shared deterministic enemy step — the single source of truth for how one
 * enemy moves on a player turn. Used by BOTH the live game (turn.ts) and
 * the avoidability certifier (level/solve.ts), so a certified level
 * behaves exactly as solved. Do not duplicate this logic elsewhere.
 */

export interface EnemyStepInput {
  kind: 'chaser' | 'patrol';
  pos: TilePos;
  path?: TilePos[];
  pathIdx: number;
  /** player turns per step (>= 1; callers default missing tempo to 1). */
  tempo: number;
}

export interface EnemyStepResult {
  pos: TilePos;
  pathIdx: number;
  moved: boolean;
}

/**
 * One enemy's move for completed player-turn `turn` (the same 1-based
 * counter as PuzzleTurnState.turn). Moves only on tempo beats; a tempo-2
 * enemy steps on turns 2, 4, ... — the player always moves first.
 * `others` = current positions of the other enemies, already-moved ones
 * included: callers MUST iterate enemies in array order (like resolveTurn).
 */
export function stepEnemy(
  e: EnemyStepInput,
  playerPos: TilePos,
  turn: number,
  isWalkable: (t: TilePos) => boolean,
  width: number,
  height: number,
  others: TilePos[],
): EnemyStepResult {
  const tempo = e.tempo >= 1 ? Math.floor(e.tempo) : 1;
  if (turn % tempo !== 0) return { pos: { ...e.pos }, pathIdx: e.pathIdx, moved: false };
  if (e.kind === 'patrol' && e.path && e.path.length >= 2) {
    const idx = e.pathIdx + 1;
    const target = e.path[idx % e.path.length];
    if (isWalkable(target)) {
      return { pos: { ...target }, pathIdx: idx % e.path.length, moved: true };
    }
    return { pos: { ...e.pos }, pathIdx: e.pathIdx, moved: false };
  }
  const step = bfsNextStep(
    isWalkable,
    width,
    height,
    e.pos,
    playerPos,
    (t) => others.some((o) => o.x === t.x && o.y === t.y),
  );
  if (!step) return { pos: { ...e.pos }, pathIdx: e.pathIdx, moved: false };
  return { pos: step, pathIdx: e.pathIdx, moved: step.x !== e.pos.x || step.y !== e.pos.y };
}
