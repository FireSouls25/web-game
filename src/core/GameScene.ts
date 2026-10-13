import Phaser from 'phaser';
import { Grid } from '../movement/Grid';
import {
  ISO_DIRS,
  TileActor,
  tileFootScreen,
  tileFromFoot as tileFromFootPos,
  tileToScreen,
  screenToTile,
  depthFor,
  SPRITE_SCALE,
  TILE_W as ISO_TILE_W,
  TILE_H as ISO_TILE_H,
} from '../movement/IsoTiles';
import { timeManager, type Clock } from '../time/TimeManager';
import { RoomRegistry, type LockKey } from '../rooms/types';
import type { RoomDef, RoomProp } from '../rooms/types';
import { createProdRegistry } from '../rooms/manor';
import { textEngine, type Dialogue } from '../text/TextEngine';
import { tr } from '../text/i18n';
import { writeSave } from '../save/SaveManager';
import type { GameInit } from './boot';
import type {
  EditorBrush,
  EditorCommand,
  EditorQuery,
  EditorTool,
  ManorBridge,
  PortalPatch,
  QueryResult,
  RoomSnapshot,
} from './bridge';
import { SPRITE_BASES, parsePropSprite } from '../rooms/spriteCatalog';
import {
  CHARACTER_SET,
  levelTextureKey,
  parseEntitySprite,
  preloadSpritesForTheme,
} from '../level/catalog';
import type { LevelTheme } from '../level/types';
import { noonsCrossed, resolveStep } from '../manor/turns';

const LEVEL_THEMES: LevelTheme[] = ['dungeon', 'library', 'farm', 'base'];

export const GAME_SCENE = 'game';

/**
 * True-isometric projection (matches the Kenney Isometric set, the pack's
 * Preview.png look the manor art targets).
 *
 * Source tiles are 256 wide with a 256x128 diamond footprint at the image
 * bottom; scaled to TILE_W x (TILE_H) diamonds. Every sprite image is
 * anchored by its bottom-center (the diamond's front vertex) so tall
 * objects (walls, crates, the player) rise out of their own tile and
 * y-sort against the tiles behind them.
 */
export const TILE_W = ISO_TILE_W;
export const TILE_H = ISO_TILE_H;
const ISO = 'Isometric';
const BASE = import.meta.env.BASE_URL;

const LOCK_KEYS: Record<LockKey, string> = {
  servant: 'lock.servant',
  master: 'lock.master',
  kitchen: 'lock.kitchen',
};

/**
 * Iso tile compass (Kenney pack, see Information.png + IsoTiles):
 * N = screen up-right (0,-1), E = screen down-right (+1,0),
 * S = screen down-left (0,+1), W = screen up-left (-1,0).
 * Each step moves to the tile sharing a diamond SIDE — never to a
 * vertex-touching diagonal. Human facings for tile moves: N=0 E=2 S=4 W=6.
 */
const ALL_DIRS = [0, 2, 4, 6]; // texture preload only (4-directional tile facings)
/**
 * Stair autotile (mirrored by scripts/iso-preview.mjs stairVariantFor).
 * One '>' tile is a full 4-step flight. Wide flights (stairs side by side
 * along x) render open interiors so they read as ONE continuous flight
 * instead of repeated bottoms: ends keep side walls (stairs:S), interiors
 * drop them (stairsOpen:S). Tiles stacked in the ascend direction are
 * continuations, not new flights: upper tiles render low treads (steps)
 * rising into the bottom flight. Single-column runs face E, else S.
 * Sprite ids use the "base" / "base:DIR" prop convention.
 */
function stairVariantFor(
  x: number,
  y: number,
  isStair: (x: number, y: number) => boolean,
): string {
  const e = isStair(x + 1, y);
  const w = isStair(x - 1, y);
  const s = isStair(x, y + 1);
  const wide = e || w;
  if (wide) {
    if (s) return 'steps:S'; // upper row of a deep flight: treads continue up
    if (e && w) return 'stairsOpen:S'; // wide interior: no doubled side walls
    return 'stairs:S'; // flight ends + narrow flights: full cheeks
  }
  if (isStair(x, y - 1) || s) {
    if (s) return 'steps:E'; // upper continuation of a y-column flight
    return 'stairs:E'; // bottom of a y-column flight
  }
  return 'stairs:S'; // isolated stair: unchanged default
}

/** One tile of a grouped multi-tile doorway opening. */
interface DoorSlot {
  /** frame axis for the whole opening ('S' spans x, 'E' spans y) */
  axis: 'S' | 'E';
  /** position along the run (0 = one end) */
  pos: number;
  /** run length */
  count: number;
  /** this tile carries the door leaf (arch); frame piece otherwise */
  leaf: boolean;
  /** a portal sits on this run (leaf shows open/closed, not bare frame) */
  hasPortal: boolean;
  /** the run is currently shut (leaf shows closed) */
  shut: boolean;
  /**
   * Non-linear groups (2x2 blocks, L-shapes) can't take linear frame
   * pieces (their lintels overhang into neighbours). Only the primary
   * tile renders; the rest stay plain pass-through floor.
   */
  hidden: boolean;
  /** true when the group is a 2D block (primary renders solo arch) */
  block: boolean;
}

/**
 * Group contiguous E/P opening tiles (4-connectivity) into single doorways.
 * A 2x2 'EE' portal block is ONE opening: without grouping every tile
 * renders a full arch and the doubled legs read as disconnected. Grouped
 * runs render one connected frame (ends + optional center posts) with a
 * single leaf arch on the middle tile; single tiles keep the legacy look.
 * Mirrored by scripts/iso-preview.mjs groupDoorTiles.
 */
function groupDoorTiles(
  room: RoomDef,
  hasPortal: (x: number, y: number) => boolean,
  isShut: (x: number, y: number) => boolean,
  doorAxisAt: (x: number, y: number) => 'S' | 'E',
): Map<string, DoorSlot> {
  const isDoor = (x: number, y: number): boolean => {
    const ch = room.tiles[y]?.[x];
    return ch === 'E' || ch === 'P';
  };
  const seen = new Set<string>();
  const out = new Map<string, DoorSlot>();
  const H = room.tiles.length;
  for (let y = 0; y < H; y++) {
    const row = room.tiles[y] ?? '';
    for (let x = 0; x < row.length; x++) {
      if (!isDoor(x, y) || seen.has(`${x},${y}`)) continue;
      // flood-fill one 4-connected opening
      const members: Array<{ x: number; y: number }> = [];
      const stack = [{ x, y }];
      seen.add(`${x},${y}`);
      while (stack.length) {
        const cur = stack.pop()!;
        members.push(cur);
        for (const [nx, ny] of [[cur.x + 1, cur.y], [cur.x - 1, cur.y], [cur.x, cur.y + 1], [cur.x, cur.y - 1]]) {
          const k = `${nx},${ny}`;
          if (!seen.has(k) && isDoor(nx, ny)) {
            seen.add(k);
            stack.push({ x: nx, y: ny });
          }
        }
      }
      // primary = topmost, then leftmost; its axis frames the whole run
      members.sort((a, b) => a.y - b.y || a.x - b.x);
      const axis = doorAxisAt(members[0].x, members[0].y);
      // Linear runs frame end-to-end; 2D blocks (2x2, L) render one arch.
      const linear =
        axis === 'S'
          ? members.every((m) => m.y === members[0].y)
          : members.every((m) => m.x === members[0].x);
      const ordered = [...members].sort((a, b) =>
        axis === 'S' ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x,
      );
      const count = ordered.length;
      const leafIdx = count === 1 ? 0 : Math.floor((count - 1) / 2);
      const hasPortalRun = ordered.some((m) => hasPortal(m.x, m.y));
      const shutRun = ordered.some((m) => hasPortal(m.x, m.y) && isShut(m.x, m.y));
      ordered.forEach((m, pos) => {
        const primary = pos === 0;
        const block = !linear;
        out.set(`${m.x},${m.y}`, {
          axis,
          pos,
          count,
          leaf: block ? primary && hasPortalRun : pos === leafIdx && hasPortalRun,
          hasPortal: hasPortalRun,
          shut: shutRun,
          hidden: block && !primary,
          block,
        });
      });
    }
  }
  return out;
}

