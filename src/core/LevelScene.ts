import Phaser from 'phaser';
import { Grid } from '../movement/Grid';
import {
  ISO_DIRS,
  TileActor,
  depthFor,
  facingForStep,
  tileFootScreen,
  tileToScreen,
  SPRITE_SCALE,
  TILE_H,
} from '../movement/IsoTiles';
import { difficultyFor } from '../level/difficulty';
import { fallbackLevel } from '../level/fallback';
import { validateLevel } from '../level/validate';
import { resolveTurn, waitTurn, type PuzzleEnemyState } from '../level/turn';
import {
  CHARACTER_SET,
  preloadSpritesForTheme,
  textureKeyFor,
} from '../level/catalog';
import { themeExitSprites, themeGroundFor, themeSubstrate, themeWallFor } from '../level/themeRender';
import type { LevelDef, LevelTheme } from '../level/types';
import { textEngine, type Dialogue } from '../text/TextEngine';
import type {
  EditorQuery,
  ManorBridge,
  QueryResult,
} from './bridge';

export const LEVEL_SCENE = 'level';

/** Dev-boot Knobs (Esc/R/N at runtime; future DevTools section). */
export interface LevelInit {
  depth?: number;
  seed?: number;
}

interface EnemyView {
  id: string;
  kind: 'chaser' | 'patrol';
  actor: TileActor;
  path?: { x: number; y: number }[];
  pathIdx: number;
  tempo: number;
  sprite: Phaser.GameObjects.Image;
}

const LEVEL_THEMES: LevelTheme[] = ['dungeon', 'library', 'farm', 'base'];
const BASE = import.meta.env.BASE_URL;

/**
 * Real-level scene: generated LevelDef rooms (fallback today, AI via
 * /api/generate-level next) rendered with real theme-pack sprites.
 * Turn rules are resolveTurn/waitTurn; death reloads the same seed,
 * the exit advances depth (theme rotates via the difficulty curve).
 * DEV boots here (`npm run dev`); prod still boots GameScene's demo rooms.
 */
export class LevelScene extends Phaser.Scene {
  private level: LevelDef | null = null;
  private grid: Grid | null = null;
  private player = new TileActor({ x: 0, y: 0 }, 4);
  private enemies: EnemyView[] = [];
  private pickups = new Map<string, { x: number; y: number }>();
  private pickupSprites = new Map<string, Phaser.GameObjects.Image>();
  private exitSprite: Phaser.GameObjects.Image | null = null;
  private playerSprite: Phaser.GameObjects.Image | null = null;
  private hud: Phaser.GameObjects.Text | null = null;
  private moving = false;
  private depth = 1;
  private seed = 1;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: Record<string, Phaser.Input.Keyboard.Key>;
  private space?: Phaser.Input.Keyboard.Key;
  private keyR?: Phaser.Input.Keyboard.Key;
  private keyN?: Phaser.Input.Keyboard.Key;
  private dialogue: Dialogue = textEngine;

  constructor() {
    super(LEVEL_SCENE);
  }

  preload(): void {
    for (const theme of LEVEL_THEMES) {
      for (const s of preloadSpritesForTheme(theme, `lvl_${theme}`)) {
        this.load.image(s.key, `${BASE}${s.file}`);
      }
    }
    for (const d of CHARACTER_SET.facings) {
      const c = (n: string) =>
        `${BASE}${CHARACTER_SET.folder}/${CHARACTER_SET.prefix}_${d}_${n}.png`;
      this.load.image(`male_${d}_idle`, c('Idle0'));
      for (let i = 0; i < CHARACTER_SET.runFrames; i++) {
        this.load.image(`male_${d}_run${i}`, c(`Run${i}`));
      }
    }
  }

