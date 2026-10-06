export type LockKey = 'servant' | 'master' | 'kitchen';

export interface Portal {
  /** tile in the source room that triggers the jump */
  from: { x: number; y: number };
  /** destination room + spawn tile */
  toRoom: string;
  to: { x: number; y: number };
  label?: string;
  /** if set, the door blocks with a message until the key is unlocked */
  lockedBy?: LockKey;
}

/**
 * Free-placed decor/prop sprite (data only — no dev dependency).
 * Rendered on top of the tilemap at (x, y); `walkable: false` means it
 * blocks movement (adds a Grid override in GameScene).
 */
export interface RoomProp {
  id: string;
  /**
   * Isometric sprite id: a base from the Kenney Isometric set plus an
   * optional facing — 'crate' (= S), 'wall:N', 'doorway:E', …
   * Legacy Angle-era ids ('crate', 'block', 'slab', 'fence') still render.
   */
  sprite: string;
  x: number;
  y: number;
  walkable: boolean;
}

export interface RoomDef {
  id: string;
  name: string;
  /** ascii map: '#' wall, '.' floor, 'S' spawn, 'E'/'P' door floor */
  tiles: string[];
  spawn: { x: number; y: number };
  portals: Portal[];
  flavor?: string;
  /** optional decor sprites placed by the (dev-only) level editor */
  props?: RoomProp[];
}

export interface RoomTransition {
  roomId: string;
  spawn: { x: number; y: number };
  viaPortal?: Portal;
}

/** Registry of rooms for the current profile (prod or dev). */
export class RoomRegistry {
  private rooms = new Map<string, RoomDef>();

  register(room: RoomDef): void {
    this.rooms.set(room.id, room);
  }

  get(id: string): RoomDef | undefined {
    return this.rooms.get(id);
  }

  ids(): string[] {
    return [...this.rooms.keys()];
  }

  /** Portal sitting on tile (x,y) in room `roomId`, if any. */
  portalAt(roomId: string, x: number, y: number): Portal | undefined {
    return this.get(roomId)?.portals.find((p) => p.from.x === x && p.from.y === y);
  }
}
