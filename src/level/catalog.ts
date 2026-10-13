/**
 * Theme sprite catalog — curated per-pack vocabularies for prompts,
 * validation, and the fallback generator. Full file lists live in
 * public/<pack>/Isometric; these are the coherent subsets the game
 * actually uses (one ground family + one wall family per theme so
 * AI rooms don't mix dungeon walls with farm fences).
 *
 * Sprite ids are pack-qualified: "pack:base" (= S facing) or
 * "pack:base:DIR", e.g. "dungeon:chestClosed:S". ONLY real theme
 * packs are valid level art — the prototype pack is legacy (v1 demo
 * rooms) and the validator rejects it in levels. Bare ids ("crate")
 * still resolve to prototype URLs for those legacy rooms only.
 *
 * This catalog IS the model's build environment: the prompt lists
 * exactly these bases, the validator accepts exactly these sprites,
 * and the game preloads exactly these files. The three can never drift.
 */

import type { LevelTheme } from './types';

export const PACK_DIR: Record<LevelTheme, string> = {
  dungeon: 'dungeon_sprites',
  library: 'library_sprites',
  farm: 'farm_sprites',
  base: 'base_sprites',
};

/** Public URL folder for a theme pack (Vite BASE_URL aware). */
export function packBase(theme: LevelTheme): string {
  return `${import.meta.env.BASE_URL}${PACK_DIR[theme]}/Isometric`;
}

export interface ThemeCatalog {
  theme: LevelTheme;
  grounds: string[];
  walls: string[];
  furniture: string[];
  pickups: string[];
  defaultChaser: string;
}

export const THEME_CATALOGS: Record<LevelTheme, ThemeCatalog> = {
  dungeon: {
    theme: 'dungeon',
    grounds: ['stone', 'stoneTile', 'dirt', 'dirtTiles', 'planks'],
    walls: [
      'stoneWall',
      'stoneWallDoor',
      'stoneWallDoorClosed',
      'stoneWallDoorOpen',
      'stoneWallArchway',
      'stoneWallWindow',
      'stoneWallCorner',
      'stoneWallHalf',
    ],
    furniture: [
      'barrel',
      'barrelsStacked',
      'woodenCrate',
      'tableRound',
      'tableShort',
      'stoneColumn',
      'stoneColumnWood',
      'bridge',
    ],
    pickups: ['chestClosed', 'chestOpen', 'barrel', 'woodenCrate'],
    defaultChaser: 'dungeon:barrel:S',
  },
  library: {
    theme: 'library',
    grounds: ['floorCarpet', 'floorCarpetSmall', 'floorCarpetEnd'],
    walls: ['wallBooks', 'wallDoorway'],
    furniture: [
      'bookcaseBooks',
      'bookcaseWideBooks',
      'bookcaseHalfBooks',
      'longTable',
      'longTableLarge',
      'libraryChair',
      'displayCase',
      'bookStand',
    ],
    pickups: ['bookStand', 'candleStand', 'displayCaseBooks', 'displayCaseSword'],
    defaultChaser: 'library:bookcaseFallen:S',
  },
  farm: {
    theme: 'farm',
    grounds: ['dirt', 'dirtFarmland', 'planks'],
    walls: [
      'woodWall',
      'woodWallCorner',
      'woodWallDoorClosed',
      'woodWallDoorOpen',
      'woodWallDoorway',
      'woodWallWindow',
      'fenceLow',
      'fenceHigh',
    ],
    furniture: ['hayBales', 'sack', 'sacksCrate', 'cornDouble', 'ladderStand', 'planksHigh'],
    pickups: ['corn', 'cornDouble', 'sack', 'hay'],
    defaultChaser: 'farm:hayBales:S',
  },
  base: {
    theme: 'base',
    grounds: ['base_grass_flat', 'base_grass_detail', 'square_grass_flat', 'base_stone_flat'],
    walls: [],
    furniture: ['base_grass_high', 'square_stone_high', 'base_stone_high', 'base_wood_high'],
    pickups: ['base_grass_high_detail', 'square_stone_high_detail'],
    defaultChaser: 'base_grass_high:S',
  },
};

/** "dungeon:chestClosed:S" -> { pack, base, dir }. Bare ids -> prototype. */
export function parseEntitySprite(sprite: string): {
  pack: LevelTheme | 'prototype';
  base: string;
  dir: 'N' | 'E' | 'S' | 'W';
} {
  const parts = sprite.split(':');
  if (parts.length === 1) return { pack: 'prototype', base: parts[0], dir: 'S' };
  if (parts.length === 2) {
    const [a, b] = parts;
    if (a === 'dungeon' || a === 'library' || a === 'farm' || a === 'base') {
      return { pack: a, base: b, dir: 'S' };
    }
    const d = b.toUpperCase();
    return { pack: 'prototype', base: a, dir: d === 'N' || d === 'E' || d === 'W' ? d : 'S' };
  }
  const [pack, base, d] = parts;
  const dir = d.toUpperCase() === 'N' || d.toUpperCase() === 'E' || d.toUpperCase() === 'W' ? d.toUpperCase() : 'S';
  if (pack === 'dungeon' || pack === 'library' || pack === 'farm' || pack === 'base') {
    return { pack, base, dir: dir as 'N' | 'E' | 'S' | 'W' };
  }
  return { pack: 'prototype', base, dir: 'S' };
}