  create(init: LevelInit): void {
    this.dialogue = textEngine;
    this.cursors = this.input.keyboard?.createCursorKeys();
    if (this.input.keyboard) {
      this.wasd = this.input.keyboard.addKeys('W,A,S,D,Q,E,Z,C') as Record<
        string,
        Phaser.Input.Keyboard.Key
      >;
      this.space = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.keyR = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
      this.keyN = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.N);
    }
    const bridge: ManorBridge = {
      send: () => undefined,
      ask: <Q extends EditorQuery>(query: Q): QueryResult<Q> =>
        this.ask(query) as QueryResult<Q>,
    };
    (this.game as unknown as { __manor?: ManorBridge }).__manor = bridge;
    this.scale.on('resize', () => this.frameCamera());
    this.depth = Math.max(1, Math.floor(init.depth ?? 1));
    this.seed = Math.floor(init.seed ?? Math.random() * 100000);
    this.loadLevelSession(this.depth, this.seed);
  }

  // ------------------------------------------------------------ bridge ---

  /** Legacy seam answers (DevTools polls these; level mode has no rooms). */
  private ask(query: EditorQuery): unknown {
    switch (query.kind) {
      case 'roomIds':
        return [];
      case 'currentRoom':
        return this.level?.id ?? 'level';
      case 'playerTile':
        return { ...this.player.tile };
      case 'unlocked':
        return [];
      case 'editorIsEnabled':
        return false;
      case 'editorGetRoom':
        return null;
      case 'editorExport':
        return '{"rooms":[]}';
      case 'editorImport':
        return false;
    }
  }

  // ------------------------------------------------------------ levels ---

  private loadLevelSession(depth: number, seed: number): void {
    this.depth = depth;
    this.seed = seed;
    const difficulty = difficultyFor(depth);
    let level: LevelDef | null = null;
    for (let i = 0; i < 6 && !level; i++) {
      const cand = fallbackLevel({
        seed: seed + i,
        theme: difficulty.theme,
        depth,
        width: difficulty.width,
        height: difficulty.height,
      });
      if (validateLevel(cand, depth).ok) level = cand;
    }
    if (!level) {
      this.dialogue.say('', `No valid level at depth ${depth} (seed ${seed}). Press R.`);
      return;
    }
    this.loadLevel(level);
    const d = difficultyFor(depth);
    this.dialogue.say(
      '',
      `Depth ${depth} — ${level.theme} ${d.archetype}: collect ${level.pickups.length}, avoid ${level.enemies.length}, reach the exit.`,
    );
    this.game.events.emit('manor:tick');
  }

  private textureFor(sprite: string): string {
    return textureKeyFor(sprite);
  }

  private put(x: number, y: number, key: string, layer = 0.1): Phaser.GameObjects.Image {
    const { sx, sy } = tileToScreen(x, y);
    return this.add
      .image(sx, sy + TILE_H / 2, key)
      .setScale(SPRITE_SCALE)
      .setOrigin(0.5, 1)
      .setDepth(depthFor(x, y, layer));
  }

  private loadLevel(level: LevelDef): void {
    this.level = level;
    this.children.removeAll();
    this.enemies = [];
    this.pickups = new Map();
    this.pickupSprites = new Map();
    this.exitSprite = null;
    this.moving = false;

    const grid = Grid.fromAscii(level.tiles);
    for (const pr of level.props) {
      if (!pr.blocksMovement) continue;
      for (const t of pr.footprint) grid.setWalkable(t, false);
    }
    this.grid = grid;
    // Doors read as run-continuers so jambs meet the exit flush.
    const isWall = (x: number, y: number): boolean => {
      const ch = level.tiles[y]?.[x];
      return ch === '#' || ch === 'E';
    };
    const W = level.tiles[0].length;
    const H = level.tiles.length;
    // Border walls face the interior (which side the room is on); interior
    // ruin runs use the fixed compass rule.
    const interiorOf = (x: number, y: number): 'N' | 'S' | 'E' | 'W' | undefined => {
      if (x === 0) return 'E';
      if (x === W - 1) return 'W';
      if (y === 0) return 'S';
      if (y === H - 1) return 'N';
      return undefined;
    };
    // Grounds ride far below everything so neighbor tiles can never cover
    // wall feet; per-tile variety + base substrate; farm L-corners render
    // both edge panels ('a+b' ids); exit landing doorstep outside the door.
    const substrateKey = themeSubstrate(level.theme);
    level.tiles.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        // Ground under everything, walls included (like GameScene): tall
        // wall feet sit above their tile's front vertex, so without this a
        // void band shows between wall bases and the floor.
        if (substrateKey) this.put(x, y, textureKeyFor(substrateKey), -1000);
        this.put(x, y, textureKeyFor(themeGroundFor(level.theme, x, y)), -1000);
        if (ch === '#') {
          const wid = themeWallFor(level.theme, x, y, isWall, interiorOf(x, y));
          for (const one of wid.split('+')) this.put(x, y, textureKeyFor(one), 0.15);
        }
      });
    });
    {
      // Doorstep outside the exit: the open doorway looks onto floor,
      // not void, and the destination reads before stepping through.
      const dx = level.exit.x === 0 ? -1 : level.exit.x === W - 1 ? 1 : 0;
      const dy = level.exit.y === 0 ? -1 : level.exit.y === H - 1 ? 1 : 0;
      if (dx !== 0 || dy !== 0) {
        const lx = level.exit.x + dx;
        const ly = level.exit.y + dy;
        if (substrateKey) this.put(lx, ly, textureKeyFor(substrateKey), -1000);
        this.put(lx, ly, textureKeyFor(themeGroundFor(level.theme, level.exit.x, level.exit.y)), -1000);
      }
    }
    for (const pr of level.props) {
      this.put(pr.anchor.x, pr.anchor.y, this.textureFor(pr.sprite), 0.12);
    }
    for (const p of level.pickups) {
      this.pickups.set(p.id, { x: p.x, y: p.y });
      this.pickupSprites.set(p.id, this.put(p.x, p.y, this.textureFor(p.sprite), 0.18));
    }
    this.refreshExit(true);
    this.player = new TileActor({ ...level.spawn }, 4);
    const { tx, ty } = tileFootScreen(level.spawn.x, level.spawn.y);
    this.playerSprite = this.add
      .image(tx, ty, 'male_4_idle')
      .setScale(SPRITE_SCALE)
      .setOrigin(0.5, 1)
      .setDepth(depthFor(level.spawn.x, level.spawn.y, 0.2));
    for (const e of level.enemies) {
      const { tx: ex, ty: ey } = tileFootScreen(e.x, e.y);
      const sprite = this.add
        .image(ex, ey, 'male_4_idle')
        .setScale(SPRITE_SCALE)
        .setOrigin(0.5, 1)
        .setTint(0xff8888)
        .setDepth(depthFor(e.x, e.y, 0.2));
      this.enemies.push({
        id: e.id,
        kind: e.kind,
        actor: new TileActor({ x: e.x, y: e.y }, 4),
        path: e.path?.map((t) => ({ ...t })),
        pathIdx: 0,
        tempo: e.tempo ?? 1,
        sprite,
      });
    }
    this.hud = this.add
      .text(12, 10, '', { fontSize: '15px', color: '#f4ead8' })
      .setScrollFactor(0)
      .setDepth(10000);
    this.refreshHud();
    this.frameCamera();
    this.cameras.main.fadeIn(280, 13, 10, 20);
  }

  private refreshExit(first = false): void {
    if (!this.level) return;
    const ex = themeExitSprites(this.level.theme);
    const locked = this.pickups.size > 0;
    const key = this.textureFor(locked ? ex.closed : ex.open);
    if (first || !this.exitSprite) {
      this.exitSprite = this.put(this.level.exit.x, this.level.exit.y, key, 0.18);
    } else {
      this.exitSprite.setTexture(key);
    }
    if (locked && ex.tintClosed !== undefined) this.exitSprite.setTint(ex.tintClosed);
    else this.exitSprite.clearTint();
  }

  private refreshHud(): void {
    if (!this.level || !this.hud) return;
    const total = this.level.pickups.length;
    const left = this.pickups.size;
    this.hud.setText(`depth ${this.depth} · ${this.level.theme} · keys ${total - left}/${total} · (R)etry (N)ext (Space)wait`);
  }

  private frameCamera(): void {
    if (!this.grid) return;
    const cam = this.cameras.main;
    if (cam.width === 0 || cam.height === 0) return;
    cam.setZoom(Math.max(0.8, Math.min(cam.width / 720, cam.height / 520, 2.0)));
    if (this.playerSprite) cam.startFollow(this.playerSprite, false, 0.12, 0.12);
  }

  // ---------------------------------------------------------- movement ---

  override update(): void {
    if (this.moving || !this.playerSprite || !this.level || !this.grid) return;
    if (this.keyR && Phaser.Input.Keyboard.JustDown(this.keyR)) {
      this.loadLevelSession(this.depth, this.seed);
      return;
    }
    if (this.keyN && Phaser.Input.Keyboard.JustDown(this.keyN)) {
      this.loadLevelSession(this.depth + 1, this.seed);
      return;
    }
    if (this.space && Phaser.Input.Keyboard.JustDown(this.space)) {
      void this.doWait();
      return;
    }
    const dir = this.pollDirection();
    if (dir) void this.doStep(dir.x, dir.y);
  }

  private pollDirection(): { x: number; y: number } | null {
    const c = this.cursors;
    const w = this.wasd;
    const just = (...keys: Array<Phaser.Input.Keyboard.Key | undefined>): boolean =>
      keys.some((k) => k && Phaser.Input.Keyboard.JustDown(k));
    if (just(c?.up, w?.['W'], w?.['E'])) return { x: ISO_DIRS.N.dx, y: ISO_DIRS.N.dy };
    if (just(c?.right, w?.['D'], w?.['C'])) return { x: ISO_DIRS.E.dx, y: ISO_DIRS.E.dy };
    if (just(c?.down, w?.['S'], w?.['Z'])) return { x: ISO_DIRS.S.dx, y: ISO_DIRS.S.dy };
    if (just(c?.left, w?.['A'], w?.['Q'])) return { x: ISO_DIRS.W.dx, y: ISO_DIRS.W.dy };
    return null;
  }

  /** Live turn state over the scene's actors (mutated in place by the rules). */
  private turnState(): {
    player: TileActor;
    enemies: PuzzleEnemyState[];
    isWalkable: (t: { x: number; y: number }) => boolean;
    width: number;
    height: number;
    pickups: Map<string, { x: number; y: number }>;
    exit: { x: number; y: number };
    turn: number;
  } | null {
    if (!this.level || !this.grid) return null;
    const grid = this.grid;
    return {
      player: this.player,
      enemies: this.enemies.map((e) => ({
        id: e.id,
        kind: e.kind,
        actor: e.actor,
        path: e.path,
        pathIdx: e.pathIdx,
        tempo: e.tempo,
      })),
      isWalkable: (t) => grid.isWalkable(t),
      width: grid.width,
      height: grid.height,
      pickups: this.pickups,
      exit: { ...this.level.exit },
      turn: this.turnCount,
    };
  }

  private turnCount = 0;

  private glide(
    spr: Phaser.GameObjects.Image,
    to: { x: number; y: number },
    facing: number,
    prefix: string,
  ): void {
    const { tx, ty } = tileFootScreen(to.x, to.y);
    spr.setTexture(`${prefix}_${facing}_run0`);
    this.tweens.add({ targets: spr, x: tx, y: ty, duration: 150, ease: 'Linear' });
    spr.setDepth(depthFor(to.x, to.y, 0.2));
    this.time.delayedCall(75, () => {
      if (spr.scene) spr.setTexture(`${prefix}_${facing}_run5`);
    });
  }

  private settle(spr: Phaser.GameObjects.Image, facing: number, prefix: string): void {
    if (spr.scene) spr.setTexture(`${prefix}_${facing}_idle`);
  }

  private async doStep(dx: number, dy: number): Promise<boolean> {
    const st = this.turnState();
    if (!st || this.moving || !this.playerSprite) return false;
    const outcome = resolveTurn(st, dx, dy);
    if (outcome.kind !== 'moved') return false;
    this.moving = true;
    this.syncEnemyViews(st.enemies);
    this.glide(this.playerSprite, outcome.to, outcome.facing, 'male');
    for (const m of outcome.enemyMoves) {
      const view = this.enemies.find((e) => e.id === m.id);
      if (view) {
        const f = facingForStep(m.to.x - m.from.x, m.to.y - m.from.y) ?? 4;
        this.glide(view.sprite, m.to, f, 'male');
      }
    }
    await new Promise((res) => this.time.delayedCall(155, res));
    if (this.playerSprite) this.settle(this.playerSprite, outcome.facing, 'male');
    for (const m of outcome.enemyMoves) {
      const view = this.enemies.find((e) => e.id === m.id);
      if (view) {
        const f = facingForStep(m.to.x - m.from.x, m.to.y - m.from.y) ?? 4;
        this.settle(view.sprite, f, 'male');
      }
    }
    this.afterTurn(outcome.collectedId, outcome.died, outcome.exited);
    return true;
  }

  private async doWait(): Promise<void> {
    const st = this.turnState();
    if (!st || this.moving) return;
    const outcome = waitTurn(st);
    if (outcome.kind !== 'moved') return;
    this.moving = true;
    this.syncEnemyViews(st.enemies);
    for (const m of outcome.enemyMoves) {
      const view = this.enemies.find((e) => e.id === m.id);
      if (view) {
        const f = facingForStep(m.to.x - m.from.x, m.to.y - m.from.y) ?? 4;
        this.glide(view.sprite, m.to, f, 'male');
      }
    }
    await new Promise((res) => this.time.delayedCall(155, res));
    for (const m of outcome.enemyMoves) {
      const view = this.enemies.find((e) => e.id === m.id);
      if (view) {
        const f = facingForStep(m.to.x - m.from.x, m.to.y - m.from.y) ?? 4;
        this.settle(view.sprite, f, 'male');
      }
    }
    this.afterTurn(outcome.collectedId, outcome.died, outcome.exited);
  }

  /** TurnState carries adapter copies; write enemy tile/pathIdx back to views. */
  private syncEnemyViews(adapters: PuzzleEnemyState[]): void {
    for (const a of adapters) {
      const view = this.enemies.find((e) => e.id === a.id);
      if (view) {
        view.actor.tile = { ...a.actor.tile };
        view.actor.facing = a.actor.facing;
        view.pathIdx = a.pathIdx ?? 0;
      }
    }
    this.turnCount += 1;
  }

  private afterTurn(collectedId: string | undefined, died: boolean, exited: boolean): void {
    if (collectedId) {
      this.pickupSprites.get(collectedId)?.destroy();
      this.pickupSprites.delete(collectedId);
      const total = this.level?.pickups.length ?? 0;
      this.dialogue.say('', `Key ${total - this.pickups.size}/${total} — exit ${this.pickups.size === 0 ? 'OPEN' : 'locked'}.`);
    }
    this.refreshExit();
    this.refreshHud();
    this.game.events.emit('manor:tick');
    if (died) {
      this.moving = true;
      this.dialogue.say('', 'Caught! The level resets…');
      this.time.delayedCall(1100, () => this.loadLevelSession(this.depth, this.seed));
      return;
    }
    if (exited) {
      this.moving = true;
      this.dialogue.say('', `Depth ${this.depth} clear!`);
      this.time.delayedCall(900, () => {
        this.cameras.main.fadeOut(160, 13, 10, 20);
        this.time.delayedCall(170, () => this.loadLevelSession(this.depth + 1, this.seed));
      });
      return;
    }
    this.moving = false;
  }
}
