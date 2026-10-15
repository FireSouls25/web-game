# Diagnosis & Required Fixes: Isometric Sprite Positioning, Walls, Corners, Ground, and Dynamic Generation

## 1. Root Cause: 2D Sprites Emulating a 3D Isometric Volume

All Kenney Isometric Miniature sprites (`dungeon_sprites`, `library_sprites`, `farm_sprites`, `base_sprites`) are `256×512` PNGs anchored at the bottom-center of a `256×128` ground diamond:

- **Top vertex (NW grid corner `(x, y)`)**: `(128, 384)`
- **Right vertex (NE grid corner `(x + 1, y)`)**: `(256, 448)`
- **Left vertex (SW grid corner `(x, y + 1)`)**: `(0, 448)`
- **Bottom vertex (SE grid corner `(x + 1, y + 1)`)**: `(128, 512)`

In `src/movement/IsoTiles.ts` (`tileToScreen`):
- **`+x` (East)** steps **down-right** on screen (`+128px, +64px` at native scale).
- **`+y` (South)** steps **down-left** on screen (`-128px, +64px` at native scale).

### Crucial 3D Geometry Fact: Wall Facings Sit on Specific Tile Edges
Directional wall, doorway, and fence sprites do **not** sit on the center of their tile diamond. Each directional variant sits flush against **one outer edge** of the tile diamond, with its thickness protruding *inward* into the tile and its front face pointing toward the named compass direction:

| Facing suffix | Edge of tile `(x, y)` | Pixel span in `256×512` PNG | Which room border it belongs to |
|---|---|---|---|
| **`:S`** | **Top-Right (NE) edge** `(x,y) → (x+1,y)` | `x: 95..255, y: 220..464` | **Top-right border** (`y = 0`, `interior = 'S'`) |
| **`:E`** | **Top-Left (NW) edge** `(x,y) → (x,y+1)` | `x: 0..160, y: 220..464` | **Top-left border** (`x = 0`, `interior = 'E'`) |
| **`:N`** | **Bottom-Left (SW) edge** `(x,y+1) → (x+1,y+1)` | `x: 0..160, y: 275..512` | **Bottom-left border** (`y = H - 1`, `interior = 'N'`) |
| **`:W`** | **Bottom-Right (SE) edge** `(x+1,y) → (x+1,y+1)` | `x: 95..255, y: 275..512` | **Bottom-right border** (`x = W - 1`, `interior = 'W'`) |

---

## 2. Diagnosis of Visual Bugs in Screenshots

### Bug A: Misaligned Walls, Doors, and Protruding Floor Strips (`src/level/themeRender.ts`)
**Observed in both screenshots:**
- An extra strip of floor (`dirt` in Farm, `planks` in Library) sticks out into the black void outside the bottom-left (`y = H - 1`) and top-left (`x = 0`) walls.
- At the bottom-left and bottom-right corners next to the exit door (`E`), the south wall and door are offset by a full tile edge from the side walls.

**Why it happens:**
1. `themeWallFor` in `src/level/themeRender.ts` forces **all** x-runs (`y = 0` *and* `y = H - 1`) to use `:S` (the **NE / inner** edge of `y = H - 1`) instead of using `:N` (the **SW / outer** edge) when `y = H - 1` (`interior === 'N'`).
2. `themeWallFor` forces y-runs (`x = 0` *and* `x = W - 1`) in `dungeon`, `farm`, and `base` to use `:W` (the **SE** edge). On the left border (`x = 0`, `interior === 'E'`), `:W` places the wall on the **inner** edge between `x = 0` and `x = 1`, leaving tile `(0, y)`'s floor sticking out to the NW, and causing tile `(0, H - 1)` to shoot one full tile past the south wall.
3. On the right border (`x = W - 1`), `:W` is on the **outer** SE edge (`x = W`), whereas on the south border (`y = H - 1`), `:S` is on the **inner** NE edge (`y = H - 1`). Where they meet at `(W - 1, H - 1)` (right next to the exit door at `(W - 3, H - 1)`), the south wall is on line `y = H - 1` while the corner/east wall jumps to line `y = H`, creating a full-tile gap/drop right next to the door.
4. `themeExitSprites` in `src/level/themeRender.ts` hardcodes `:S` (`stoneWallDoorClosed:S`, `woodWallDoorClosed:S`, `wallDoorway:S`) for the exit door on row `y = H - 1`. Because the exit door sits in the south border (`y = H - 1`, `interior === 'N'`), it must use **`:N`** (`stoneWallDoorClosed:N`, `stoneWallDoorOpen:N`, `woodWallDoorClosed:N`, `woodWallDoorOpen:N`, `wallDoorway:N`) so the door frame sits on the outer SW edge flush with `:N` south border walls and swings open into the room.

