import Phaser from 'phaser';

/**
 * Procedural placeholder sprites — no binary assets needed.
 * Called once from BootScene. Palette: muted victorian (dark wood/brass).
 */
export const TILE = 32;

export function generatePlaceholderTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  // floor: dark wood + plank line
  g.clear();
  g.fillStyle(0x2a2233, 1).fillRect(0, 0, TILE, TILE);
  g.fillStyle(0x332a40, 1).fillRect(1, 1, TILE - 2, TILE - 2);
  g.lineStyle(1, 0x1c1626, 0.8).lineBetween(0, TILE - 1, TILE, TILE - 1);
  g.generateTexture('tile_floor', TILE, TILE);

  // wall: panelling
  g.clear();
  g.fillStyle(0x14101c, 1).fillRect(0, 0, TILE, TILE);
  g.fillStyle(0x4a3b5c, 1).fillRect(1, 1, TILE - 2, TILE - 2);
  g.fillStyle(0x5c4a72, 1).fillRect(4, 4, TILE - 8, TILE - 8);
  g.lineStyle(1, 0x241c33, 1).strokeRect(4, 4, TILE - 8, TILE - 8);
  g.generateTexture('tile_wall', TILE, TILE);

  // portal: brass glow
  g.clear();
  g.fillStyle(0x2a2233, 1).fillRect(0, 0, TILE, TILE);
  g.fillStyle(0xc9a227, 1).fillRect(3, 3, TILE - 6, TILE - 6);
  g.fillStyle(0xffe9a3, 1).fillRect(7, 7, TILE - 14, TILE - 14);
  g.generateTexture('tile_portal', TILE, TILE);

  // stairs: steps descending
  g.clear();
  g.fillStyle(0x2a2233, 1).fillRect(0, 0, TILE, TILE);
  g.fillStyle(0x4a3b5c, 1).fillRect(2, 2, TILE - 4, TILE - 4);
  g.lineStyle(2, 0xc9a227, 0.9);
  for (let i = 1; i <= 3; i++) g.lineBetween(4, i * 8, TILE - 4, i * 8);
  g.generateTexture('tile_stairs', TILE, TILE);

  // table: wood top
  g.clear();
  g.fillStyle(0x2a2233, 1).fillRect(0, 0, TILE, TILE);
  g.fillStyle(0x6b4a2f, 1).fillRect(3, 5, TILE - 6, TILE - 10);
  g.lineStyle(1, 0x3d2a1a, 1).strokeRect(3, 5, TILE - 6, TILE - 10);
  g.generateTexture('tile_table', TILE, TILE);

  // shelf: dark case + book spines
  g.clear();
  g.fillStyle(0x241a12, 1).fillRect(0, 0, TILE, TILE);
  g.fillStyle(0x3d2a1a, 1).fillRect(2, 2, TILE - 4, TILE - 4);
  g.fillStyle(0x7a2e2e, 1).fillRect(5, 8, 4, 16);
  g.fillStyle(0x2e4a7a, 1).fillRect(11, 8, 4, 16);
  g.fillStyle(0x3d6b3d, 1).fillRect(17, 8, 4, 16);
  g.fillStyle(0x6b5a2e, 1).fillRect(23, 8, 4, 16);
  g.generateTexture('tile_shelf', TILE, TILE);

  // water: bath pool
  g.clear();
  g.fillStyle(0x2a2233, 1).fillRect(0, 0, TILE, TILE);
  g.fillStyle(0x1d3a5f, 1).fillRect(2, 2, TILE - 4, TILE - 4);
  g.fillStyle(0x3d6a9a, 1).fillRect(5, 5, TILE - 10, TILE - 10);
  g.lineStyle(1, 0x9ac4e0, 0.7).lineBetween(6, 12, TILE - 6, 12);
  g.lineStyle(1, 0x9ac4e0, 0.7).lineBetween(6, 20, TILE - 6, 20);
  g.generateTexture('tile_water', TILE, TILE);

  // clock: brass face (the great clock, single-tile stand-in)
  g.clear();
  g.fillStyle(0x2a2233, 1).fillRect(0, 0, TILE, TILE);
  g.fillStyle(0xc9a227, 1).fillCircle(TILE / 2, TILE / 2, 13);
  g.fillStyle(0xe8dcc8, 1).fillCircle(TILE / 2, TILE / 2, 10);
  g.lineStyle(2, 0x14101c, 1);
  g.lineBetween(TILE / 2, TILE / 2, TILE / 2, 8);
  g.lineBetween(TILE / 2, TILE / 2, TILE / 2 + 6, TILE / 2 + 2);
  g.generateTexture('tile_clock', TILE, TILE);

  // desk: writing desk / piano
  g.clear();
  g.fillStyle(0x2a2233, 1).fillRect(0, 0, TILE, TILE);
  g.fillStyle(0x14101c, 1).fillRect(2, 8, TILE - 4, TILE - 16);
  g.fillStyle(0xe8dcc8, 1).fillRect(4, 12, TILE - 8, 4);
  g.fillStyle(0x14101c, 1).fillRect(4, 18, TILE - 8, 8);
  g.generateTexture('tile_desk', TILE, TILE);

  // bed: frame + blanket
  g.clear();
  g.fillStyle(0x2a2233, 1).fillRect(0, 0, TILE, TILE);
  g.fillStyle(0x3d2a1a, 1).fillRect(3, 2, TILE - 6, TILE - 4);
  g.fillStyle(0x5f1d2e, 1).fillRect(5, 6, TILE - 10, TILE - 14);
  g.fillStyle(0xe8dcc8, 1).fillRect(5, 6, TILE - 10, 6);
  g.generateTexture('tile_bed', TILE, TILE);

  // railing: gallery edge over the void
  g.clear();
  g.fillStyle(0x2a2233, 1).fillRect(0, 0, TILE, TILE);
  g.fillStyle(0xc9a227, 1).fillRect(0, 4, TILE, 3);
  for (let i = 0; i < 4; i++) g.fillStyle(0xc9a227, 1).fillRect(4 + i * 8, 7, 2, TILE - 7);
  g.generateTexture('tile_railing', TILE, TILE);

  // player: coat + head placeholder (top-down circle w/ direction tick)
  g.clear();
  g.fillStyle(0x1d3a5f, 1).fillCircle(TILE / 2, TILE / 2, 12);
  g.fillStyle(0xe8dcc8, 1).fillCircle(TILE / 2, TILE / 2, 6);
  g.fillStyle(0xc9a227, 1).fillRect(TILE / 2 - 1, 2, 2, 6);
  g.generateTexture('player', TILE, TILE);

  // npc placeholder
  g.clear();
  g.fillStyle(0x5f1d2e, 1).fillCircle(TILE / 2, TILE / 2, 12);
  g.fillStyle(0xe8dcc8, 1).fillCircle(TILE / 2, TILE / 2, 6);
  g.generateTexture('npc', TILE, TILE);

  g.destroy();
}
