import { useEffect, useRef, useState, Suspense, lazy } from 'react';
import type Phaser from 'phaser';
import { createGame } from '../core/boot';
import { Hud } from './Hud';

// Dev-only panel: dynamic import + DEV guard => dropped from prod bundle.
const DevTools = import.meta.env.DEV
  ? lazy(() => import('../dev/DevTools').then((m) => ({ default: m.DevTools })))
  : null;

export function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<Phaser.Game | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const g = createGame(mountRef.current);
    setGame(g);
    return () => {
      g.destroy(true);
      setGame(null);
    };
  }, []);

  return (
    <div className="app">
      <header>
        <h1>Manor Loop <span className="proto">movement prototype</span></h1>
      </header>
      <main>
        <div ref={mountRef} className="canvas" />
        <Hud game={game} />
        {import.meta.env.DEV && DevTools && (
          <Suspense fallback={<div>loading dev tools…</div>}>
            <DevTools game={game} />
          </Suspense>
        )}
      </main>
    </div>
  );
}
