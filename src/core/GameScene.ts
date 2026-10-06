import Phaser from 'phaser';
import { Grid } from '../movement/Grid';
import {
  ISO_DIRS,
  facingForStep as isoFacingForStep,
  isIsoStep,
  tileFootScreen,
  tileFromFoot as tileFromFootPos,
  tileToScreen as isoTileToScreen,
  screenToTile as isoScreenToTile,
  depthFor as isoDepthFor,
  TILE_W as ISO_TILE_W,
  TILE_H as ISO_TILE_H,
} from '../movement/IsoTiles';
import { COST, LOOP_START_WALL_MINUTES, MINUTES_PER_DAY } from '../time/types';
import { timeManager } from '../time/TimeManager';
import { RoomRegistry, type LockKey } from '../rooms/types';
import type { RoomDef, RoomProp } from '../rooms/types';
import { createProdRegistry } from '../rooms/manor';
import { textEngine } from '../text/TextEngine';
import { writeSave } from '../save/SaveManager';
import type { GameInit } from './boot';
import { SPRITE_BASES, parsePropSprite } from '../rooms/spriteCatalog';

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
/** Back-compat alias (square-tile callers). */
export const TILE = TILE_W;
const SPRITE_SCALE = TILE_W / 256;
const ISO = 'Isometric';
const BASE = import.meta.env.BASE_URL;

const LOCK_MESSAGES: Record<LockKey, string> = {
  servant: "Locked. The servants' room — Clara's key would open it.",
  master: 'Locked. It needs the master key.',
  kitchen: "Locked. Thomas keeps the kitchen key.",
};

/**
 * Iso tile compass (Kenney pack, see Information.png + IsoTiles):
 * N = screen up-right (0,-1), E = screen down-right (+1,0),
 * S = screen down-left (0,+1), W = screen up-left (-1,0).
 * Each step moves to the tile sharing a diamond SIDE — never to a
 * vertex-touching diagonal. Human facings for tile moves: N=0 E=2 S=4 W=6.
 */
const ALL_DIRS = [0, 1, 2, 3, 4, 5, 6, 7]; // texture preload only
const FACING_FOR_STEP = (dx: number, dy: number): number | null => isoFacingForStep(dx, dy);

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

/** Grid (x,y) -> world: diamond CENTER. One ground sprite == one tile. */
export function tileToScreen(x: number, y: number): { sx: number; sy: number } {
  return isoTileToScreen(x, y);
}

/**
 * World (ground point) -> tile containing it. Pure inverse of tileToScreen.
 * (The old version subtracted TILE_H/2 for a bottom-vertex anchor, which
 * shifted every click/hover by half a tile. Foot-anchored sprite positions
 * must use tileFromFoot instead.)
 */
export function screenToTile(wx: number, wy: number): { x: number; y: number } {
  return isoScreenToTile(wx, wy);
}

const depthFor = (x: number, y: number, layer = 0): number => isoDepthFor(x, y, layer);

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
 * Bridge exposed on the Phaser game object for React (dev tools + editor).
 * Implemented here in prod-safe code; the dev-only LEVEL EDITOR (src/dev/)
 * calls these methods but is itself never bundled in production.
 */
export interface ManorBridge {
  jumpToRoom: (id: string) => void;
  roomIds: () => string[];
  currentRoom: () => string;
  playerTile: () => { x: number; y: number };
  unlock: (key: LockKey) => void;
  lockAll: () => void;
  unlocked: () => LockKey[];
  // --- level-editor hooks (dev only callers, prod-safe implementation) ---
  editorEnable: (on: boolean) => void;
  editorIsEnabled: () => boolean;
  editorSetTool: (tool: string, brush: string) => void;
  editorGetRoom: (roomId: string) => {
    tiles: string[];
    spawn: { x: number; y: number };
    portals: RoomDef['portals'];
    props: RoomProp[];
    walk: Record<string, boolean>;
  };
  editorExport: () => string;
  editorImport: (json: string) => boolean;
  editorSetHitboxesVisible: (v: boolean) => void;
  editorSetPropWalk: (roomId: string, propId: string, walkable: boolean) => void;
  editorSetPropSprite: (roomId: string, propId: string, sprite: string) => void;
  editorDeleteProp: (roomId: string, propId: string) => void;
  editorZoom: (factor: number) => void;
  editorRecenter: () => void;
  editorAddPortal: (roomId: string) => void;
  editorUpdatePortal: (
    roomId: string,
    index: number,
    patch: Partial<{ toRoom: string; toX: number; toY: number; label: string; lockedBy: string }>,
  ) => void;
  editorDeletePortal: (roomId: string, index: number) => void;
  editorResize: (roomId: string, w: number, h: number, fill: string) => void;
  editorClearWalk: (roomId: string) => void;
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
  private editorTool = 'paint';
  private editorBrush = '#';
  private overrides = new Map<string, RoomOverride>();
  private dragPropId: string | null = null;
  private dragPortalIdx = -1;
  private painting = false;

