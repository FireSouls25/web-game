export const LOOP_DAYS = 3;
export const MINUTES_PER_DAY = 24 * 60;
export const LOOP_MINUTES = LOOP_DAYS * MINUTES_PER_DAY; // 4320

/** Minutes each action costs, per idea.md */
export const COST = {
  MOVE: 1,
  TALK: 20,
  EAT: 20,
  PUZZLE: 20,
} as const;

/** Loop starts Day 1 at 08:00. Stored as absolute minutes since loop start. */
export const LOOP_START_WALL_MINUTES = 8 * 60;

export interface ClockReading {
  /** 1..3 */
  day: number;
  hour: number;
  minute: number;
  /** minutes elapsed since loop start, 0..4319 */
  elapsed: number;
  /** minutes remaining before death/reset */
  remaining: number;
}

export function elapsedToReading(elapsed: number): ClockReading {
  const clamped = Math.max(0, Math.min(LOOP_MINUTES - 1, Math.floor(elapsed)));
  const wall = LOOP_START_WALL_MINUTES + clamped;
  const day = Math.floor(wall / MINUTES_PER_DAY) + 1;
  const dayWall = wall % MINUTES_PER_DAY;
  return {
    day: Math.min(LOOP_DAYS, day),
    hour: Math.floor(dayWall / 60),
    minute: dayWall % 60,
    elapsed: clamped,
    remaining: LOOP_MINUTES - clamped,
  };
}

export function formatReading(r: ClockReading): string {
  const hh = String(r.hour).padStart(2, '0');
  const mm = String(r.minute).padStart(2, '0');
  return `Day ${r.day} — ${hh}:${mm}`;
}
