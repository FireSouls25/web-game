import Phaser from 'phaser';
import { Grid } from '../movement/Grid';
import { COST, LOOP_START_WALL_MINUTES, MINUTES_PER_DAY } from '../time/types';
import { timeManager } from '../time/TimeManager';
import { RoomRegistry, type LockKey } from '../rooms/types';
import type { RoomDef } from '../rooms/types';
import { createProdRegistry } from '../rooms/manor';
import { generatePlaceholderTextures, TILE } from '../core/placeholder';
import { textEngine } from '../text/TextEngine';

export const GAME_SCENE = 'game';

const LOCK_MESSAGES: Record<LockKey, string> = {
  servant: "Locked. The servants' room — Clara's key would open it.",
  master: 'Locked. It needs the master key.',
  kitchen: "Locked. Thomas keeps the kitchen key.",
};

/**
 * Movement + rooms scene.
 * - Renders current RoomDef tilemap from placeholder textures.
 * - WASD/arrows step one tile; each successful step costs 1 min.
 * - Stepping on a portal tile jumps rooms (impossible geometry supported).
 * - In DEV profile, test rooms are dynamically imported and registered;
 *   prod builds never include them (dynamic import + dead-code elimination).
 */
export class GameScene extends Phaser.Scene {
  private roomRegistry: RoomRegistry = createProdRegistry();
  private roomId = 'entrance_hall';
  private grid!: Grid;
  private playerTile = { x: 0, y: 0 };
  private playerSprite?: Phaser.GameObjects.Image;
  private moving = false;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: Record<string, Phaser.Input.Keyboard.Key>;
  private hudText?: Phaser.GameObjects.Text;
  private unlockedKeys = new Set<LockKey>();
  private chimedNoons = new Set<number>();

  constructor() {
    super(GAME_SCENE);
  }

  create(): void {
    generatePlaceholderTextures(this);
    this.cursors = this.input.keyboard?.createCursorKeys();
    if (this.input.keyboard) {
      this.wasd = this.input.keyboard.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    }

    // Expose hooks for React dev tools BEFORE first render.
    (this.game as unknown as { __manor?: object }).__manor = {
      jumpToRoom: (id: string) => this.loadRoom(id),
      currentRoom: () => this.roomId,
      roomIds: () => this.roomRegistry.ids(),
      playerTile: () => ({ ...this.playerTile }),
      unlock: (key: LockKey) => this.unlockedKeys.add(key),
      lockAll: () => this.unlockedKeys.clear(),
      unlocked: () => [...this.unlockedKeys],
    };

    // Keep the in-canvas clock fresh when time moves outside the scene
    // (e.g. React wait buttons) + fire the great-clock noon chime.
    timeManager.on((e) => {
      if (e.type === 'advanced') this.checkNoonChime(e.from, e.to);
      if (e.type === 'loopReset') this.chimedNoons.clear();
      const room = this.roomRegistry.get(this.roomId);
      if (room && this.grid) this.updateHud(room);
    });

    void this.initRegistryThenLoad();
  }

  /** Noon each day (12:00 wall clock): the great clock in the main hall chimes. */
  private checkNoonChime(from: number, to: number): void {
    for (let day = 1; day <= 3; day++) {
      const noonElapsed = 12 * 60 - LOOP_START_WALL_MINUTES + (day - 1) * MINUTES_PER_DAY;
      if (!this.chimedNoons.has(day) && from < noonElapsed && to >= noonElapsed) {
        this.chimedNoons.add(day);
        textEngine.say('Great clock', `It chimes twelve — day ${day}. The sound comes from everywhere at once.`);
      }
    }
  }

  /** Prod rooms first (instant), then DEV test rooms only under DEV. */
  private async initRegistryThenLoad(): Promise<void> {
    if (import.meta.env.DEV) {
      // Dynamic import => excluded from prod bundle by dead-code elimination.
      const { DEV_TEST_ROOMS, DEV_START_ROOM } = await import('../dev/testLevels');
      for (const r of DEV_TEST_ROOMS) this.roomRegistry.register(r);
      // Refresh exposed room list (React DevTools reads it lazily anyway).
      this.roomId = DEV_START_ROOM;
    }
    this.loadRoom(this.roomId);
  }

  loadRoom(roomId: string, spawn?: { x: number; y: number }): void {
    const room = this.roomRegistry.get(roomId);
    if (!room) return;
    this.roomId = roomId;
    this.children.removeAll();
    this.hudText = undefined;
    this.grid = Grid.fromAscii(room.tiles);
    this.renderRoom(room);
    const s = spawn ?? room.spawn;
    this.playerTile = { ...s };
    this.playerSprite = this.add.image(s.x * TILE + TILE / 2, s.y * TILE + TILE / 2, 'player');
    this.playerSprite.setDepth(10);
    this.updateHud(room);
  }

