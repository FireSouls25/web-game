import Phaser from 'phaser';
import { GameScene, GAME_SCENE } from './GameScene';
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
    scene: [GameScene],
    input: { keyboard: true },
  });
  // Boot straight into the movement scene, optionally from a save file.
  game.scene.start(GAME_SCENE, initData ?? {});
  return game;
}
