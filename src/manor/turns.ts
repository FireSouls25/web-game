import { TileActor, isIsoStep } from '../movement/IsoTiles';
import type { TilePos } from '../movement/types';
import type { LockKey } from '../rooms/types';
import { COST, LOOP_START_WALL_MINUTES, MINUTES_PER_DAY } from '../time/types';

/**
 * Pure turn-step rules for the manor (no Phaser import — unit-testable).
 *
 * Owns step RESOLUTION; the scene owns step RENDERING (tweens, textures,
 * fades, dialogue text, saves). Resolution order mirrors the old
 * `GameScene.tryStep` exactly:
 *   1. vertex-touching (diagonal) steps are illegal, not tile moves;
 *   2. unwalkable destination blocks (wall, prop, out of bounds);
 *   3. a locked door on the destination bumps with its lock key —
 *      no move and NO time cost;
 *   4. otherwise the actor advances, the step costs COST.MOVE minutes,
 *      and a portal on the destination resolves (room jump lookup).
 *
 * The noon great-clock chime is time-trigger data, not a side effect:
 * `noonsCrossed` computes which chime days a [from, to) clock advance
 * crosses. The scene renders chimes through its clock subscription, so
 * external time moves (dev jumps) chime identically — resolution never
 * touches the clock.
 */

/** Portal data needed for step resolution (room-graph subset, no Phaser). */
export interface StepPortal {
  toRoom: string;
  to: TilePos;
  lockedBy?: LockKey;
}

/** Everything `resolveStep` needs from the scene. Callbacks keep this
 * module free of Grid / RoomRegistry / Clock imports. */
export interface TurnState {
  /** Player tile + facing. Advanced in place, but ONLY on a moved outcome. */
  actor: TileActor;
  /** Walkability of the destination (grid + prop + override flags). */
  isWalkable: (tile: TilePos) => boolean;
  /** Portal sitting on a tile, if any (effective room, overrides applied). */
  portalAt: (tile: TilePos) => StepPortal | undefined;
  /** Whether a lock key is currently held. */
  isUnlocked: (key: LockKey) => boolean;
}

export type StepOutcome =
  /** Not an edge-to-edge tile step (|dx|+|dy| !== 1). No move, no cost. */
  | { kind: 'illegal' }
  /** Destination is not walkable. No move, no cost. */
  | { kind: 'blocked'; at: TilePos }
  /**
   * Locked door on the destination. No move and NO time cost — the scene
   * renders the bump by translating `lockKey` (i18n stays scene-side).
   */
  | { kind: 'locked'; lockKey: LockKey; at: TilePos }
  /** Step resolves: actor has been advanced; scene renders + charges. */
  | {
      kind: 'moved';
      from: TilePos;
      to: TilePos;
      facing: number;
      /** Minutes the scene must advance the clock (COST.MOVE). */
      timeCost: number;
      /** Portal on the destination, if the scene must jump rooms. */
      portal?: StepPortal;
    };

/** Clock minutes (since loop start) at which the great clock chimes on `day` (1..3). */
export function noonElapsedForDay(day: number): number {
  return 12 * 60 - LOOP_START_WALL_MINUTES + (day - 1) * MINUTES_PER_DAY;
}

/**
 * Which noon-chime days a clock advance from `from` to `to` crosses,
 * excluding days already in `chimed`. Byte-identical to the old
 * `GameScene.checkNoonChime` loop (days 1..3, from < noon <= to edge).
 */
export function noonsCrossed(
  from: number,
  to: number,
  chimed: ReadonlySet<number>,
): number[] {
  const days: number[] = [];
  for (let day = 1; day <= 3; day++) {
    const noonElapsed = noonElapsedForDay(day);
    if (!chimed.has(day) && from < noonElapsed && to >= noonElapsed) {
      days.push(day);
    }
  }
  return days;
}

/**
 * Resolve one tile step (dx, dy) against `state`.
 * Advances `state.actor` in place on success only; every other outcome
 * leaves the actor (and the clock) untouched.
 */
export function resolveStep(state: TurnState, dx: number, dy: number): StepOutcome {
  // Tile invariant: only edge-to-edge (N/E/S/W) steps are legal moves.
  if (!isIsoStep(dx, dy)) return { kind: 'illegal' };
  const dest: TilePos = { x: state.actor.tile.x + dx, y: state.actor.tile.y + dy };
  if (!state.isWalkable(dest)) return { kind: 'blocked', at: dest };
  // Locked doors bump with a message: no move, no time cost.
  const portal = state.portalAt(dest);
  if (portal?.lockedBy && !state.isUnlocked(portal.lockedBy)) {
    return { kind: 'locked', lockKey: portal.lockedBy, at: dest };
  }
  const from: TilePos = { ...state.actor.tile };
  // TileActor applies the step + facing in one place (facingForStep is
  // non-null here because isIsoStep passed); the outcome reads it back.
  const stepped = state.actor.stepTo(dx, dy);
  if (stepped === null) return { kind: 'illegal' };
  const to: TilePos = { ...stepped };
  const timeCost = COST.MOVE;
  return {
    kind: 'moved',
    from,
    to,
    facing: state.actor.facing,
    timeCost,
    ...(portal ? { portal } : {}),
  };
}