---

### Bug B: Wrong Corner Orientations in Dungeon / Library (`src/level/themeRender.ts`)
**Observed in Screenshot 1 (`library`):**
- At the left corner `(0, H - 1)`, the stone corner piece turns up-left into empty space instead of turning down-right along the bottom-left wall.
- At the bottom corner `(W - 1, H - 1)`, the stone corner piece is an inverted `^` pointing **into** the room instead of wrapping around the bottom vertex `V`.

**Why it happens:**
Each `stoneWallCorner` sprite combines two specific outer edges of a tile diamond:
- **`stoneWallCorner:S`** (`^` at top vertex): combines `:E` (NW edge) + `:S` (NE edge) → **top corner `(0, 0)`** (`e && s`).
- **`stoneWallCorner:W`** (`>` at right vertex): combines `:S` (NE edge) + `:W` (SE edge) → **right corner `(W - 1, 0)`** (`s && w`).
- **`stoneWallCorner:E`** (`<` at left vertex): combines `:E` (NW edge) + `:N` (SW edge) → **left corner `(0, H - 1)`** (`n && e`).
- **`stoneWallCorner:N`** (`V` at bottom vertex): combines `:N` (SW edge) + `:W` (SE edge) → **bottom corner `(W - 1, H - 1)`** (`w && n`).

In `src/level/themeRender.ts` (lines 136–138 and 153–155), the corner table was written as:
```ts
if (e && s) return `${cid}:S`;
if (w && n) return `${cid}:S`; // BUG: should be :N
return `${cid}:W`;             // BUG: (n && e) should be :E, only (s && w) is :W
```
This put `:S` (top corner `^`) at the bottom corner `(w && n)` and `:W` (right corner `>`) at the left corner `(n && e)`.

---

### Bug C: Missing 2-Edge L-Corners in Farm (`src/level/themeRender.ts` & `src/core/LevelScene.ts`)
**Observed in Screenshot 2 (`farm`):**
- At `(W - 1, H - 1)` and `(0, H - 1)`, the wooden walls do not close the corner.

**Why it happens:**
`farm_sprites` has no single-PNG merged L-corner (`woodWallCorner` is only a narrow 24px post). Each `woodWall` sprite covers only **one** edge of a tile diamond. When a corner tile `(0, 0)`, `(W - 1, 0)`, `(0, H - 1)`, or `(W - 1, H - 1)` renders only one `woodWall` sprite, the other outer edge of that corner tile is left completely open.
- A corner tile in `farm` must render **both** outer-edge wall panels on that tile:
  - `(e && s)` at `(0, 0)`: `['farm:woodWall:E', 'farm:woodWall:S']`
  - `(s && w)` at `(W - 1, 0)`: `['farm:woodWall:S', 'farm:woodWall:W']`
  - `(n && e)` at `(0, H - 1)`: `['farm:woodWall:E', 'farm:woodWall:N']`
  - `(w && n)` at `(W - 1, H - 1)`: `['farm:woodWall:W', 'farm:woodWall:N']`

---

### Bug D: Wrong Wall Usage in Library (`bookcaseHalfBooks` on Front Borders)
**Observed in Screenshot 1 (`library`):**
- The bottom-left (`y = H - 1`) and bottom-right (`x = W - 1`) walls are rendered as a row of small, disconnected half-bookcases (`bookcaseHalfBooks:S` / `:E`) with gaps between every tile, and when the row reaches `wallDoorway` at `E`, the doorway jumps half a tile away from the bookcases.

