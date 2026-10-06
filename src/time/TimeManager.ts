import { LOOP_MINUTES, elapsedToReading, type ClockReading } from './types';

export type TimeEvent =
  | { type: 'advanced'; from: number; to: number; reason: string }
  | { type: 'loopReset'; loopsCompleted: number }
  | { type: 'collapseChanged'; factor: number };

export type TimeListener = (e: TimeEvent) => void;

/**
 * Framework-agnostic loop clock.
 *
 * - 72h loop (4320 min). Every tile step costs 1 min.
 * - Talk/eat/puzzle cost 20 min. Wait/sleep cost caller-chosen minutes.
 * - At the end of day 3 the loop resets (player "dies"), diary persists,
 *   NPC/world state is expected to reset via `loopReset` subscribers.
 * - `collapseFactor` (0..1) ramps up over the final `collapseHours`
 *   so rooms/scenes can degrade tiles/access late in day 3.
 */
export class TimeManager {
  private elapsed = 0;
  private loopsCompleted = 0;
  private listeners = new Set<TimeListener>();
  readonly collapseHours: number;

  constructor(opts?: { startElapsed?: number; collapseHours?: number }) {
    this.elapsed = opts?.startElapsed ?? 0;
    this.collapseHours = opts?.collapseHours ?? 6;
  }

  get elapsedMinutes(): number {
    return this.elapsed;
  }

  get loops(): number {
    return this.loopsCompleted;
  }

  reading(): ClockReading {
    return elapsedToReading(this.elapsed);
  }

  /** 0 = stable manor, 1 = full collapse. Ramps linearly over final hours. */
  collapseFactor(): number {
    const collapseMinutes = this.collapseHours * 60;
    const intoCollapse = this.elapsed - (LOOP_MINUTES - collapseMinutes);
    if (intoCollapse <= 0) return 0;
    return Math.min(1, intoCollapse / collapseMinutes);
  }

  on(listener: TimeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(e: TimeEvent): void {
    for (const l of this.listeners) l(e);
  }

  /** Advance by `minutes` for `reason`. Returns true if the loop reset. */
  advance(minutes: number, reason: string): boolean {
    if (minutes <= 0) return false;
    const from = this.elapsed;
    let to = from + minutes;
    if (to >= LOOP_MINUTES) {
      this.emit({ type: 'advanced', from, to: LOOP_MINUTES - 1, reason });
      this.resetLoop();
      return true;
    }
    this.elapsed = to;
    const before = this.collapseFactorAt(from);
    const after = this.collapseFactor();
    this.emit({ type: 'advanced', from, to, reason });
    if (after !== before) this.emit({ type: 'collapseChanged', factor: after });
    return false;
  }

  private collapseFactorAt(elapsed: number): number {
    const collapseMinutes = this.collapseHours * 60;
    const into = elapsed - (LOOP_MINUTES - collapseMinutes);
    if (into <= 0) return 0;
    return Math.min(1, into / collapseMinutes);
  }

  /** Dev-only: jump to an arbitrary moment. Prod UI never calls this. */
  debugSetElapsed(minutes: number): void {
    const from = this.elapsed;
    this.elapsed = Math.max(0, Math.min(LOOP_MINUTES - 1, Math.floor(minutes)));
    this.emit({ type: 'advanced', from, to: this.elapsed, reason: 'dev-jump' });
    this.emit({ type: 'collapseChanged', factor: this.collapseFactor() });
  }

  /** Production: start over (main menu "New game"). */
  resetToNewGame(): void {
    this.elapsed = 0;
    this.loopsCompleted = 0;
    this.emit({ type: 'collapseChanged', factor: 0 });
  }

  /** Production: restore a save file (main menu "Continue"). */
  restoreSnapshot(elapsedMinutes: number, loops: number): void {
    this.elapsed = Math.max(0, Math.min(LOOP_MINUTES - 1, Math.floor(elapsedMinutes)));
    this.loopsCompleted = Math.max(0, Math.floor(loops));
    this.emit({ type: 'collapseChanged', factor: this.collapseFactor() });
  }

  private resetLoop(): void {
    this.elapsed = 0;
    this.loopsCompleted += 1;
    this.emit({ type: 'loopReset', loopsCompleted: this.loopsCompleted });
    this.emit({ type: 'collapseChanged', factor: 0 });
  }
}

/** Shared singleton used by Phaser scenes + React HUD. */
export const timeManager = new TimeManager();
