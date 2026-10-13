# Graph Report - web-game  (2026-10-13)

## Corpus Check
- 59 files · ~1,440,430 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 25 file(s) not represented in the graph (top: .url 13, .zip 10, (none) 1)

## Summary
- 632 nodes · 1316 edges · 26 communities (22 shown, 4 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 44 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `644e652d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- GameScene.ts
- GameScene
- App.tsx
- package.json
- Manor Layout (design doc)
- DevTools.tsx
- LevelEditor.tsx
- check-projection.mjs
- compilerOptions
- check-turns.mjs
- testLevels.ts
- iso-preview.mjs
- RoomRegistry
- diaryStore
- ref_node_fs
- vercel.json
- LevelScene.ts
- roster.ts
- TilePos
- level-lab.mjs
- LevelScene
- IsoTiles.ts
- timeManager
- RoomDef
- turns.ts

## God Nodes (most connected - your core abstractions)
1. `GameScene` - 74 edges
2. `TilePos` - 29 edges
3. `LevelScene` - 27 edges
4. `TileActor` - 19 edges
5. `timeManager` - 19 edges
6. `RoomDef` - 18 edges
7. `compilerOptions` - 18 edges
8. `validateLevel()` - 16 edges
9. `Grid` - 14 edges
10. `src/ layout — domain separation` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Fixed beats tied to layout` --references--> `GameScene`  [INFERRED]
  docs/manor-layout.md → src/core/GameScene.ts
- `Prod vs dev profiles` --references--> `GameScene`  [INFERRED]
  docs/tech-stack.md → src/core/GameScene.ts
- `npm scripts` --references--> `LevelScene`  [INFERRED]
  docs/tech-stack.md → src/core/LevelScene.ts
- `Dev profile (`npm run dev` only)` --references--> `GameScene`  [INFERRED]
  docs/game-state.md → src/core/GameScene.ts
- `i18n (`src/text/i18n.ts`)` --references--> `DevTools()`  [INFERRED]
  docs/ui.md → src/dev/DevTools.tsx

## Import Cycles
- None detected.

## Communities (26 total, 4 thin omitted)

### Community 0 - "GameScene.ts"
Cohesion: 0.12
Nodes (19): EditorBrush, EditorCommand, EditorQuery, EditorTool, ManorBridge, PortalPatch, PropBrush, RoomSnapshot (+11 more)

### Community 1 - "GameScene"
Cohesion: 0.10
Nodes (5): Transitions (all fades, no cuts), QueryResult, GameScene, depthFor(), tileToScreen()

### Community 2 - "App.tsx"
Cohesion: 0.06
Nodes (41): i18n (`src/text/i18n.ts`), phaser, react, createGame(), GameInit, src/ layout — domain separation, clearSave(), hasSave() (+33 more)

### Community 3 - "package.json"
Cohesion: 0.06
Nodes (32): allowScripts, esbuild, dependencies, phaser, react, react-dom, description, devDependencies (+24 more)

### Community 4 - "Manor Layout (design doc)"
Cohesion: 0.05
Nodes (33): Controls, Current game state, Known limits (by design, for now), Camera, Code mapping, Entrance (exact, per sketch), Fixed beats tied to layout, Ground floor (+25 more)

### Community 5 - "DevTools.tsx"
Cohesion: 0.21
Nodes (10): KEYS, TimeEvent, TimeListener, ClockReading, COST, elapsedToReading(), LOOP_DAYS, LOOP_MINUTES (+2 more)

### Community 6 - "LevelEditor.tsx"
Cohesion: 0.11
Nodes (22): Using the art assets, bridgeOf(), exportToManorTs(), LevelEditor(), NEXT_DIR, Tool, toolBrush(), TOOLS (+14 more)

### Community 7 - "check-projection.mjs"
Cohesion: 0.11
Nodes (16): bundlePath, canon(), check(), doorAxisAt(), doorRoom, esbuild, failures, isWallCh() (+8 more)

### Community 8 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowSyntheticDefaultImports, forceConsistentCasingInFileNames, isolatedModules, jsx, lib, module, moduleResolution (+11 more)

### Community 9 - "check-turns.mjs"
Cohesion: 0.11
Nodes (12): bundlePath, esbuild, failures, out, portals, r, require, ROOT (+4 more)

### Community 10 - "testLevels.ts"
Cohesion: 0.14
Nodes (13): baths, DEV_START_ROOM, DEV_TEST_ROOMS, diningRoom, drawingRoom, entrance, galleryLanding, kitchen (+5 more)

### Community 11 - "iso-preview.mjs"
Cohesion: 0.19
Nodes (12): doorSpriteFor(), groupDoorTiles(), imgFor(), ISO, main(), parseSprite(), ROOT, stairVariantFor() (+4 more)

### Community 12 - "RoomRegistry"
Cohesion: 0.31
Nodes (4): createProdRegistry(), entranceHall, library, RoomRegistry

### Community 14 - "ref_node_fs"
Cohesion: 0.22
Nodes (6): offenders, expandTilesBlock(), [file, flag], out, src, subdivide()

### Community 15 - "vercel.json"
Cohesion: 0.33
Nodes (5): buildCommand, framework, installCommand, outputDirectory, $schema

### Community 16 - "LevelScene.ts"
Cohesion: 0.06
Nodes (64): handler(), num(), themeOf(), LEVEL_SCENE, LEVEL_THEMES, LevelInit, bfsDistance(), floodFill() (+56 more)

### Community 19 - "TilePos"
Cohesion: 0.08
Nodes (33): Implemented stubs (data/logic ready, UI or wiring pending), EnemyView, bfsNextStep(), EnemyStepInput, EnemyStepResult, stepEnemy(), applyAction(), ApplyResult (+25 more)

### Community 20 - "level-lab.mjs"
Cohesion: 0.05
Nodes (34): adj, args, bundlePath, close, depthArg, DIRS, edge, entryPath (+26 more)

### Community 21 - "LevelScene"
Cohesion: 0.19
Nodes (6): Dev profile (`npm run dev` only), LevelScene, PuzzleEnemyState, LevelDef, facingForStep(), tileFootScreen()

### Community 22 - "IsoTiles.ts"
Cohesion: 0.12
Nodes (11): DEFAULT_PROJECTION, ISO_DIRS, IsoDir, IsoDirKey, IsoProjection, makeProjection(), screenToTile(), SPRITE_SCALE (+3 more)

### Community 24 - "RoomDef"
Cohesion: 0.31
Nodes (5): doorSpriteFor(), groupDoorTiles(), stairVariantFor(), wallVariantFor(), RoomDef

### Community 25 - "turns.ts"
Cohesion: 0.33
Nodes (7): noonElapsedForDay(), noonsCrossed(), StepOutcome, StepPortal, TurnState, LockKey, Portal

## Knowledge Gaps
- **221 isolated node(s):** `name`, `private`, `version`, `type`, `description` (+216 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 268 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ASCII legend (`TILE_BRUSHES` in `src/rooms/spriteCatalog.ts`)` connect `Manor Layout (design doc)` to `GameScene`?**
  _High betweenness centrality (0.265) - this node is a cross-community bridge._
- **Why does `walk()` connect `Manor Layout (design doc)` to `ref_node_fs`?**
  _High betweenness centrality (0.262) - this node is a cross-community bridge._
- **Why does `GameScene` connect `GameScene` to `GameScene.ts`, `App.tsx`, `Manor Layout (design doc)`, `LevelEditor.tsx`, `RoomRegistry`, `TilePos`, `LevelScene`, `RoomDef`?**
  _High betweenness centrality (0.251) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `GameScene` (e.g. with `Dev profile (`npm run dev` only)` and `Fixed beats tied to layout`) actually correct?**
  _`GameScene` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `LevelScene` (e.g. with `Dev profile (`npm run dev` only)` and `npm scripts`) actually correct?**
  _`LevelScene` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `TileActor` (e.g. with `Implemented stubs (data/logic ready, UI or wiring pending)` and `src/ layout — domain separation`) actually correct?**
  _`TileActor` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _221 weakly-connected nodes found - possible documentation gaps or missing edges._