import { useEffect, useState } from 'react';
import type Phaser from 'phaser';
import { textEngine } from '../text/TextEngine';

/**
 * Minimal player HUD: dialogue box only. No clock, no counters, no hints —
 * the loop's time pressure should be felt, not read (for now).
 */
export function Hud({ game }: { game: Phaser.Game | null }) {
  const [line, setLine] = useState(textEngine.current());

  useEffect(() => {
    const off = textEngine.on(() => setLine(textEngine.current()));
    const onTick = () => setLine(textEngine.current());
    game?.events.on('manor:tick', onTick);
    return () => {
      off();
      game?.events.off('manor:tick', onTick);
    };
  }, [game]);

  if (!line) return null;
  return (
    <div className="dialogue-float">
      <div className="dialogue">
        {line.speaker && <strong>{line.speaker}: </strong>}
        {line.text}
        <button onClick={() => textEngine.advance()}>▸</button>
      </div>
    </div>
  );
}
