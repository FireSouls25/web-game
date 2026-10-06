/**
 * Shared sprite catalog for the Kenney prototype pack (Isometric set).
 * Single source of truth for GameScene preloading + LevelEditor palette.
 * DEV-only UI imports this; prod GameScene imports only the constants
 * it needs (still prod-safe, data only).
 */

export const ISO_DIR = 'Isometric';
export const DIRS_4 = ['N', 'E', 'S', 'W'] as const;
export type IsoDir = (typeof DIRS_4)[number];

/** Every base sprite name present in public/prototype_sprites/Isometric. */
export const SPRITE_BASES = [
  'arrow',
  'arrowWall',
  'block',
  'blockAngle',
  'blockHalf',
  'blockQuarter',
  'column',
  'columnBlocks',
  'columnCorner',
  'crate',
  'doorClosed',
  'doorOpen',
  'doorway',
  'doorwayBottom',
  'doorwayCenter',
  'doorwayLeft',
  'doorwayLeftBottom',
  'doorwayMiddle',
  'doorwayMiddleBottom',
  'doorwayRight',
  'doorwayRightBottom',
  'fence',
  'floor',
  'floorHalf',
  'floorQuarter',
  'ladder',
  'pole',
  'poleGroup',
  'slab',
  'slabAngle',
  'slabHalf',
  'slabQuarter',
  'slope',
  'slopeHalf',
  'slopeQuarter',
  'sloperCornerInner',
  'sloperCornerOuter',
  'slopeSmall',
  'stairs',
  'stairsCornerInner',
  'stairsCornerOuter',
  'stairsOpen',
  'stairsOpenCornerInner',
  'stairsOpenCornerOuter',
  'steps',
  'switchFloorOff',
  'switchFloorOn',
  'switchWallOff',
  'switchWallOn',
  'wall',
  'wallBattlement',
  'wallCorner',
  'wallCornerHalf',
  'wallCurve',
  'wallCurveHalf',
  'wallHalf',
  'window',
  'windowLeft',
  'windowMiddle',
  'windowRight',
] as const;

export type SpriteBase = (typeof SPRITE_BASES)[number];

/** Prop sprite id used by RoomProp.sprite: "base" (= S facing) or "base:DIR". */
export function parsePropSprite(sprite: string): { base: string; dir: IsoDir } {
  const i = sprite.indexOf(':');
  if (i < 0) return { base: sprite, dir: 'S' };
  const dir = sprite.slice(i + 1).toUpperCase();
  const d: IsoDir = dir === 'N' || dir === 'E' || dir === 'W' ? (dir as IsoDir) : 'S';
  return { base: sprite.slice(0, i), dir: d };
}

export function propSpriteId(base: string, dir: IsoDir): string {
  return dir === 'S' ? base : `${base}:${dir}`;
}

/** File URL for a palette thumbnail (always exists for listed bases). */
export function thumbUrl(base: string, dir: IsoDir = 'S'): string {
  const b = import.meta.env.BASE_URL;
  return `${b}prototype_sprites/${ISO_DIR}/${base}_${dir}.png`;
}

/**
 * ASCII tile legend: char -> tile sprite + default walkability.
 * Matches Grid.fromAscii walkable set ['.', 'S', 'E', 'P', '>'].
 */
export interface TileBrush {
  ch: string;
  label: string;
  walkable: boolean;
}

export const TILE_BRUSHES: TileBrush[] = [
  { ch: '#', label: '# wall — autotiled (blocked)', walkable: false },
  { ch: '.', label: '. floor (walk)', walkable: true },
  { ch: 'S', label: 'S spawn tile (walk)', walkable: true },
  { ch: 'E', label: 'E door (walk)', walkable: true },
  { ch: 'P', label: 'P door (walk)', walkable: true },
  { ch: '>', label: '> stairs, ascend north (walk)', walkable: true },
  { ch: 'G', label: 'G window wall, N-runs (blocked)', walkable: false },
  { ch: 'T', label: 'T table/plinth (blocked)', walkable: false },
  { ch: 'B', label: 'B shelf/block (blocked)', walkable: false },
  { ch: 'D', label: 'D desk/piano (blocked)', walkable: false },
  { ch: 'd', label: 'd bed (blocked)', walkable: false },
  { ch: 'W', label: 'W water (blocked)', walkable: false },
  { ch: 'C', label: 'C clock (blocked)', walkable: false },
  { ch: 'R', label: 'R railing → fence rail (blocked)', walkable: false },
];

/** Small curated default prop list; the editor shows the full catalog too. */
export const QUICK_PROPS: string[] = [
  'crate',
  'column',
  'stairs',
  'doorway',
  'wall',
  'window',
  'fence',
  'slab',
  'block',
  'arrow',
  'ladder',
  'pole',
];
