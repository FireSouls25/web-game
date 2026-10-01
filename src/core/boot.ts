import Phaser from 'phaser';
import { GameScene, GAME_SCENE } from './GameScene';

export function createGame(canvasParent: HTMLElement): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: canvasParent,
    width: 800,
    height: 600,
    backgroundColor: '#14101c',
    pixelArt: true,
    scene: [GameScene],
    input: { keyboard: true },
  });
  // Boot straight into the movement scene.
  game.scene.start(GAME_SCENE);
  return game;
}

export function getGameScene(game: Phaser.Game): GameScene | undefined {
  return game.scene.getScene(GAME_SCENE) as unknown as GameScene | undefined;
}