**Why it happens:**
- `src/level/themeRender.ts` (lines 125–128) substitutes `library:bookcaseHalfBooks:S` and `library:bookcaseHalfBooks:E` whenever `interior === 'N'` or `interior === 'W'`.
- `bookcaseHalfBooks` is a **freestanding interior furniture prop** (`144×134+51+337`, centered on the tile diamond), **not** an edge-aligned wall piece (`161×237`).
- `library:wallBooks:N` and `library:wallBooks:W` (or `dungeon:stoneWall:N`/`W` and `dungeon:stoneWallHalf:N`/`W`) are the actual edge-aligned masonry wall pieces that match `stoneWallCorner` and `wallDoorway`.

---

### Bug E: Ground Layer Depth-Sorting & Floor Tile Selection (`src/core/LevelScene.ts` & `src/level/themeRender.ts`)
**Observed in Screenshot 1 & 2:**
1. **Floor slabs clipping over wall/bookcase bases**:
   - In `src/core/LevelScene.ts` (line 227), ground tiles are placed with `this.put(x, y, groundKey, -2)`, which computes `depthFor(x, y, -2) = (x + y) * 10 - 2`.
   - For tile `(x + 1, y)` or `(x, y + 1)`, the ground depth is `(x + y + 1) * 10 - 2 = (x + y) * 10 + 8`, which is **greater** than the wall/prop depth at `(x, y)` (`(x + y) * 10 + 0.15`).
   - Because floor sprites (`stone_S`, `planks_S`, `dirt_S`) have a 3D slab thickness whose top vertex extends 11–20px above `y = 384` (`stone_S` reaches `y = 364`), the ground tile at `(x + 1, y)` / `(x, y + 1)` draws **on top of** the bottom moulding/plinth of walls and props at `(x, y)`, creating sawtooth floor overlaps along back walls.
2. **Library floor using `dungeon:planks:S` everywhere**:
   - `dungeon:planks:S` has transparent slits between boards (showing dark void) and looks like rough mine scaffolding when tiled across an entire library.
   - In Kenney's `public/library_sprites/Sample.png`, the library floor is **`dungeon:stone`** (with `stoneInset` / `stoneTile` accents) and **`library:floorCarpet` / `floorCarpetSmall` / `floorCarpetEnd`** runner rugs (`194×98+31+397`) laid **on top of** the stone floor. (`floorCarpet` was previously misdiagnosed as "floating" only because it was tested *without* a stone floor tile underneath.)
3. **Base theme floor gaps**:
   - `base:square_grass_flat:S` is a `180×104` octagonal miniature pedestal, smaller than the `256×128` tile diamond. Rendering it alone leaves 76px of transparent void around every tile. It requires a full `256×128` substrate tile (`dungeon:stone:S`) underneath.
4. **Monotonous single-tile ground**:
   - Every theme currently repeats a single ground sprite in a single facing (`:S`) across the entire grid, instead of using deterministic tile variations (`stone` / `stoneUneven` / `stoneInset` / `stoneTile`, `dirt` with `N/E/S/W` rotations, `dirtFarmland` patches under crops, `planks` porches/walkways).

---

### Bug F: Static, Sparse Environments & Prop Positioning (`src/level/catalog.ts`, `fallback.ts`, `prompt.ts`)
1. **Underused structural & multi-tile sprites**:
   - The asset packs contain rich architectural and environmental pieces that are either excluded from `THEME_CATALOGS` or never placed by `fallback.ts` / `prompt.ts`:
     - **Houses & barns (`farm`)**: `woodWallWindow`, `woodWallWindowGlass`, `woodWallCross`, `woodWallDiagional`, `woodWallGateClosed`, `roof`, `roofCorner`, `roofSingle`, `roofSingleWall`, `chimneyBase`, `chimneyTop`, `planks`, `planksHigh`, `planksHighSlope`, `fenceLow`, `fenceHigh`.
     - **Walls, arches & timber supports (`dungeon`)**: `stoneWallWindow`, `stoneWallWindowBars`, `stoneWallArchway`, `stoneWallColumn`, `stoneWallStructure` (wall with timber pergola), `stoneWallAged`, `stoneWallHalf`, `woodenSupports`, `woodenSupportsBeam`, `woodenSupportsBlock`.
     - **Stairs & elevation cues (`dungeon`, `farm`)**: `stairs`, `stairsAged`, `stairsSpiral`, `stoneSteps`, `stoneStep`, `planksHighSlope`, `ladderStand`.
     - **Library furnishings (`library`)**: `bookcaseBooksLadder`, `bookcaseWideBooks`, `bookcaseWideBooksDesk`, `longTableChairs`, `longTableDecoratedChairsBooks`, `floorCarpet`, `floorCarpetSmall`, `floorCarpetEnd`, `candleStandDouble`.