/** Sprite id for one tile of a grouped doorway (leaf arch or frame piece). */
function doorSpriteFor(slot: DoorSlot): string | null {
  if (slot.hidden) return null; // plain floor: the arch marks the opening
  const a = slot.axis;
  if (slot.block) {
    // 2D block: primary renders a solo arch, never frame pieces.
    if (slot.leaf) return `${slot.shut ? 'doorClosed' : 'doorOpen'}:${a}`;
    return `doorway:${a}`;
  }
  if (slot.leaf) return `${slot.shut ? 'doorClosed' : 'doorOpen'}:${a}`;
  if (slot.count === 1) return `doorway:${a}`;
  if (slot.pos === 0) return `doorwayLeft:${a}`;
  if (slot.pos === slot.count - 1) return `doorwayRight:${a}`;
  return `doorwayCenter:${a}`;
}

/**
 * Wall autotile (mirrored by scripts/iso-preview.mjs wallVariantFor).
 * Back edges (room interior to the SE: south of x-runs, east of y-runs)
 * render full height — the pack's "top walls". Front edges render as low
 * fence rails so the interior stays visible. Corners use wallCorner
 * (tall when an adjacent run is back-type, wallCornerHalf otherwise).
 * Sprite ids use the "base" / "base:DIR" prop convention.
 */
function wallVariantFor(
  x: number,
  y: number,
  isWall: (x: number, y: number) => boolean,
  isOpen: (x: number, y: number) => boolean,
): string {
  const n = isWall(x, y - 1);
  const s = isWall(x, y + 1);
  const e = isWall(x + 1, y);
  const w = isWall(x - 1, y);
  const count = (n ? 1 : 0) + (s ? 1 : 0) + (e ? 1 : 0) + (w ? 1 : 0);
  const inS = isOpen(x, y + 1);
  const inN = isOpen(x, y - 1);
  const inE = isOpen(x + 1, y);
  const inW = isOpen(x - 1, y);
  const xRun = (): string => {
    if (inS && !inN) {
      if (!e && w) return 'wall:S'; // finished east end (door jamb / run end)
      if (!w && e) return 'wall:N'; // finished west end
      return 'wall:S';
    }
    if (inN && !inS) return 'fence:S'; // front run: low rail, keeps view open
    return 'wall:S';
  };
  const yRun = (): string => {
    if (inE && !inW) return 'wall:W'; // back run, full height
    if (inW && !inE) return 'fence:E'; // front run: low rail
    return 'wall:W';
  };
  if (count >= 3) return e && w ? xRun() : yRun();
  const alongX = e || w;
  const alongY = n || s;
  if (alongX && !alongY) return xRun();
  if (alongY && !alongX) return yRun();
  const seOpen = isOpen(x + 1, y + 1);
  const swOpen = isOpen(x - 1, y + 1);
  const neOpen = isOpen(x + 1, y - 1);
  if (e && s) return seOpen ? 'wallCorner:S' : 'wallCornerHalf:S';
  if (s && w) return swOpen || seOpen ? 'wallCorner:N' : 'wallCornerHalf:N';
  if (w && n) return swOpen || neOpen ? 'wallCorner:W' : 'wallCornerHalf:W';
  if (n && e) return neOpen || seOpen ? 'wallCorner:E' : 'wallCornerHalf:E';
  if (alongX) return xRun();
  if (alongY) return yRun();
  return 'wall:S';
}

/** Per-room dev edits. Applied on top of the base RoomDef. */
interface RoomOverride {
  tiles: string[];
  spawn: { x: number; y: number };
  portals: RoomDef['portals'];
  props: RoomProp[];
  /** explicit walkability flags ("x,y" -> walkable), win over ascii + props */
  walk: Map<string, boolean>;
}

/**
 * Movement + rooms scene, rendered with the Kenney prototype pack
 * (Isometric set, true diamond projection).
 * - Tile system (see movement/IsoTiles): one ground sprite == one tile.
 *   Entities always stand ON a tile (feet on the diamond center); steps go
 *   to the tile sharing a diamond side (N/E/S/W), never to a vertex.
 * - Arrows/WASD step one tile (Up=N up-right, Right=E down-right,
 *   Down=S down-left, Left=W up-left); each successful step costs 1 min.
 * - Stepping on a portal tile jumps rooms (impossible geometry supported).
 * - Player UI is minimal: no clock/HUD in canvas (dialogue goes to React).
 * - Autosaves to localStorage after every move / room change.
 * - In DEV profile, test rooms are dynamically imported and registered;
 *   prod builds never include them (dynamic import + dead-code elimination).
 */
export class GameScene extends Phaser.Scene {
  private roomRegistry: RoomRegistry = createProdRegistry();
  private roomId = 'entrance_hall';
  private grid!: Grid;
  private playerTile = { x: 0, y: 0 };
  private facing = 4; // S (down-left), a valid iso tile facing
  private clock: Clock = timeManager;
  private dialogue: Dialogue = textEngine;
  private playerSprite?: Phaser.GameObjects.Image;
  private moving = false;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: Record<string, Phaser.Input.Keyboard.Key>;
  private unlockedKeys = new Set<LockKey>();
  private chimedNoons = new Set<number>();
  private propSprites = new Map<string, Phaser.GameObjects.Image>();
  private hitboxLayer?: Phaser.GameObjects.Graphics;
  private markerLayer?: Phaser.GameObjects.Graphics;
  private hoverLayer?: Phaser.GameObjects.Graphics;
  private lastHoverKey = '';
  private showHitboxes = false;

  // editor state (only driven from src/dev/*, inert in prod)
  private editorMode = false;
  private editorTool: EditorTool = 'paint';
  private editorBrush: EditorBrush = { kind: 'tile', ch: '#' };
  private overrides = new Map<string, RoomOverride>();
  private dragPropId: string | null = null;
  private dragPortalIdx = -1;
  private painting = false;

