# Tile system + art assets

Single rule: **one ground sprite = one tile; entities stand ON tiles**
(feet on the diamond center), never on vertices or edges.

## Compass (Kenney pack, `Information.png`)

| Dir | Grid step | Screen direction | Human facing |
|---|---|---|---|
| N | `(0, -1)` | up-right | `0` |
| E | `(+1, 0)` | down-right | `2` |
| S | `(0, +1)` | down-left | `4` |
| W | `(-1, 0)` | up-left | `6` |

Screen-straight moves (up/down/left/right) hit tile *vertices* — they are
not tile moves and `tryStep` rejects them (`isIsoStep`: `|dx|+|dy| === 1`).

## Anchors (all in `src/movement/IsoTiles.ts`)

- Displayed diamond: `TILE_W × TILE_H` = `64 × 32` (native 256×128 × 0.25).
- `tileToScreen(x, y)` → diamond **center** (ground plane).
- `tileFootScreen(x, y)` → image-bottom anchor (`origin 0.5, 1`) = center +
  `TILE_H/2` (front vertex). Feet sit ~14px above the image bottom, so this
  lands feet on the center. **Spawn and every step must use it.**
- `screenToTile` = pure ground-plane inverse (pointer/hover). Foot-anchored
  sprite positions convert via `tileFromFoot` (subtracts the anchor first —
  the old code forgot this and shifted every click half a tile).
- `makeProjection(tileW)` binds all five helpers to one width (game 64,
  menu 112, preview 256) — the only tile-projection home; the preview
  placement mirror must equal `makeProjection(256)` (gated).
- `depthFor(x, y, layer)` = `(x+y)*10 + layer` (painter's order).

## ASCII legend (`TILE_BRUSHES` in `src/rooms/spriteCatalog.ts`)

`#` wall · `.` floor · `S` spawn · `E`/`P` door floor · `>` stairs (ascend
grid-north) · `G` window wall · `T` table · `B` shelf · `D` desk · `d` bed ·
`W` water · `C` clock · `R` railing. Walkable: `. S E P >` (+ `walk` map and
`walkable: false` props override in `GameScene.rebuildGrid`).

## Autotile rules (`src/core/GameScene.ts`)

- **Walls** (`wallVariantFor`): back runs (interior to the SE) full height,
  front runs low `fence` rails; `wallCorner` for 90° joins only.
- **Doors** (`groupDoorTiles` + `doorSpriteFor`): contiguous `E`/`P` tiles are
  ONE opening. Linear runs → connected frame (`doorwayLeft/Center/Right`)
  + single leaf arch (`doorOpen`/`doorClosed`); 2×2 blocks/L-shapes → solo
  arch on the primary tile, rest plain floor. Walls treat door tiles as
  run-continuers so jambs meet flush.
- **Stairs** (`stairVariantFor`): wide interiors use `stairsOpen` (no doubled
  side walls); tiles stacked upward use `steps` (continuation treads, not
  restarted flights); y-columns face `E`, else `S`.
- **Props**: `walkable: false` blocks the tile. Never place standing props
  on wall tiles (wall depth `0.15` > prop `0.1` hides them).

⚠️ `scripts/iso-preview.mjs` re-implements all three variant functions —
keep both copies in sync (both files say `MUST match`).

## Using the art assets

- Pack layout: `public/prototype_sprites/Isometric/<base>_<N|E|S|W>.png`
  (256×512 each, diamond footprint at the image bottom),
  `Characters/Human/Human_<0-7>_<Idle0|Run0-9|Pickup0-9>.png`.
- Sprite ids are `base` (= S facing) or `base:DIR` (`RoomProp.sprite`);
  `parsePropSprite` / `propSpriteId` in `spriteCatalog.ts` are the only
  parsers. Legacy bare ids (`crate`, `block`, `slab`, `fence`) still resolve.
- `SPRITE_BASES` is the preload + editor-palette source of truth. **Adding a
  sprite**: drop the 4 facing PNGs in the pack folder, append the base to
  `SPRITE_BASES` — `GameScene.preload` and the editor pick it up, no other
  code changes.
- **Verify without booting**: export the room (editor → JSON or hand-write
  `{tiles, portals, props}`) and run
  `node scripts/iso-preview.mjs room.json out.png`. Check stairs read as one
  flight, door openings as one frame+leaf, no floating lintels.
- The menu diorama (`src/ui/MenuScene.tsx`) reuses the same sprites/anchors
  in pure React (112×56 diamonds); its placement table is the example to copy
  for any future React-side iso composition.