2. **Wide / Multi-tile prop footprints & facings**:
   - Wide sprites (`bookcaseWideBooks`, `longTableLarge`, `longTableDecoratedChairsBooks`, `barrelsStacked`) visually span 2 tiles along their axis (`S`/`N` spans `(x, y)` and `(x - 1, y)` or `(x + 1, y)`; `E`/`W` spans `(x, y)` and `(x, y + 1)`), and directional props (bookcases, tables, chairs, stairs, house walls) must face **into** the room or along walls rather than always defaulting to `:S` in the middle of the floor.
   - `fallback.ts` currently only places isolated 1×1 blockers from a 3-item `blockers` array at random floor coordinates, never placing interior wall runs, house structures, stair flights, carpet runners, or wall-aligned bookshelves.

---

## 3. Required Fixes

### Fix 1: Correct Wall, Corner, and Exit Door Rules in `src/level/themeRender.ts`
1. **Border & interior wall facings**:
   - X-runs (`alongX && !alongY`):
     - If `interior === 'N'` (south border `y = H - 1`): face **`:N`** (outer SW edge).
     - Otherwise (`interior === 'S'` or interior x-run): face **`:S`** (outer NE edge).
   - Y-runs (`alongY && !alongX`):
     - If `interior === 'W'` (east border `x = W - 1`): face **`:W`** (outer SE edge).
     - Otherwise (`interior === 'E'` or interior y-run): face **`:E`** (outer NW edge).
   - Library front borders (`interior === 'N'` and `interior === 'W'`):
     - Replace `library:bookcaseHalfBooks:S` / `:E` with real edge-aligned walls (`library:wallBooks:N` and `library:wallBooks:W`, or `dungeon:stoneWallHalf:N` / `:W`), so the perimeter wall sits on the outer edge and aligns with `wallDoorway:N` and `stoneWallCorner`.
2. **L-Corner mapping (`count === 2` with orthogonal neighbors)**:
   - `(e && s)` → `stoneWallCorner:S` (or for `farm`: `['farm:woodWall:E', 'farm:woodWall:S']`)
   - `(s && w)` → `stoneWallCorner:W` (or for `farm`: `['farm:woodWall:S', 'farm:woodWall:W']`)
   - `(n && e)` → `stoneWallCorner:E` (or for `farm`: `['farm:woodWall:E', 'farm:woodWall:N']`)
   - `(w && n)` → `stoneWallCorner:N` (or for `farm`: `['farm:woodWall:W', 'farm:woodWall:N']`)
   - Export `themeWallsFor(theme, x, y, isWall, interior): string[]` so `LevelScene` renders both edge panels on 2-edge `farm` / `base` corners while keeping `themeWallFor` returning the primary sprite string.
3. **Exit door orientation (`themeExitSprites`)**:
   - Since the exit `E` sits in the south border wall (`y = H - 1`, `interior === 'N'`), return **`:N`** door sprites (`dungeon:stoneWallDoorClosed:N` / `stoneWallDoorOpen:N`, `farm:woodWallDoorClosed:N` / `woodWallDoorOpen:N`, `library:wallDoorway:N` or `dungeon:stoneWallDoorClosed:N` → `library:wallDoorway:N`) so the door frame aligns flush with the `:N` south wall run.
4. **Deterministic wall variation**:
   - Allow straight border/interior runs to deterministically mix theme-appropriate wall variants (e.g., `stoneWallWindow`, `stoneWallAged`, `stoneWallColumn` in `dungeon`; `woodWallCross`, `woodWallWindow` in `farm`) without breaking run continuity.

### Fix 2: Fix Ground Depth Sorting & Multi-Tile Ground Rendering in `src/core/LevelScene.ts` & `src/level/themeRender.ts`
1. **Separate ground depth plane**:
   - In `LevelScene.ts`, render ground tiles at `layer = -1000` (so `depthFor(x, y, -1000) = (x + y) * 10 - 1000`).
   - Ground tiles still sort back-to-front (`x + y`) against adjacent ground slabs, but **never** sort above walls (`layer = 0.15`), props (`layer = 0.12`), or actors (`layer = 0.2`) on earlier tiles.
