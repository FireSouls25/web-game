import { useCallback, useEffect, useRef, useState, Suspense, lazy } from 'react';
import type Phaser from 'phaser';
import { createGame, type GameInit } from '../core/boot';
import { timeManager } from '../time/TimeManager';
import { hasSave, loadSave, clearSave } from '../save/SaveManager';
import { Hud } from './Hud';
import { MainMenu } from './MainMenu';
import { Credits } from './Credits';
import { Settings } from './Settings';

// Dev-only panel: dynamic import + DEV guard => dropped from prod bundle.
const DevTools = import.meta.env.DEV
  ? lazy(() => import('../dev/DevTools').then((m) => ({ default: m.DevTools })))
  : null;

type Screen = 'menu' | 'settings' | 'credits' | 'game';

/** Menu fade-out duration (must match .menu.exit transition in style.css). */
const EXIT_MS = 420;

export function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<Screen>('menu');
  const [leaving, setLeaving] = useState(false);
  const [game, setGame] = useState<Phaser.Game | null>(null);
  const [saveExists, setSaveExists] = useState(hasSave());
  const initRef = useRef<GameInit>({});
  const exitTimer = useRef<number | null>(null);

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

  useEffect(
    () => () => {
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    },
    [],
  );

  /** Fade the menu out first so screen changes dissolve instead of cutting. */
  const go = useCallback((next: Screen) => {
    if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    setLeaving(true);
    exitTimer.current = window.setTimeout(() => {
      exitTimer.current = null;
      setScreen(next);
      setLeaving(false);
    }, EXIT_MS);
  }, []);

  const startNew = useCallback(() => {
    clearSave();
    timeManager.resetToNewGame();
    initRef.current = {};
    go('game');
  }, [go]);

  const startContinue = useCallback(() => {
    const s = loadSave();
    if (!s) return;
    timeManager.restoreSnapshot(s.elapsedMinutes, s.loops);
    initRef.current = { roomId: s.roomId, tile: s.tile };
    go('game');
  }, [go]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  }, []);

  if (screen === 'menu') {
    return (
      <MainMenu
        hasSave={saveExists}
        leaving={leaving}
        onNewGame={startNew}
        onContinue={startContinue}
        onCredits={() => go('credits')}
        onSettings={() => go('settings')}
        onFullscreen={toggleFullscreen}
      />
    );
  }

  if (screen === 'settings') {
    return <Settings leaving={leaving} onBack={() => go('menu')} />;
  }

  if (screen === 'credits') {
    return <Credits leaving={leaving} onBack={() => go('menu')} />;
  }

  return (
    <div className="stage-wrap enter">
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