/** File URL for an entity sprite (theme pack or prototype fallback). */
export function entitySpriteUrl(sprite: string): string {
  const b = import.meta.env.BASE_URL;
  const { pack, base, dir } = parseEntitySprite(sprite);
  if (pack === 'prototype') return `${b}prototype_sprites/Isometric/${base}_${dir}.png`;
  return `${b}${PACK_DIR[pack]}/Isometric/${base}_${dir}.png`;
}

/** Every usable sprite id, "pack:base" form (all four facings exist on disk). */
export const KNOWN_SPRITES: Set<string> = new Set(
  (Object.keys(THEME_CATALOGS) as LevelTheme[]).flatMap((theme) => {
    const c = THEME_CATALOGS[theme];
    return [...c.grounds, ...c.walls, ...c.furniture, ...c.pickups].map((b) => `${theme}:${b}`);
  }),
);

/** True only for real theme-pack sprites in the curated vocabulary. */
export function isKnownSprite(sprite: string): boolean {
  const { pack, base } = parseEntitySprite(sprite);
  if (pack === 'prototype') return false;
  return KNOWN_SPRITES.has(`${pack}:${base}`);
}

/** Pack-qualified bases for palettes and filters ("dungeon:stone", …). */
export const CATALOG_BASES: string[] = [...KNOWN_SPRITES].sort();

/** Small curated quick-pick list for the dev editor. */
export const QUICK_PACK_PROPS: string[] = [
  'dungeon:woodenCrate',
  'dungeon:barrel',
  'dungeon:stoneColumn',
  'dungeon:chestClosed',
  'library:bookcaseBooks',
  'library:longTable',
  'library:displayCase',
  'farm:hayBales',
  'farm:sack',
  'farm:cornDouble',
  'base:base_grass_high',
  'base:square_stone_high',
];

/**
 * Editor-friendly split: base keeps the pack prefix ("dungeon:chestClosed"
 * or legacy "crate"), dir is the facing. Round-trips through
 * spriteCatalog.propSpriteId(base, dir).
 */
export function editorBaseDir(sprite: string): { base: string; dir: 'N' | 'E' | 'S' | 'W' } {
  const { pack, base, dir } = parseEntitySprite(sprite);
  if (pack === 'prototype') {
    const i = sprite.indexOf(':');
    return { base: i < 0 ? sprite : sprite.slice(0, i), dir };
  }
  return { base: `${pack}:${base}`, dir };
}

/** Thumbnail URL for editor palettes (real packs + legacy prototype). */
export function entityThumb(sprite: string): string {
  const b = import.meta.env.BASE_URL;
  const { pack, base, dir } = parseEntitySprite(sprite);
  if (pack === 'prototype') {
    const i = sprite.indexOf(':');
    const bare = i < 0 ? sprite : sprite.slice(0, i);
    return `${b}prototype_sprites/Isometric/${bare}_${dir}.png`;
  }
  return `${b}${PACK_DIR[pack]}/Isometric/${base}_${dir}.png`;
}

/** Phaser texture key for a real-pack sprite (matches preloadSpritesForTheme). */
export function levelTextureKey(theme: LevelTheme, base: string, dir: string): string {
  return `lvl_${theme}_${base}_${dir}`;
}

export interface PreloadSprite {
  /** Phaser texture key. */
  key: string;
  /** path relative to public/ (caller prefixes its base URL). */
  file: string;
}

/**
 * Every texture the game must preload for a theme: all curated bases in
 * all four facings. Pure (base URL injected) so level-lab can assert the
 * preload set covers the prompt vocabulary exactly.
 */
export function preloadSpritesForTheme(theme: LevelTheme, keyPrefix: string): PreloadSprite[] {
  const out: PreloadSprite[] = [];
  for (const base of CATALOG_BASES) {
    const [pack, name] = base.split(':');
    if (pack !== theme) continue;
    for (const dir of ['N', 'E', 'S', 'W']) {
      out.push({ key: `${keyPrefix}_${name}_${dir}`, file: `${PACK_DIR[theme]}/Isometric/${name}_${dir}.png` });
    }
  }
  return out;
}

/**
 * Character actors (player + chasers) — the dungeon pack's Male set is
 * the only real character art across all four packs, so every theme uses
 * it (tinted per role at render time). 8 facings, 10 run frames + idle.
 */
export const CHARACTER_SET = {
  folder: 'dungeon_sprites/Characters/Male',
  prefix: 'Male',
  facings: [0, 1, 2, 3, 4, 5, 6, 7],
  runFrames: 10,
} as const;