2. **Upgrade ground selection (`themeGround` / `themeGroundsAt`)**:
   - **Library**: Use `dungeon:stone:S` (with `stoneInset` / `stoneTile` accents) as the base floor instead of `dungeon:planks:S`, and lay `library:floorCarpet` / `floorCarpetSmall` / `floorCarpetEnd` runners on top of the stone floor at `layer = -500`.
   - **Dungeon**: Mix `stone`, `stoneUneven`, `stoneInset`, `stoneTile`, and `dirtTiles` deterministically across the floor, with `planks` on bridge/walkway runs.
   - **Farm**: Rotate `dirt` facings (`N/E/S/W`) to break up texture striping, place `farm:planks` porch tiles in front of the exit door / house walls, and place `farm:dirtFarmland` patches under crop pickups/props.
   - **Base**: Render a `dungeon:stone:S` substrate under `base:square_*` tiles so the `180×104` octagonal pads sit on solid stone with zero void gaps.

### Fix 3: Expand `THEME_CATALOGS` and Make Level Generation Dynamic (`src/level/catalog.ts`, `src/level/fallback.ts`, `src/level/prompt.ts`)
1. **Expand `THEME_CATALOGS` (`src/level/catalog.ts`)**:
   - Add the structural, stair, house, and decor sprites (`stairs`, `stairsSpiral`, `stoneSteps`, `stoneWallArchway`, `stoneWallWindow`, `stoneWallAged`, `stoneWallColumn`, `stoneWallStructure`, `woodenSupports`, `tableRoundChairs`, `tableShortChairs` in `dungeon`; `bookcaseBooksLadder`, `bookcaseWideBooksDesk`, `longTableChairs`, `longTableDecoratedChairsBooks`, `floorCarpet`, `floorCarpetSmall`, `floorCarpetEnd`, `candleStandDouble` in `library`; `woodWallCross`, `woodWallWindow`, `woodWallGateClosed`, `roofSingleWall`, `roof`, `chimneyBase`, `planksHighSlope`, `hayBalesStacked`, `cornYoung`, `cornYoungDouble` in `farm`; `square_stone_flat`, `square_wood_flat`, `square_grass_detail`, `square_stone_detail` in `base`).
2. **Improve `fallbackLevel` (`src/level/fallback.ts`)**:
   - Generate archetype-driven interior architecture (e.g., 3+-tile interior wall segments / L-walls / ruins for `maze`, `vault`, and `gauntlet`).
   - Place theme-specific structural ensembles with accurate footprints and facings:
     - **Farm**: small wooden house/shed facades or fenced crop enclosures (`woodWall` / `woodWallWindow` / `roofSingleWall`, `fenceLow` runs, `planks` porch, `ladderStand`).
     - **Dungeon**: stone stair flights (`stairs` / `stoneSteps`) against walls, timber support arches (`woodenSupports`), column pairs (`stoneColumn`), and furnished tables/barrel clusters.
     - **Library**: tall bookshelves (`bookcaseBooks`, `bookcaseBooksLadder`, `bookcaseWideBooks` with 2-tile footprints) aligned along walls or in reading-room rows (`:S` / `:E`), reading tables with chairs (`longTableDecoratedChairsBooks`), display cases, and carpet runners (`floorCarpet`, `blocksMovement: false`).
     - **Base**: raised platform formations (`square_stone_high`, `square_wood_high`, `square_grass_high`) and non-blocking detail pads.
3. **Update AI Prompt (`src/level/prompt.ts`)**:
   - Document the 3D isometric orientation rules (`:S` and `:E` face into the room from the top-right and top-left; 2-tile footprints for wide tables/bookcases; non-blocking floor carpets/steps vs blocking structures) and encourage placing cohesive structures (houses/fences, reading rows, stair flights, interior wall segments) matching the level archetype.
4. **Update Test Suite (`scripts/level-lab.mjs`)**:
   - Update §12 and §13 assertions to verify the corrected corner facings (`es→S`, `sw→W`, `ne→E`, `wn→N`), outer border wall facings (`N/E/S/W`), `:N` exit door alignment, and expanded catalog preloads.