  constructor() {
    super(GAME_SCENE);
  }

  preload(): void {
    const iso = (base: string, dir: string) => `${BASE}prototype_sprites/${ISO}/${base}_${dir}.png`;
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
    this.cursors = this.input.keyboard?.createCursorKeys();
    if (this.input.keyboard) {
      this.wasd = this.input.keyboard.addKeys('W,A,S,D,Q,E,Z,C') as Record<string, Phaser.Input.Keyboard.Key>;
    }

    (this.game as unknown as { __manor?: ManorBridge }).__manor = {
      jumpToRoom: (id: string) => this.loadRoom(id),
      currentRoom: () => this.roomId,
      roomIds: () => this.roomRegistry.ids(),
      playerTile: () => ({ ...this.playerTile }),
      unlock: (key: LockKey) => this.unlockedKeys.add(key),
      lockAll: () => this.unlockedKeys.clear(),
      unlocked: () => [...this.unlockedKeys],
      editorEnable: (on: boolean) => {
        this.editorMode = on;
        this.dragPropId = null;
        this.dragPortalIdx = -1;
        this.drawHitboxes();
        this.frameCamera();
      },
      editorIsEnabled: () => this.editorMode,
      editorSetTool: (tool: string, brush: string) => {
        this.editorTool = tool;
        this.editorBrush = brush;
      },
      editorGetRoom: (id: string) => this.snapshotRoom(id),
      editorExport: () => this.exportRooms(),
      editorImport: (json: string) => this.importRooms(json),
      editorSetHitboxesVisible: (v: boolean) => {
        this.showHitboxes = v;
        this.drawHitboxes();
      },
      editorSetPropWalk: (roomId: string, propId: string, walkable: boolean) => {
        const ov = this.overrideFor(roomId);
        const prop = ov.props.find((pr) => pr.id === propId);
        if (prop) {
          prop.walkable = walkable;
          this.refreshAfterEdit();
        }
      },
      editorSetPropSprite: (roomId: string, propId: string, sprite: string) => {
        const ov = this.overrideFor(roomId);
        const prop = ov.props.find((pr) => pr.id === propId);
        if (prop && sprite) {
          prop.sprite = sprite;
          this.refreshAfterEdit();
        }
      },
      editorDeleteProp: (roomId: string, propId: string) => {
        const ov = this.overrideFor(roomId);
        const i = ov.props.findIndex((pr) => pr.id === propId);
        if (i >= 0) {
          ov.props.splice(i, 1);
          if (this.dragPropId === propId) this.dragPropId = null;
          this.refreshAfterEdit();
        }
      },
      editorAddPortal: (roomId: string) => {
        const ov = this.overrideFor(roomId);
        const ids = this.roomRegistry.ids().filter((id) => id !== roomId);
        ov.portals.push({
          from: { ...ov.spawn },
          toRoom: ids[0] ?? roomId,
          to: { x: 0, y: 0 },
          label: 'new door',
        });
        this.refreshAfterEdit();
      },
      editorUpdatePortal: (roomId, index, patch) => {
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
      },
      editorDeletePortal: (roomId, index) => {
        const ov = this.overrideFor(roomId);
        if (index >= 0 && index < ov.portals.length) {
          ov.portals.splice(index, 1);
          this.refreshAfterEdit();
        }
      },
      editorResize: (roomId, w, h, fill) => {
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
      },
      editorClearWalk: (roomId) => {
        this.overrideFor(roomId).walk.clear();
        this.refreshAfterEdit();
      },
      editorZoom: (factor: number) => {
        const cam = this.cameras.main;
        cam.setZoom(Math.max(0.25, Math.min(3, cam.zoom * factor)));
      },
      editorRecenter: () => {
        this.frameRoomForEditor(true);
      },
    };

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
    timeManager.on((e) => {
      if (e.type === 'advanced') this.checkNoonChime(e.from, e.to);
      if (e.type === 'loopReset') this.chimedNoons.clear();
    });

    void this.initRegistryThenLoad(data);
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

  /** Resolve a prop sprite id ("crate" | "wall:N") to a loaded texture key. */
  private propTexture(sprite: string): string {
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
            // stairs ascend grid-north (screen up-right); rotate via props if needed
            this.put(x, y, this.propTexture('stairs:S'));
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
            const axis = this.doorAxis(room, x, y);
            if (portal) {
              const shut = portal.lockedBy && !this.unlockedKeys.has(portal.lockedBy);
              this.put(x, y, this.propTexture(`${shut ? 'doorClosed' : 'doorOpen'}:${axis}`));
            } else {
              this.put(x, y, this.propTexture(`doorway:${axis}`));
            }
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
      elapsedMinutes: timeManager.elapsedMinutes,
      loops: timeManager.loops,
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

  /** Attempt a single-tile step. Public so click-to-move / tests can reuse it. */
  async tryStep(dx: number, dy: number): Promise<boolean> {
    if (this.moving || !this.playerSprite) return false;
    // Tile invariant: only edge-to-edge (N/E/S/W) steps are legal.
    // Vertex-touching diagonals (|dx|+|dy| !== 1) are rejected outright.
    if (!isIsoStep(dx, dy)) return false;
    const next = { x: this.playerTile.x + dx, y: this.playerTile.y + dy };
    if (!this.grid.isWalkable(next)) return false;
    // Locked doors bump with a message: no move, no time cost.
    const ahead = this.roomRegistry.portalAt(this.roomId, next.x, next.y);
    const effAhead = this.effectiveRoom(this.roomId).portals.find(
      (pt) => pt.from.x === next.x && pt.from.y === next.y,
    );
    if ((effAhead ?? ahead)?.lockedBy && !this.unlockedKeys.has((effAhead ?? ahead)!.lockedBy!)) {
      textEngine.say('', LOCK_MESSAGES[(effAhead ?? ahead)!.lockedBy!]);
      return false;
    }
    this.moving = true;
    const stepFacing = FACING_FOR_STEP(dx, dy);
    if (stepFacing !== null) this.facing = stepFacing;
    const { tx, ty } = this.playerScreen(next.x, next.y);
    let frame = 0;
    const runTimer = this.time.addEvent({
      delay: 40,
      repeat: 3,
      callback: () => {
        frame = (frame + 1) % 10;
        this.playerSprite?.setTexture(`human_${this.facing}_run${frame}`);
      },
    });
    this.tweens.add({ targets: this.playerSprite, x: tx, y: ty, duration: 130, ease: 'Linear' });
    this.playerSprite.setDepth(depthFor(next.x, next.y, 0.2));
    await new Promise((res) => this.time.delayedCall(135, res));
    runTimer.remove();
    this.playerSprite.setTexture(`human_${this.facing}_idle`);
    this.moving = false;
    this.playerTile = next;
    this.drawPlayerRing();

    timeManager.advance(COST.MOVE, 'move');

    // Portal check AFTER paying the move cost (uses edited portals).
    const portal = this.effectiveRoom(this.roomId).portals.find(
      (pt) => pt.from.x === next.x && pt.from.y === next.y,
    );
    if (portal) {
      this.loadRoom(portal.toRoom, portal.to);
    } else if (!this.editorMode) {
      this.autosave();
    }
    // notify React HUD / dev tools
    this.game.events.emit('manor:tick');
    return true;
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
      this.paintTile(ov, t.x, t.y, this.editorBrush);
    } else if (this.editorTool === 'spawn') {
      ov.spawn = { ...t };
      this.refreshAfterEdit(true);
    } else if (this.editorTool === 'walk') {
      const key = `${t.x},${t.y}`;
      const cur = ov.walk.get(key) ?? this.grid.isWalkable(t);
      ov.walk.set(key, !cur);
      this.refreshAfterEdit();
    } else if (this.editorTool === 'prop-add') {
      const sprite = this.editorBrush || 'crate';
      ov.props.push({ id: `prop_${Date.now()}_${ov.props.length}`, sprite, x: t.x, y: t.y, walkable: false });
      this.refreshAfterEdit();
    } else if (this.editorTool === 'prop-move' || this.editorTool === 'prop-edit') {
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
      this.paintTile(this.overrideFor(this.roomId), t.x, t.y, this.editorBrush);
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

  private snapshotRoom(roomId: string): {
    tiles: string[];
    spawn: { x: number; y: number };
    portals: RoomDef['portals'];
    props: RoomProp[];
    walk: Record<string, boolean>;
  } {
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
