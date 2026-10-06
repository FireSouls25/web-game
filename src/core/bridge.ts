/**
 * Narrowed React<->Phaser seam (single home of the ManorBridge contract).
 *
 * React (dev tools + level editor) may ONLY talk to the game through
 * `send()` (fire-and-forget mutations) and `ask()` (value-returning reads).
 * The wider GameScene method surface stays private behind those two entry
 * points — nothing in src/dev/* imports GameScene for bridge types.
 *
 * Tool/brush payloads are closed unions: editor tool ids are EditorTool
 * members (never free-form strings) and the brush is a tagged EditorBrush
 * (tile char for paint, sprite id for prop-add).
 */
import type { LockKey, RoomDef, RoomProp } from '../rooms/types';

/** Closed set of editor pointer tools (mirrors the LevelEditor palette). */
export type EditorTool =
  | 'paint'
  | 'spawn'
  | 'walk'
  | 'prop-add'
  | 'prop-edit'
  | 'prop-delete'
  | 'portal';

/** Paint brush: single ascii tile char (validated scene-side). */
export interface TileBrush {
  kind: 'tile';
  ch: string;
}

/** Prop brush: sprite id ("crate" or "wall:N" per spriteCatalog). */
export interface PropBrush {
  kind: 'prop';
  sprite: string;
}

/** Typed brush payload — never a bare string. */
export type EditorBrush = TileBrush | PropBrush;

/** Room snapshot shared across the seam (base + dev edits). */
export interface RoomSnapshot {
  tiles: string[];
  spawn: { x: number; y: number };
  portals: RoomDef['portals'];
  props: RoomProp[];
  /** explicit walkability flags ("x,y" -> walkable) */
  walk: Record<string, boolean>;
}

/**
 * Portal patch. `lockedBy` is a closed LockKey; the empty string clears
 * the lock (door becomes freely passable).
 */
export interface PortalPatch {
  toRoom?: string;
  toX?: number;
  toY?: number;
  label?: string;
  lockedBy?: LockKey | '';
}

/** Fire-and-forget mutations (covers paint/spawn/walk/prop-add/prop-edit/prop-delete/portal tool selection plus resize/clearWalk/zoom/recenter). */
export type EditorCommand =
  | { kind: 'jumpToRoom'; roomId: string }
  | { kind: 'unlock'; key: LockKey }
  | { kind: 'lockAll' }
  | { kind: 'editorEnable'; enabled: boolean }
  | { kind: 'editorSetTool'; tool: EditorTool; brush: EditorBrush }
  | { kind: 'editorSetHitboxesVisible'; visible: boolean }
  | { kind: 'editorSetPropWalk'; roomId: string; propId: string; walkable: boolean }
  | { kind: 'editorSetPropSprite'; roomId: string; propId: string; sprite: string }
  | { kind: 'editorDeleteProp'; roomId: string; propId: string }
  | { kind: 'editorAddPortal'; roomId: string }
  | { kind: 'editorUpdatePortal'; roomId: string; index: number; patch: PortalPatch }
  | { kind: 'editorDeletePortal'; roomId: string; index: number }
  | { kind: 'editorResize'; roomId: string; w: number; h: number; fill: string }
  | { kind: 'editorClearWalk'; roomId: string }
  | { kind: 'editorZoom'; factor: number }
  | { kind: 'editorRecenter' };

/** Value-returning reads. */
export type EditorQuery =
  | { kind: 'roomIds' }
  | { kind: 'currentRoom' }
  | { kind: 'playerTile' }
  | { kind: 'unlocked' }
  | { kind: 'editorIsEnabled' }
  | { kind: 'editorGetRoom'; roomId: string }
  | { kind: 'editorExport' }
  | { kind: 'editorImport'; json: string };

/** Answer type per query kind (keeps ask() call sites narrowed). */
export type QueryResult<Q extends EditorQuery> = Q extends { kind: 'roomIds' }
  ? string[]
  : Q extends { kind: 'currentRoom' }
    ? string
    : Q extends { kind: 'playerTile' }
      ? { x: number; y: number }
      : Q extends { kind: 'unlocked' }
        ? LockKey[]
        : Q extends { kind: 'editorIsEnabled' }
          ? boolean
          : Q extends { kind: 'editorGetRoom' }
            ? RoomSnapshot
            : Q extends { kind: 'editorExport' }
              ? string
              : Q extends { kind: 'editorImport' }
                ? boolean
                : never;

/**
 * Bridge exposed on the Phaser game object for React (dev tools + editor).
 * Implemented by GameScene in prod-safe code; the dev-only LEVEL EDITOR
 * (src/dev/) calls send()/ask() but is itself never bundled in production.
 */
export interface ManorBridge {
  send(command: EditorCommand): void;
  ask<Q extends EditorQuery>(query: Q): QueryResult<Q>;
}
