/**
 * Tiny synthesized SFX (no audio assets): pickup chime + door-open swell
 * via lazy WebAudio oscillators. All browser access happens inside
 * functions so node bundles (level-lab) can import this safely.
 */

let ctx: AudioContext | null = null;
let muted = false;

try {
  muted = typeof localStorage !== 'undefined' && localStorage.getItem('manor-muted') === '1';
} catch {
  muted = false;
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMuted(): boolean {
  muted = !muted;
  try {
    localStorage.setItem('manor-muted', muted ? '1' : '0');
  } catch {
    /* private mode — play on regardless */
  }
  return muted;
}

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

interface Tone {
  freq: number;
  freqEnd?: number;
  delay?: number;
  dur?: number;
  type?: OscillatorType;
  gain?: number;
}

function tone(c: AudioContext, t: Tone): void {
  const t0 = c.currentTime + (t.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = t.type ?? 'sine';
  osc.frequency.setValueAtTime(t.freq, t0);
  if (t.freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(t.freqEnd, t0 + (t.dur ?? 0.12));
  const peak = t.gain ?? 0.12;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + (t.dur ?? 0.12));
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + (t.dur ?? 0.12) + 0.05);
}

/** Bright two-note key pickup chime. */
export function playPickup(): void {
  const c = ac();
  if (!c) return;
  tone(c, { freq: 880, dur: 0.09, type: 'sine', gain: 0.12 });
  tone(c, { freq: 1318.5, delay: 0.07, dur: 0.16, type: 'sine', gain: 0.12 });
}

/** Heavy low swell + shimmer when the exit unlocks. */
export function playDoorOpen(): void {
  const c = ac();
  if (!c) return;
  tone(c, { freq: 140, freqEnd: 320, dur: 0.4, type: 'triangle', gain: 0.16 });
  tone(c, { freq: 523.25, delay: 0.18, dur: 0.3, type: 'sine', gain: 0.08 });
  tone(c, { freq: 784, delay: 0.26, dur: 0.34, type: 'sine', gain: 0.07 });
}
