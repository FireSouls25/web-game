import Phaser from 'phaser';
import { GameScene, GAME_SCENE } from './GameScene';
import { LevelScene, LEVEL_SCENE } from './LevelScene';
import type { Clock } from '../time/TimeManager';
import type { Dialogue } from '../text/TextEngine';

export interface GameInit {
  /** room to spawn in (Continue reads this from the save file) */
  roomId?: string;
  /** tile to spawn on */
  tile?: { x: number; y: number };
  /** loop clock (defaults to the shared singleton when omitted) */
  clock?: Clock;
  /** dialogue queue (defaults to the shared singleton when omitted) */
  dialogue?: Dialogue;
}

export function createGame(canvasParent: HTMLElement, initData?: GameInit): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: canvasParent,
    backgroundColor: '#14101c',
    pixelArt: false,
    roundPixels: false,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: window.innerWidth,
      height: window.innerHeight,
    },
    scene: [GameScene, LevelScene],
    input: { keyboard: true },
  });
  // DEV boots generated real-pack levels; prod boots the demo manor rooms.
  game.scene.start(import.meta.env.DEV ? LEVEL_SCENE : GAME_SCENE, initData ?? {});
  return game;
}