  private renderRoom(room: RoomDef): void {
    const portalSet = new Set(room.portals.map((p) => `${p.from.x},${p.from.y}`));
    const baseTexture = (ch: string): string => {
      switch (ch) {
        case '#': return 'tile_wall';
        case '>': return 'tile_stairs';
        case 'T': return 'tile_table';
        case 'B': return 'tile_shelf';
        case 'W': return 'tile_water';
        case 'C': return 'tile_clock';
        case 'D': return 'tile_desk';
        case 'd': return 'tile_bed';
        case 'R': return 'tile_railing';
        default: return 'tile_floor';
      }
    };
    room.tiles.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const cx = x * TILE + TILE / 2;
        const cy = y * TILE + TILE / 2;
        // Stairs keep their look; other portal tiles glow brass.
        if (portalSet.has(`${x},${y}`) && ch !== '>') {
          this.add.image(cx, cy, 'tile_portal');
        } else {
          this.add.image(cx, cy, baseTexture(ch));
        }
      });
    });
    this.cameras.main.centerOn(
      (room.tiles[0].length * TILE) / 2,
      (room.tiles.length * TILE) / 2,
    );
  }

  private updateHud(room: RoomDef): void {
    const r = timeManager.reading();
    const info =
      `${room.name}  |  Day ${r.day} ${String(r.hour).padStart(2, '0')}:${String(r.minute).padStart(2, '0')}` +
      `  |  loops: ${timeManager.loops}  |  collapse: ${timeManager.collapseFactor().toFixed(2)}`;
    if (this.hudText) {
      this.hudText.setText(info);
    } else {
      this.hudText = this.add.text(8, 8, info, {
        fontSize: '14px',
        color: '#ffe9a3',
        backgroundColor: '#14101caa',
        padding: { x: 6, y: 4 },
      }).setScrollFactor(0).setDepth(100);
    }
  }

  override update(): void {
    if (this.moving || !this.playerSprite) return;
    const dir = this.pollDirection();
    if (dir) void this.tryStep(dir.x, dir.y);
  }

  private pollDirection(): { x: number; y: number } | null {
    const c = this.cursors;
    const w = this.wasd;
    // one step per keypress edge to keep 1 tile = 1 action
    if ((c && Phaser.Input.Keyboard.JustDown(c.left)) || (w && Phaser.Input.Keyboard.JustDown(w['A']))) return { x: -1, y: 0 };
    if ((c && Phaser.Input.Keyboard.JustDown(c.right)) || (w && Phaser.Input.Keyboard.JustDown(w['D']))) return { x: 1, y: 0 };
    if ((c && Phaser.Input.Keyboard.JustDown(c.up)) || (w && Phaser.Input.Keyboard.JustDown(w['W']))) return { x: 0, y: -1 };
    if ((c && Phaser.Input.Keyboard.JustDown(c.down)) || (w && Phaser.Input.Keyboard.JustDown(w['S']))) return { x: 0, y: 1 };
    return null;
  }

  /** Attempt a single-tile step. Public so click-to-move / tests can reuse it. */
  async tryStep(dx: number, dy: number): Promise<boolean> {
    if (this.moving || !this.playerSprite) return false;
    const next = { x: this.playerTile.x + dx, y: this.playerTile.y + dy };
    if (!this.grid.isWalkable(next)) return false;
    // Locked doors bump with a message: no move, no time cost.
    const ahead = this.roomRegistry.portalAt(this.roomId, next.x, next.y);
    if (ahead?.lockedBy && !this.unlockedKeys.has(ahead.lockedBy)) {
      textEngine.say('', LOCK_MESSAGES[ahead.lockedBy]);
      return false;
    }
    this.moving = true;
    this.playerTile = next;
    const tx = next.x * TILE + TILE / 2;
    const ty = next.y * TILE + TILE / 2;
    this.tweens.add({ targets: this.playerSprite, x: tx, y: ty, duration: 110, ease: 'Linear' });
    await new Promise((res) => this.time.delayedCall(115, res));
    this.moving = false;

    timeManager.advance(COST.MOVE, 'move');

    // Portal check AFTER paying the move cost.
    const portal = this.roomRegistry.portalAt(this.roomId, next.x, next.y);
    if (portal) {
      this.loadRoom(portal.toRoom, portal.to);
    } else {
      const room = this.roomRegistry.get(this.roomId);
      if (room) this.updateHud(room);
    }
    // notify React HUD
    this.game.events.emit('manor:tick');
    return true;
  }
}
