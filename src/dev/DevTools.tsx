/**
 * DEV-PROFILE ONLY — arbitrary time selector + room jumper + level editor.
 *
 * Rendered only when `import.meta.env.DEV` is true (see App.tsx, which
 * dynamic-imports this module). Never import this from prod code.
 */
import { useEffect, useState } from 'react';
import { timeManager } from '../time/TimeManager';
import { LOOP_MINUTES, LOOP_START_WALL_MINUTES, MINUTES_PER_DAY } from '../time/types';
import type { LockKey } from '../rooms/types';
import { LevelEditor } from './LevelEditor';

interface ManorBridge {
  jumpToRoom: (id: string) => void;
  roomIds: () => string[];
  currentRoom: () => string;
  unlock: (key: LockKey) => void;
  lockAll: () => void;
  unlocked: () => LockKey[];
}

const KEYS: LockKey[] = ['servant', 'master', 'kitchen'];

export function DevTools({ game }: { game: Phaser.Game | null }) {
  const [elapsed, setElapsed] = useState(timeManager.elapsedMinutes);
  const [rooms, setRooms] = useState<string[]>([]);
  const [unlocked, setUnlocked] = useState<LockKey[]>([]);

  const bridge = () => (game as unknown as { __manor?: ManorBridge } | null)?.__manor;
  const refreshKeys = () => setUnlocked(bridge()?.unlocked() ?? []);

  useEffect(() => timeManager.on(() => setElapsed(timeManager.elapsedMinutes)), []);
  useEffect(() => {
    const id = window.setInterval(() => {
      const b = bridge();
      if (b) {
        setRooms(b.roomIds());
        setUnlocked(b.unlocked());
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [game]);

  const day = Math.floor((LOOP_START_WALL_MINUTES + elapsed) / MINUTES_PER_DAY) + 1;
  const setDay = (d: number) => {
    const wall = (d - 1) * MINUTES_PER_DAY + 12 * 60; // noon of that day
    timeManager.debugSetElapsed(wall - LOOP_START_WALL_MINUTES);
    game?.events.emit('manor:tick');
  };

  return (
    <div className="devtools">
      <strong>[DEV] time + rooms</strong>
      <div className="row">
        <span>elapsed {elapsed}/{LOOP_MINUTES} (~day {day})</span>
      </div>
      <input
        type="range"
        min={0}
        max={LOOP_MINUTES - 1}
        value={elapsed}
        onChange={(e) => {
          timeManager.debugSetElapsed(Number(e.target.value));
          game?.events.emit('manor:tick');
        }}
      />
      <div className="row">
        {[1, 2, 3].map((d) => (
          <button key={d} onClick={() => setDay(d)}>Day {d} noon</button>
        ))}
        <button onClick={() => { timeManager.debugSetElapsed(LOOP_MINUTES - 61); game?.events.emit('manor:tick'); }}>
          Final hour
        </button>
      </div>
      <div className="row">
        <select
          onChange={(e) => {
            bridge()?.jumpToRoom(e.target.value);
          }}
          defaultValue=""
        >
          <option value="" disabled>jump to room…</option>
          {rooms.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      <div className="row">
        <span>keys:</span>
        {KEYS.map((k) => (
          <button
            key={k}
            disabled={unlocked.includes(k)}
            onClick={() => { bridge()?.unlock(k); refreshKeys(); }}
          >
            {unlocked.includes(k) ? `✓ ${k}` : k}
          </button>
        ))}
        <button onClick={() => { bridge()?.lockAll(); refreshKeys(); }}>relock</button>
      </div>
      <LevelEditor game={game} />
    </div>
  );
}
