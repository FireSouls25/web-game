import { useEffect, useState } from 'react';
import type Phaser from 'phaser';
import { timeManager } from '../time/TimeManager';
import { formatReading } from '../time/types';
import { COST } from '../time/types';
import { diaryStore } from '../diary/DiaryStore';
import { textEngine } from '../text/TextEngine';

function useClock(): string {
  const [, force] = useState(0);
  useEffect(() => timeManager.on(() => force((n) => n + 1)), []);
  const r = timeManager.reading();
  return `${formatReading(r)} · loop #${timeManager.loops + 1} · collapse ${timeManager.collapseFactor().toFixed(2)}`;
}

export function Hud({ game }: { game: Phaser.Game | null }) {
  const clock = useClock();
  const [diaryCount, setDiaryCount] = useState(0);
  const [line, setLine] = useState(textEngine.current());

  useEffect(() => diaryStore.on(() => setDiaryCount(diaryStore.all().length)), []);
  useEffect(() => {
    const off1 = textEngine.on(() => setLine(textEngine.current()));
    const onTick = () => setLine(textEngine.current());
    game?.events.on('manor:tick', onTick);
    return () => {
      off1();
      game?.events.off('manor:tick', onTick);
    };
  }, [game]);

  const wait = (minutes: number, reason: string) => {
    timeManager.advance(minutes, reason);
    game?.events.emit('manor:tick');
  };

  return (
    <div className="hud">
      <div className="clock" title="72h loop · move=1min · talk/eat/puzzle=20min">{clock}</div>
      <div className="row">
        <button onClick={() => wait(60, 'wait-1h')}>Wait 1h</button>
        <button onClick={() => wait(COST.TALK, 'talk-demo')}>Talk demo (−20m)</button>
        <button onClick={() => { diaryStore.add(timeManager.loops, `Note @ ${clock}`); setDiaryCount(diaryStore.all().length); }}>
          + Diary ({diaryCount})
        </button>
      </div>
      {line && (
        <div className="dialogue">
          <strong>{line.speaker}:</strong> {line.text}
          <button onClick={() => textEngine.advance()}>▸</button>
        </div>
      )}
      <div className="hint">Move: WASD / arrows · 1 tile = 1 min · portals are brass tiles</div>
    </div>
  );
}