  constructor() {
    super(GAME_SCENE);
  }

  preload(): void {
    const iso = (base: string, dir: string) => `${BASE}prototype_sprites/${ISO}/${base}_${dir}.png`;
    // Real theme packs (the level pipeline's only art): curated catalog
    // sprites for all four themes, keys lvl_<theme>_<base>_<dir>.
    for (const theme of LEVEL_THEMES) {
      for (const s of preloadSpritesForTheme(theme, `lvl_${theme}`)) {
        this.load.image(s.key, `${BASE}${s.file}`);
      }
    }
    // Real character actors: the dungeon pack's Male set is the only
    // character art across the four packs, so every theme uses it.
    for (const d of CHARACTER_SET.facings) {
      const c = (n: string) => `${BASE}${CHARACTER_SET.folder}/${CHARACTER_SET.prefix}_${d}_${n}.png`;
      this.load.image(`male_${d}_idle`, c('Idle0'));
      for (let i = 0; i < CHARACTER_SET.runFrames; i++) this.load.image(`male_${d}_run${i}`, c(`Run${i}`));
    }
    // core tile actors (S facing; portal doors need both states)
    this.load.image('spr_floor', iso('floor', 'S'));
    this.load.image('spr_wall', iso('wall', 'S'));
    this.load.image('spr_doorway', iso('doorway', 'S'));
    this.load.image('spr_door_open', iso('doorOpen', 'S'));
    this.load.image('spr_door_closed', iso('doorClosed', 'S'));
    this.load.image('spr_stairs', iso('stairs', 'S'));
    this.load.image('spr_crate', iso('crate', 'S'));
    this.load.image('spr_block', iso('block', 'S'));
    this.load.image('spr_slab', iso('slab', 'S'));
    this.load.image('spr_fence', iso('fence', 'S'));
    // every prop base in all 4 facings so the editor can swap freely
    for (const base of SPRITE_BASES) {
      for (const d of ['N', 'E', 'S', 'W']) {
        this.load.image(`spr_prop_${base}_${d}`, iso(base, d));
      }
    }
    for (const d of ALL_DIRS) {
      const h = (n: string) => `${BASE}prototype_sprites/Characters/Human/Human_${d}_${n}.png`;
      this.load.image(`human_${d}_idle`, h('Idle0'));
      for (let i = 0; i < 10; i++) this.load.image(`human_${d}_run${i}`, h(`Run${i}`));
    }
  }

