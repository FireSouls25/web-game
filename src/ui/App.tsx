import { useCallback, useEffect, useRef, useState, Suspense, lazy } from 'react';
import type Phaser from 'phaser';
import { createGame, type GameInit } from '../core/boot';
import { timeManager } from '../time/TimeManager';
import { hasSave, loadSave, clearSave } from '../save/SaveManager';
import { Hud } from './Hud';
import { MainMenu } from './MainMenu';
import { Credits } from './Credits';

// Dev-only panel: dynamic import + DEV guard => dropped from prod bundle.
const DevTools = import.meta.env.DEV
  ? lazy(() => import('../dev/DevTools').then((m) => ({ default: m.DevTools })))
  : null;

type Screen = 'menu' | 'credits' | 'game';

export function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<Screen>('menu');
  const [game, setGame] = useState<Phaser.Game | null>(null);
  const [saveExists, setSaveExists] = useState(hasSave());
  const initRef = useRef<GameInit>({});

  // Boot / destroy the Phaser game when entering / leaving the game screen.
  useEffect(() => {
    if (screen !== 'game' || !mountRef.current) return;
    const g = createGame(mountRef.current, initRef.current);
    setGame(g);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setScreen('menu');
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      g.destroy(true);
      setGame(null);
      setSaveExists(hasSave());
    };
  }, [screen]);

  const startNew = useCallback(() => {
    clearSave();
    timeManager.resetToNewGame();
    initRef.current = {};
    setScreen('game');
  }, []);

  const startContinue = useCallback(() => {
    const s = loadSave();
    if (!s) return;
    timeManager.restoreSnapshot(s.elapsedMinutes, s.loops);
    initRef.current = { roomId: s.roomId, tile: s.tile };
    setScreen('game');
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  }, []);

  if (screen === 'menu') {
    return (
      <MainMenu
        hasSave={saveExists}
        onNewGame={startNew}
        onContinue={startContinue}
        onCredits={() => setScreen('credits')}
        onFullscreen={toggleFullscreen}
      />
    );
  }

  if (screen === 'credits') {
    return <Credits onBack={() => setScreen('menu')} />;
  }

  return (
    <div className="stage-wrap">
      <div ref={mountRef} className="stage" />
      <Hud game={game} />
      {import.meta.env.DEV && DevTools && (
        <Suspense fallback={null}>
          <DevTools game={game} />
        </Suspense>
      )}
    </div>
  );
}