  create(data: GameInit): void {
    // Injected seams (tests) or shared singletons (prod boot passes nothing).
    this.clock = data.clock ?? timeManager;
    this.dialogue = data.dialogue ?? textEngine;
    this.cursors = this.input.keyboard?.createCursorKeys();
    if (this.input.keyboard) {
      this.wasd = this.input.keyboard.addKeys('W,A,S,D,Q,E,Z,C') as Record<string, Phaser.Input.Keyboard.Key>;
    }

    // Narrowed React<->Phaser seam (see src/core/bridge.ts): React code
    // may only send() commands and ask() queries; the wider surface below
    // stays private to this scene.
    const bridge: ManorBridge = {
      send: (command: EditorCommand): void => this.send(command),
      ask: <Q extends EditorQuery>(query: Q): QueryResult<Q> => this.ask(query),
    };
    (this.game as unknown as { __manor?: ManorBridge }).__manor = bridge;

    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => this.onEditorPointerDown(ptr));
    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => this.onEditorPointerMove(ptr));
    this.input.on('pointerup', () => this.onEditorPointerUp());
    this.input.on('wheel', (_ptr: unknown, _objs: unknown, _dx: number, dy: number) => {
      if (!this.editorMode) return;
      const cam = this.cameras.main;
      const next = cam.zoom * (dy > 0 ? 0.9 : 1.1);
      cam.setZoom(Math.max(0.25, Math.min(3, next)));
    });
    this.scale.on('resize', () => this.frameCamera());

    // Keep world state fresh when time moves outside the scene
    // (e.g. dev wait buttons) + fire the great-clock noon chime.
    this.clock.on((e) => {
      if (e.type === 'advanced') this.checkNoonChime(e.from, e.to);
      if (e.type === 'loopReset') this.chimedNoons.clear();
    });

    void this.initRegistryThenLoad(data);
  }

  /** Noon each day (12:00 wall clock): the great clock in the main hall chimes.
   * Trigger days come from the pure turn rules; the scene only renders them. */
  private checkNoonChime(from: number, to: number): void {
    for (const day of noonsCrossed(from, to, this.chimedNoons)) {
      this.chimedNoons.add(day);
      this.dialogue.say(tr('chime.speaker'), tr('chime.text', { day }));
    }
  }

  /** Prod rooms first (instant), then DEV test rooms only under DEV. */
  private async initRegistryThenLoad(init: GameInit): Promise<void> {
    if (import.meta.env.DEV) {
      // Dynamic import => excluded from prod bundle by dead-code elimination.
      const { DEV_TEST_ROOMS, DEV_START_ROOM } = await import('../dev/testLevels');
      for (const r of DEV_TEST_ROOMS) this.roomRegistry.register(r);
      if (!init.roomId) this.roomId = DEV_START_ROOM;
    }
    if (init.roomId && this.roomRegistry.get(init.roomId)) {
      this.loadRoom(init.roomId, init.tile);
    } else {
      this.loadRoom(this.roomId);
    }
  }

  // ---------------------------------------------------------------- rooms ---

  private baseRoom(id: string): RoomDef | undefined {
    return this.roomRegistry.get(id);
  }

  /** Mutable per-room override, created (deep-copied) on first edit. */
  private overrideFor(roomId: string): RoomOverride {
    let ov = this.overrides.get(roomId);
    if (!ov) {
      const base = this.baseRoom(roomId);
      if (!base) throw new Error(`unknown room ${roomId}`);
      ov = {
        tiles: [...base.tiles],
        spawn: { ...base.spawn },
        portals: base.portals.map((pt) => ({ ...pt, from: { ...pt.from }, to: { ...pt.to } })),
        props: (base.props ?? []).map((pr) => ({ ...pr })),
        walk: new Map(),
      };
      this.overrides.set(roomId, ov);
    }
    return ov;
  }

  /** Effective room = base + overrides (used for render + save + export). */
  private effectiveRoom(roomId: string): RoomDef {
    const base = this.baseRoom(roomId);
    if (!base) throw new Error(`unknown room ${roomId}`);
    const ov = this.overrides.get(roomId);
    if (!ov) return base;
    return {
      ...base,
      tiles: [...ov.tiles],
      spawn: { ...ov.spawn },
      portals: ov.portals.map((pt) => ({ ...pt, from: { ...pt.from }, to: { ...pt.to } })),
      props: ov.props.map((pr) => ({ ...pr })),
    };
  }

  private rebuildGrid(room: RoomDef): void {
    this.grid = Grid.fromAscii(room.tiles);
    for (const pr of room.props ?? []) {
      if (!pr.walkable) this.grid.setWalkable({ x: pr.x, y: pr.y }, false);
    }
    const ov = this.overrides.get(room.id);
    if (ov) {
      for (const [key, v] of ov.walk) {
        const [x, y] = key.split(',').map(Number);
        this.grid.setWalkable({ x, y }, v);
      }
    }
  }

  loadRoom(roomId: string, spawn?: { x: number; y: number }): void {
    if (!this.baseRoom(roomId)) return;
    const room = this.effectiveRoom(roomId);
    this.roomId = roomId;
    this.children.removeAll();
    this.propSprites.clear();
    this.hitboxLayer = undefined;
    this.markerLayer = undefined;
    this.hoverLayer = undefined;
    this.lastHoverKey = '';
    this.rebuildGrid(room);
    this.renderRoom(room);
    const s = spawn ?? room.spawn;
    this.playerTile = { ...s };
    this.facing = 4;
    const { tx, ty } = this.playerScreen(s.x, s.y);
    this.playerSprite = this.add
      .image(tx, ty, `human_${this.facing}_idle`)
      .setScale(SPRITE_SCALE)
      .setOrigin(0.5, 1)
      .setDepth(depthFor(s.x, s.y, 0.2));
    this.drawHitboxes();
    this.drawPlayerRing();
    this.frameCamera();
    // Every room entry fades in from darkness (menu -> game, portals).
    this.cameras.main.fadeIn(280, 13, 10, 20);
    if (!this.editorMode) this.autosave();
  }

  /**
   * Screen anchor for a tile entity (player / NPC): the image bottom
   * (origin 0.5, 1) sits on the diamond's front vertex so the feet land on
   * the diamond CENTER. Spawn and every step use this — one tile, one anchor.
   * Human sprites carry ~56px of transparent padding below the feet
   * (feet at y≈456/512 → 14px at scale), hence front-vertex == feet-on-center.
   */
  private playerScreen(x: number, y: number): { tx: number; ty: number } {
    return tileFootScreen(x, y);
  }

  /** Resolve a prop sprite id ("crate" | "wall:N" | "dungeon:chestClosed:S") to a loaded texture key. */
  private propTexture(sprite: string): string {
    // Real-pack ids first (the level pipeline's only art).
    const parsed = parseEntitySprite(sprite);
    if (parsed.pack !== 'prototype') {
      const key = levelTextureKey(parsed.pack, parsed.base, parsed.dir);
      if (this.textures.exists(key)) return key;
    }
    const { base, dir } = parsePropSprite(sprite);
    const key = `spr_prop_${base}_${dir}`;
    if (this.textures.exists(key)) return key;
    // legacy short names from the Angle era (crate/block/slab/fence)
    const legacy: Record<string, string> = {
      crate: `spr_prop_crate_S`,
      block: `spr_prop_block_S`,
      slab: `spr_prop_slab_S`,
      fence: `spr_prop_fence_S`,
    };
    if (legacy[sprite] && this.textures.exists(legacy[sprite])) return legacy[sprite];
    return 'spr_crate';
  }

  private put(
    x: number,
    y: number,
    key: string,
    opts?: { tint?: number; layer?: number },
  ): Phaser.GameObjects.Image {
    const { sx, sy } = tileToScreen(x, y);
    const img = this.add
      .image(sx, sy + TILE_H / 2, key)
      .setScale(SPRITE_SCALE)
      .setOrigin(0.5, 1)
      .setDepth(depthFor(x, y, opts?.layer ?? 0.1));
    if (opts?.tint !== undefined) img.setTint(opts.tint);
    return img;
  }

  /** Wall-like chars for autotile connectivity (G = window wall). */
  private isWallCh(room: RoomDef, x: number, y: number): boolean {
    const ch = room.tiles[y]?.[x];
    return ch === '#' || ch === 'G';
  }

  private isDoorCh(room: RoomDef, x: number, y: number): boolean {
    const ch = room.tiles[y]?.[x];
    return ch === 'E' || ch === 'P';
  }

  private isOpenCh(room: RoomDef, x: number, y: number): boolean {
    if (y < 0 || y >= room.tiles.length) return false;
    const row = room.tiles[y];
    if (!row || x < 0 || x >= row.length) return false;
    const ch = row[x];
    return ch !== '#' && ch !== 'G';
  }

  /** Door arch axis from surrounding walls: 'S' spans x-runs, 'E' spans y-runs. */
  private doorAxis(room: RoomDef, x: number, y: number): 'S' | 'E' {
    const ax = this.isWallCh(room, x - 1, y) || this.isWallCh(room, x + 1, y);
    const ay = this.isWallCh(room, x, y - 1) || this.isWallCh(room, x, y + 1);
    if (ax && !ay) return 'S';
    if (ay && !ax) return 'E';
    return 'S';
  }

  private renderRoom(room: RoomDef): void {
    const portalAt = new Map<string, (typeof room.portals)[number]>();
    for (const pt of room.portals) portalAt.set(`${pt.from.x},${pt.from.y}`, pt);
    // Connected multi-tile openings: one frame + one leaf per doorway group.
    const doorSlots = groupDoorTiles(
      room,
      (x, y) => portalAt.has(`${x},${y}`),
      (x, y) => {
        const p = portalAt.get(`${x},${y}`);
        return !!p?.lockedBy && !this.unlockedKeys.has(p.lockedBy);
      },
      (x, y) => this.doorAxis(room, x, y),
    );
    const isStair = (x: number, y: number): boolean => room.tiles[y]?.[x] === '>';
    const isWall = (x: number, y: number) =>
      this.isWallCh(room, x, y) || this.isDoorCh(room, x, y);
    const isOpen = (x: number, y: number) => this.isOpenCh(room, x, y);
    const inXRun = (x: number, y: number) =>
      this.isWallCh(room, x - 1, y) || this.isWallCh(room, x + 1, y);
    room.tiles.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        // ground under everything (walls sit on the floorboards)
        if (ch === 'W') {
          this.put(x, y, 'spr_floor', { layer: -2, tint: 0x4a7a9a });
        } else {
          this.put(x, y, 'spr_floor', { layer: -2 });
        }
        const portal = portalAt.get(`${x},${y}`);
        switch (ch) {
          case '#':
            this.put(x, y, this.propTexture(wallVariantFor(x, y, isWall, isOpen)), {
              layer: 0.15,
            });
            break;
          case 'G':
            // window wall: window block in back x-runs, else the wall rule
            if (inXRun(x, y) && isOpen(x, y + 1)) {
              this.put(x, y, this.propTexture('window:S'), { layer: 0.15 });
            } else {
              this.put(x, y, this.propTexture(wallVariantFor(x, y, isWall, isOpen)), {
                layer: 0.15,
              });
            }
            break;
          case '>':
            // stair runs share treads: wide interiors open up, upper rows
            // continue the flight instead of restarting it (stairVariantFor)
            this.put(x, y, this.propTexture(stairVariantFor(x, y, isStair)));
            break;
          case 'T':
            this.put(x, y, 'spr_crate');
            break;
          case 'B':
            this.put(x, y, 'spr_block');
            break;
          case 'D':
            this.put(x, y, 'spr_slab');
            break;
          case 'd':
            this.put(x, y, 'spr_slab', { tint: 0x9a4a5a });
            break;
          case 'C':
            this.put(x, y, 'spr_crate', { tint: 0xc9a227 });
            break;
          case 'R':
            this.put(x, y, this.propTexture(`fence:${inXRun(x, y) ? 'S' : 'E'}`));
            break;
          case 'E':
          case 'P': {
            // grouped openings render one connected frame + a single leaf
            const slot = doorSlots.get(`${x},${y}`);
            const sprite = slot ? doorSpriteFor(slot) : `doorway:${this.doorAxis(room, x, y)}`;
            if (sprite) this.put(x, y, this.propTexture(sprite));
            break;
          }
          default:
            break;
        }
        // portals on plain tiles (e.g. stair landings) read as doors too
        if (portal && ch !== '>' && ch !== 'E' && ch !== 'P') {
          const shut = portal.lockedBy && !this.unlockedKeys.has(portal.lockedBy);
          const axis = this.doorAxis(room, x, y);
          this.put(x, y, this.propTexture(`${shut ? 'doorClosed' : 'doorOpen'}:${axis}`));
        }
      });
    });
    for (const pr of room.props ?? []) {
      const img = this.put(pr.x, pr.y, this.propTexture(pr.sprite));
      if (!pr.walkable) img.setTint(0xffffff);
      this.propSprites.set(pr.id, img);
    }
  }

  private roomBounds(): { cx: number; cy: number; w: number; h: number } {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const room = this.baseRoom(this.roomId);
    const rows = room?.tiles.length ?? this.grid.height;
    const cols = room?.tiles[0]?.length ?? this.grid.width;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const { sx, sy } = tileToScreen(x, y);
        minX = Math.min(minX, sx - TILE_W / 2);
        maxX = Math.max(maxX, sx + TILE_W / 2);
        minY = Math.min(minY, sy - TILE_H / 2 - 130);
        maxY = Math.max(maxY, sy + TILE_H / 2);
      }
    }
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
  }

  /** Frame the camera: follow the player in play, fit+free-pan in the editor. */
  private frameCamera(): void {
    if (!this.grid) return;
    const cam = this.cameras.main;
    if (cam.width === 0 || cam.height === 0) return;
    if (this.editorMode) {
      this.frameRoomForEditor();
      return;
    }
    const z = Math.max(
      0.55,
      Math.min(cam.width / 880, cam.height / 620, 1.35),
    );
    cam.setZoom(z);
    if (this.playerSprite) cam.startFollow(this.playerSprite, false, 0.12, 0.12);
  }

  /**
   * Editor framing. Default (entry / room switch): zoom 1.0 centered on
   * the player tile — big enough to see and paint. The ⤢ frame button
   * passes fit=true to see the whole room at once.
   */
  private frameRoomForEditor(fit = false): void {
    if (!this.grid) return;
    const cam = this.cameras.main;
    if (cam.width === 0 || cam.height === 0) return;
    cam.stopFollow();
    if (!fit) {
      const { sx, sy } = tileToScreen(this.playerTile.x, this.playerTile.y);
      cam.setZoom(1);
      cam.centerOn(sx, sy);
      return;
    }
    const b = this.roomBounds();
    const z = Math.min(cam.width / Math.max(1, b.w), cam.height / Math.max(1, b.h));
    cam.setZoom(Math.max(0.3, Math.min(z, 1.25)));
    cam.centerOn(b.cx, b.cy);
  }


  private autosave(): void {
    writeSave({
      roomId: this.roomId,
      tile: { ...this.playerTile },
      elapsedMinutes: this.clock.elapsedMinutes,
      loops: this.clock.loops,
    });
  }

  // -------------------------------------------------------------- movement ---

  override update(): void {
    if (this.moving || !this.playerSprite || this.editorMode) return;
    const dir = this.pollDirection();
    if (dir) void this.tryStep(dir.x, dir.y);
  }

  private pollDirection(): { x: number; y: number } | null {
    const c = this.cursors;
    const w = this.wasd;
    // One step per keypress edge keeps 1 tile = 1 action. Iso mapping:
    // each arrow/WASD key steps to the tile sharing that diamond SIDE:
    //   Up/W = N (screen up-right), Right/D = E (screen down-right),
    //   Down/S = S (screen down-left), Left/A = W (screen up-left).
    // Q/E/Z/C are aliases (Q=W, E=N, Z=S, C=E) so diagonal-screen keys
    // also walk tiles. Vertex-touching diagonals are not tile moves.
    const just = (...keys: Array<Phaser.Input.Keyboard.Key | undefined>): boolean =>
      keys.some((k) => k && Phaser.Input.Keyboard.JustDown(k));
    if (just(c?.up, w?.['W'], w?.['E'])) return { x: ISO_DIRS.N.dx, y: ISO_DIRS.N.dy }; // N (0,-1)
    if (just(c?.right, w?.['D'], w?.['C'])) return { x: ISO_DIRS.E.dx, y: ISO_DIRS.E.dy }; // E (+1,0)
    if (just(c?.down, w?.['S'], w?.['Z'])) return { x: ISO_DIRS.S.dx, y: ISO_DIRS.S.dy }; // S (0,+1)
    if (just(c?.left, w?.['A'], w?.['Q'])) return { x: ISO_DIRS.W.dx, y: ISO_DIRS.W.dy }; // W (-1,0)
    return null;
  }

  /**
   * Attempt a single-tile step. Public so click-to-move / tests can reuse it.
   * Thin rendering adapter over the pure turn rules (`resolveStep` in
   * src/manor/turns.ts): the outcome decides, this method only renders
   * (tween, facing texture, clock charge, portal fade, save). The player
   * tile/facing ride in a short-lived TileActor — the first real adapter
   * off the bespoke scene fields. Rules (order, costs) are unchanged.
   */
  async tryStep(dx: number, dy: number): Promise<boolean> {
    if (this.moving || !this.playerSprite) return false;
    const outcome = resolveStep(
      {
        actor: new TileActor({ ...this.playerTile }, this.facing),
        isWalkable: (t) => this.grid.isWalkable(t),
        portalAt: (t) => {
          const eff = this.effectiveRoom(this.roomId).portals.find(
            (pt) => pt.from.x === t.x && pt.from.y === t.y,
          );
          const p = eff ?? this.roomRegistry.portalAt(this.roomId, t.x, t.y);
          return p ? { toRoom: p.toRoom, to: { ...p.to }, lockedBy: p.lockedBy } : undefined;
        },
        isUnlocked: (key) => this.unlockedKeys.has(key),
      },
      dx,
      dy,
    );
    // Illegal (vertex-touching diagonal) and blocked (wall/prop) steps:
    // no move, no time cost.
    if (outcome.kind === 'illegal' || outcome.kind === 'blocked') return false;
    // Locked doors bump with a message: no move, no time cost.
    if (outcome.kind === 'locked') {
      this.dialogue.say('', tr(LOCK_KEYS[outcome.lockKey]));
      return false;
    }
    const next = outcome.to;
    this.moving = true;
    this.facing = outcome.facing;
    const { tx, ty } = this.playerScreen(next.x, next.y);
    // One calm footfall per tile step: opposite run phases mid-glide.
    // (Rapid run-frame cycling at this step rate reads as jitter.)
    const spr = this.playerSprite;
    spr.setTexture(`human_${this.facing}_run0`);
    this.tweens.add({ targets: spr, x: tx, y: ty, duration: 150, ease: 'Linear' });
    spr.setDepth(depthFor(next.x, next.y, 0.2));
    this.time.delayedCall(75, () => {
      if (this.playerSprite === spr) spr.setTexture(`human_${this.facing}_run5`);
    });
    await new Promise((res) => this.time.delayedCall(155, res));
    if (this.playerSprite === spr) spr.setTexture(`human_${this.facing}_idle`);
    this.playerTile = next;
    this.drawPlayerRing();

    this.clock.advance(outcome.timeCost, 'move');

    // Portal check AFTER paying the move cost (resolved by the turn rules).
    // Room changes fade through darkness (fadeOut -> load -> fadeIn).
    const portal = outcome.portal;
    if (portal) {
      this.cameras.main.fadeOut(160, 13, 10, 20);
      this.time.delayedCall(170, () => {
        this.loadRoom(portal.toRoom, portal.to);
        this.moving = false;
      });
    } else {
      this.moving = false;
      if (!this.editorMode) this.autosave();
    }
    // notify React HUD / dev tools
    this.game.events.emit('manor:tick');
    return true;
  }

  // ---------------------------------------------------------- bridge seam ---

  /**
   * Narrowed React<->Phaser seam: React (src/dev/*) reaches the scene only
   * through send()/ask(). Every wider operation below stays private.
   */
  send(command: EditorCommand): void {
    switch (command.kind) {
      case 'jumpToRoom': return this.jumpToRoom(command.roomId);
      case 'unlock': return this.unlock(command.key);
      case 'lockAll': return this.lockAll();
      case 'editorEnable': return this.editorEnable(command.enabled);
      case 'editorSetTool': return this.editorSetTool(command.tool, command.brush);
      case 'editorSetHitboxesVisible': return this.editorSetHitboxesVisible(command.visible);
      case 'editorSetPropWalk': return this.editorSetPropWalk(command.roomId, command.propId, command.walkable);
      case 'editorSetPropSprite': return this.editorSetPropSprite(command.roomId, command.propId, command.sprite);
      case 'editorDeleteProp': return this.editorDeleteProp(command.roomId, command.propId);
      case 'editorAddPortal': return this.editorAddPortal(command.roomId);
      case 'editorUpdatePortal': return this.editorUpdatePortal(command.roomId, command.index, command.patch);
      case 'editorDeletePortal': return this.editorDeletePortal(command.roomId, command.index);
      case 'editorResize': return this.editorResize(command.roomId, command.w, command.h, command.fill);
      case 'editorClearWalk': return this.editorClearWalk(command.roomId);
      case 'editorZoom': return this.editorZoom(command.factor);
      case 'editorRecenter': return this.editorRecenter();
    }
  }

  ask<Q extends EditorQuery>(query: Q): QueryResult<Q> {
    switch (query.kind) {
      case 'roomIds': return this.roomIds() as QueryResult<Q>;
      case 'currentRoom': return this.currentRoom() as QueryResult<Q>;
      case 'playerTile': return { ...this.playerTile } as QueryResult<Q>;
      case 'unlocked': return this.unlocked() as QueryResult<Q>;
      case 'editorIsEnabled': return this.editorIsEnabled() as QueryResult<Q>;
      case 'editorGetRoom': return this.snapshotRoom(query.roomId) as QueryResult<Q>;
      case 'editorExport': return this.exportRooms() as QueryResult<Q>;
      case 'editorImport': return this.importRooms(query.json) as QueryResult<Q>;
    }
  }

  private jumpToRoom(id: string): void {
    this.loadRoom(id);
  }

  private roomIds(): string[] {
    return this.roomRegistry.ids();
  }

  private currentRoom(): string {
    return this.roomId;
  }

  private unlock(key: LockKey): void {
    this.unlockedKeys.add(key);
  }

  private lockAll(): void {
    this.unlockedKeys.clear();
  }

  private unlocked(): LockKey[] {
    return [...this.unlockedKeys];
  }

  private editorEnable(on: boolean): void {
    this.editorMode = on;
    this.dragPropId = null;
    this.dragPortalIdx = -1;
    this.drawHitboxes();
    this.frameCamera();
  }

  private editorIsEnabled(): boolean {
    return this.editorMode;
  }

  private editorSetTool(tool: EditorTool, brush: EditorBrush): void {
    this.editorTool = tool;
    this.editorBrush = brush;
  }

  private editorSetHitboxesVisible(v: boolean): void {
    this.showHitboxes = v;
    this.drawHitboxes();
  }

  private editorSetPropWalk(roomId: string, propId: string, walkable: boolean): void {
    const ov = this.overrideFor(roomId);
    const prop = ov.props.find((pr) => pr.id === propId);
    if (prop) {
      prop.walkable = walkable;
      this.refreshAfterEdit();
    }
  }

  private editorSetPropSprite(roomId: string, propId: string, sprite: string): void {
    const ov = this.overrideFor(roomId);
    const prop = ov.props.find((pr) => pr.id === propId);
    if (prop && sprite) {
      prop.sprite = sprite;
      this.refreshAfterEdit();
    }
  }

  private editorDeleteProp(roomId: string, propId: string): void {
    const ov = this.overrideFor(roomId);
    const i = ov.props.findIndex((pr) => pr.id === propId);
    if (i >= 0) {
      ov.props.splice(i, 1);
      if (this.dragPropId === propId) this.dragPropId = null;
      this.refreshAfterEdit();
    }
  }

  private editorAddPortal(roomId: string): void {
    const ov = this.overrideFor(roomId);
    const ids = this.roomRegistry.ids().filter((id) => id !== roomId);
    ov.portals.push({
      from: { ...ov.spawn },
      toRoom: ids[0] ?? roomId,
      to: { x: 0, y: 0 },
      label: 'new door',
    });
    this.refreshAfterEdit();
  }

  private editorUpdatePortal(roomId: string, index: number, patch: PortalPatch): void {
    const ov = this.overrideFor(roomId);
    const pt = ov.portals[index];
    if (!pt) return;
    if (patch.toRoom !== undefined) pt.toRoom = patch.toRoom;
    if (patch.toX !== undefined && Number.isFinite(patch.toX)) pt.to.x = Math.max(0, Math.round(patch.toX));
    if (patch.toY !== undefined && Number.isFinite(patch.toY)) pt.to.y = Math.max(0, Math.round(patch.toY));
    if (patch.label !== undefined) pt.label = patch.label || undefined;
    if (patch.lockedBy !== undefined) {
      const v = patch.lockedBy.trim();
      pt.lockedBy = (v === '' ? undefined : (v as LockKey));
    }
    this.refreshAfterEdit();
  }

  private editorDeletePortal(roomId: string, index: number): void {
    const ov = this.overrideFor(roomId);
    if (index >= 0 && index < ov.portals.length) {
      ov.portals.splice(index, 1);
      this.refreshAfterEdit();
    }
  }

  private editorResize(roomId: string, w: number, h: number, fill: string): void {
    const cw = Math.max(3, Math.min(40, Math.round(w)));
    const chh = Math.max(3, Math.min(40, Math.round(h)));
    const f = fill.length === 1 ? fill : '.';
    const ov = this.overrideFor(roomId);
    const next: string[] = [];
    for (let y = 0; y < chh; y++) {
      const old = ov.tiles[y] ?? '';
      let row = '';
      for (let x = 0; x < cw; x++) row += old[x] ?? f;
      next.push(row);
    }
    ov.tiles = next;
    ov.spawn = {
      x: Math.max(0, Math.min(cw - 1, ov.spawn.x)),
      y: Math.max(0, Math.min(chh - 1, ov.spawn.y)),
    };
    this.refreshAfterEdit();
  }

  private editorClearWalk(roomId: string): void {
    this.overrideFor(roomId).walk.clear();
    this.refreshAfterEdit();
  }

  private editorZoom(factor: number): void {
    const cam = this.cameras.main;
    cam.setZoom(Math.max(0.25, Math.min(3, cam.zoom * factor)));
  }

  private editorRecenter(): void {
    this.frameRoomForEditor(true);
  }

  /** Tile char from the current brush (prop brushes carry no tile char). */
  private brushTileChar(): string {
    return this.editorBrush.kind === 'tile' ? this.editorBrush.ch : '';
  }

  /** Prop sprite from the current brush (tile brushes carry no sprite). */
  private brushSprite(): string {
    return this.editorBrush.kind === 'prop' && this.editorBrush.sprite ? this.editorBrush.sprite : 'crate';
  }

  // ---------------------------------------------------------------- editor ---

  private tileFromPointer(ptr: Phaser.Input.Pointer): { x: number; y: number } | null {
    const world = ptr.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const { x, y } = screenToTile(world.x, world.y);
    if (!this.grid || x < 0 || y < 0 || x >= this.grid.width || y >= this.grid.height) return null;
    return { x, y };
  }

  private onEditorPointerDown(ptr: Phaser.Input.Pointer): void {
    if (!this.editorMode) return;
    const t = this.tileFromPointer(ptr);
    if (!t) return;
    const ov = this.overrideFor(this.roomId);
    if (this.editorTool === 'paint') {
      this.painting = true;
      this.paintTile(ov, t.x, t.y, this.brushTileChar());
    } else if (this.editorTool === 'spawn') {
      ov.spawn = { ...t };
      this.refreshAfterEdit(true);
    } else if (this.editorTool === 'walk') {
      const key = `${t.x},${t.y}`;
      const cur = ov.walk.get(key) ?? this.grid.isWalkable(t);
      ov.walk.set(key, !cur);
      this.refreshAfterEdit();
    } else if (this.editorTool === 'prop-add') {
      const sprite = this.brushSprite();
      ov.props.push({ id: `prop_${Date.now()}_${ov.props.length}`, sprite, x: t.x, y: t.y, walkable: false });
      this.refreshAfterEdit();
    } else if (this.editorTool === 'prop-edit') {
      const hit = [...ov.props].reverse().find((pr) => pr.x === t.x && pr.y === t.y);
      if (hit) {
        this.dragPropId = hit.id;
        // let React know which prop is selected (panel follows)
        this.game.events.emit('manor:editor-select-prop', { propId: hit.id });
      }
    } else if (this.editorTool === 'prop-delete') {
      const i = ov.props.findIndex((pr) => pr.x === t.x && pr.y === t.y);
      if (i >= 0) {
        ov.props.splice(i, 1);
        this.refreshAfterEdit();
      }
    } else if (this.editorTool === 'portal') {
      const i = ov.portals.findIndex((pt) => pt.from.x === t.x && pt.from.y === t.y);
      if (i >= 0) this.dragPortalIdx = i;
    }
  }

  private onEditorPointerMove(ptr: Phaser.Input.Pointer): void {
    // right/middle-drag pans the camera in edit mode (left paints)
    if (this.editorMode && (ptr.rightButtonDown() || ptr.middleButtonDown())) {
      const cam = this.cameras.main;
      const z = cam.zoom || 1;
      cam.scrollX -= (ptr.x - ptr.prevPosition.x) / z;
      cam.scrollY -= (ptr.y - ptr.prevPosition.y) / z;
      return;
    }
    this.updateHover(ptr);
    if (!this.editorMode) return;
    const t = this.tileFromPointer(ptr);
    if (!t) return;
    if (this.painting && this.editorTool === 'paint' && ptr.leftButtonDown()) {
      this.paintTile(this.overrideFor(this.roomId), t.x, t.y, this.brushTileChar());
      return;
    }
    if (this.dragPropId) {
      const img = this.propSprites.get(this.dragPropId);
      if (img) {
        const { sx, sy } = tileToScreen(t.x, t.y);
        img.x = sx;
        img.y = sy + TILE_H / 2;
        img.setDepth(depthFor(t.x, t.y, 0.1));
      }
    }
  }

  /** Hover diamond: white on walkable, red on blocked (also the paint cursor). */
  private updateHover(ptr: Phaser.Input.Pointer): void {
    if (!this.grid) return;
    const world = ptr.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const { x, y } = screenToTile(world.x, world.y);
    const key = `${x},${y}`;
    if (key === this.lastHoverKey) return;
    this.lastHoverKey = key;
    if (!this.hoverLayer) this.hoverLayer = this.add.graphics().setDepth(8997);
    const g = this.hoverLayer;
    g.clear();
    if (x < 0 || y < 0 || x >= this.grid.width || y >= this.grid.height) return;
    const { sx, sy } = tileToScreen(x, y);
    this.diamond(g, sx, sy, 1);
    if (this.grid.isWalkable({ x, y })) g.fillStyle(0xffffff, 0.18);
    else g.fillStyle(0xff5a5a, 0.22);
    g.fillPath();
    this.diamond(g, sx, sy, 1);
    g.lineStyle(1.5, 0xffffff, 0.85);
    g.strokePath();
  }

  /** Blue ring under the player tile: position readable at a glance. */
  private drawPlayerRing(): void {
    if (!this.markerLayer) this.markerLayer = this.add.graphics().setDepth(8998);
    const g = this.markerLayer;
    g.clear();
    const { sx, sy } = tileToScreen(this.playerTile.x, this.playerTile.y);
    this.diamond(g, sx, sy, 2);
    g.lineStyle(2.5, 0x4a9ac9, 1);
    g.strokePath();
  }

  private onEditorPointerUp(): void {
    if (!this.editorMode) return;
    this.painting = false;
    if (this.dragPropId) {
      const img = this.propSprites.get(this.dragPropId);
      const ov = this.overrideFor(this.roomId);
      const pr = ov.props.find((p) => p.id === this.dragPropId);
      if (img && pr) {
        // img.x/img.y is the foot anchor (front vertex), not the ground point.
        const { x, y } = tileFromFootPos(img.x, img.y);
        pr.x = Math.max(0, Math.min(this.grid.width - 1, x));
        pr.y = Math.max(0, Math.min(this.grid.height - 1, y));
      }
      this.dragPropId = null;
      this.refreshAfterEdit();
      return;
    }
    if (this.dragPortalIdx >= 0) {
      // pointer tile at release = new portal origin
      const ptr = this.input.activePointer;
      const t = this.tileFromPointer(ptr);
      const ov = this.overrideFor(this.roomId);
      if (t && ov.portals[this.dragPortalIdx]) {
        ov.portals[this.dragPortalIdx].from = { ...t };
        this.refreshAfterEdit();
      }
      this.dragPortalIdx = -1;
    }
  }

  private paintTile(ov: RoomOverride, x: number, y: number, ch: string): void {
    if (ch.length !== 1) return;
    const row = ov.tiles[y];
    if (!row || row[x] === ch) return;
    ov.tiles[y] = row.slice(0, x) + ch + row.slice(x + 1);
    this.refreshAfterEdit();
  }

  /** Re-render current room after an edit, keeping the player where possible. */
  private refreshAfterEdit(teleportToSpawn = false): void {
    const room = this.effectiveRoom(this.roomId);
    const keep = teleportToSpawn ? room.spawn : this.playerTile;
    this.loadRoomNoSave(this.roomId, keep);
    this.game.events.emit('manor:editor', { roomId: this.roomId });
  }

  /** loadRoom without autosaving (edits are not player progress). */
  private loadRoomNoSave(roomId: string, preferred: { x: number; y: number }): void {
    const room = this.effectiveRoom(roomId);
    this.roomId = roomId;
    this.children.removeAll();
    this.propSprites.clear();
    this.hitboxLayer = undefined;
    this.markerLayer = undefined;
    this.hoverLayer = undefined;
    this.lastHoverKey = '';
    this.rebuildGrid(room);
    this.renderRoom(room);
    const spot = this.grid.isWalkable(preferred) ? preferred : room.spawn;
    this.playerTile = { ...spot };
    const { tx, ty } = this.playerScreen(spot.x, spot.y);
    this.playerSprite = this.add
      .image(tx, ty, `human_${this.facing}_idle`)
      .setScale(SPRITE_SCALE)
      .setOrigin(0.5, 1)
      .setDepth(depthFor(spot.x, spot.y, 0.2));
    this.drawHitboxes();
    this.drawPlayerRing();
    // NB: no frameCamera() here — refreshAfterEdit runs on every paint
    // stroke and must not reset the editor's pan/zoom. Reframing happens
    // on room switch (loadRoom), editor enable, and the ⤢ frame button.
  }

  private diamond(g: Phaser.GameObjects.Graphics, cx: number, cy: number, pad = 0): void {
    g.beginPath();
    g.moveTo(cx, cy - TILE_H / 2 + pad);
    g.lineTo(cx + TILE_W / 2 - pad, cy);
    g.lineTo(cx, cy + TILE_H / 2 - pad);
    g.lineTo(cx - TILE_W / 2 + pad, cy);
    g.closePath();
  }

  private drawHitboxes(): void {
    if (this.hitboxLayer) this.hitboxLayer.clear();
    if (!this.showHitboxes && !this.editorMode) return;
    if (!this.grid) return;
    if (!this.hitboxLayer) {
      this.hitboxLayer = this.add.graphics().setDepth(9000);
    }
    const g = this.hitboxLayer;
    g.clear();
    const room = this.effectiveRoom(this.roomId);
    const portalSet = new Set(room.portals.map((pt) => `${pt.from.x},${pt.from.y}`));
    const ov = this.overrides.get(this.roomId);
    for (let y = 0; y < this.grid.height; y++) {
      for (let x = 0; x < this.grid.width; x++) {
        const { sx, sy } = tileToScreen(x, y);
        const walk = this.grid.isWalkable({ x, y });
        const ch = room.tiles[y]?.[x];
        this.diamond(g, sx, sy, 1);
        if (walk) g.fillStyle(0x3d9a5a, 0.22);
        else g.fillStyle(0x9a3d3d, ch === '#' ? 0.12 : 0.3);
        g.fillPath();
        if (portalSet.has(`${x},${y}`)) {
          this.diamond(g, sx, sy, 3);
          g.lineStyle(2, 0xc9a227, 1);
          g.strokePath();
        }
        if (ov?.walk.has(`${x},${y}`)) {
          this.diamond(g, sx, sy, 1);
          g.lineStyle(1, 0xffffff, 0.9);
          g.strokePath();
        }
      }
    }
    // spawn marker
    const s = tileToScreen(room.spawn.x, room.spawn.y);
    this.diamond(g, s.sx, s.sy, 4);
    g.lineStyle(2, 0x4a9ac9, 1);
    g.strokePath();
  }

  private snapshotRoom(roomId: string): RoomSnapshot {
    const room = this.effectiveRoom(roomId);
    const ov = this.overrides.get(roomId);
    const walk: Record<string, boolean> = {};
    if (ov) for (const [k, v] of ov.walk) walk[k] = v;
    return {
      tiles: [...room.tiles],
      spawn: { ...room.spawn },
      portals: room.portals.map((pt) => ({ ...pt, from: { ...pt.from }, to: { ...pt.to } })),
      props: (room.props ?? []).map((pr) => ({ ...pr })),
      walk,
    };
  }

  /** Export every room (base + edits) as JSON — the path to prod `manor.ts`. */
  private exportRooms(): string {
    const rooms = this.roomRegistry.ids().map((id) => {
      const r = this.effectiveRoom(id);
      return { id: r.id, name: r.name, tiles: r.tiles, spawn: r.spawn, portals: r.portals, props: r.props ?? [], flavor: r.flavor ?? '' };
    });
    return JSON.stringify({ rooms }, null, 2);
  }

  private importRooms(json: string): boolean {
    try {
      const data = JSON.parse(json) as { rooms: RoomDef[] };
      if (!Array.isArray(data.rooms)) return false;
      for (const r of data.rooms) {
        if (!this.baseRoom(r.id) || !Array.isArray(r.tiles)) continue;
        const ov = this.overrideFor(r.id);
        ov.tiles = [...r.tiles];
        ov.spawn = { ...r.spawn };
        ov.portals = r.portals.map((pt) => ({ ...pt, from: { ...pt.from }, to: { ...pt.to } }));
        ov.props = (r.props ?? []).map((pr) => ({ ...pr }));
      }
      this.refreshAfterEdit();
      return true;
    } catch {
      return false;
    }
  }
}
