# Graph Report - web-game  (2026-10-06)

## Corpus Check
- 44 files · ~164,066 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: .url 3, .zip 2, (none) 1)

## Summary
- 451 nodes · 882 edges · 19 communities (15 shown, 4 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 38 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2c930a30`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- GameScene.ts
- GameScene
- App.tsx
- package.json
- Manor Layout (design doc)
- timeManager
- LevelEditor.tsx
- check-projection.mjs
- compilerOptions
- check-turns.mjs
- testLevels.ts
- iso-preview.mjs
- RoomRegistry
- diaryStore
- subdivide.mjs
- vercel.json
- ref_node_fs
- roster.ts

## God Nodes (most connected - your core abstractions)
1. `GameScene` - 73 edges
2. `timeManager` - 19 edges
3. `RoomDef` - 18 edges
4. `compilerOptions` - 18 edges
5. `TilePos` - 13 edges
6. `src/ layout — domain separation` - 13 edges
7. `TileActor` - 12 edges
8. `LockKey` - 11 edges
9. `tr()` - 11 edges
10. `App()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Fixed beats tied to layout` --references--> `GameScene`  [INFERRED]
  docs/manor-layout.md → src/core/GameScene.ts
- `Prod vs dev profiles` --references--> `GameScene`  [INFERRED]
  docs/tech-stack.md → src/core/GameScene.ts
- `i18n (`src/text/i18n.ts`)` --references--> `DevTools()`  [INFERRED]
  docs/ui.md → src/dev/DevTools.tsx
- `i18n (`src/text/i18n.ts`)` --references--> `LevelEditor()`  [INFERRED]
  docs/ui.md → src/dev/LevelEditor.tsx
- `Compass (Kenney pack, `Information.png`)` --references--> `isIsoStep()`  [INFERRED]
  docs/tiles-and-sprites.md → src/movement/IsoTiles.ts

## Import Cycles
- None detected.

## Communities (19 total, 4 thin omitted)

### Community 0 - "GameScene.ts"
Cohesion: 0.05
Nodes (47): Implemented stubs (data/logic ready, UI or wiring pending), EditorBrush, EditorCommand, EditorQuery, EditorTool, ManorBridge, PortalPatch, PropBrush (+39 more)

### Community 1 - "GameScene"
Cohesion: 0.09
Nodes (8): Transitions (all fades, no cuts), QueryResult, GameScene, depthFor(), makeProjection(), screenToTile(), tileToScreen(), RoomDef

### Community 2 - "App.tsx"
Cohesion: 0.07
Nodes (40): i18n (`src/text/i18n.ts`), phaser, react, createGame(), GameInit, src/ layout — domain separation, clearSave(), hasSave() (+32 more)

### Community 3 - "package.json"
Cohesion: 0.06
Nodes (31): allowScripts, esbuild, dependencies, phaser, react, react-dom, description, devDependencies (+23 more)

### Community 4 - "Manor Layout (design doc)"
Cohesion: 0.06
Nodes (27): Controls, Current game state, Dev profile (`npm run dev` only), Known limits (by design, for now), Camera, Code mapping, Entrance (exact, per sketch), Fixed beats tied to layout (+19 more)

### Community 5 - "timeManager"
Cohesion: 0.10
Nodes (13): Playable today, KEYS, Clock, TimeEvent, TimeListener, timeManager, ClockReading, COST (+5 more)

### Community 6 - "LevelEditor.tsx"
Cohesion: 0.11
Nodes (25): Anchors (all in `src/movement/IsoTiles.ts`), ASCII legend (`TILE_BRUSHES` in `src/rooms/spriteCatalog.ts`), Autotile rules (`src/core/GameScene.ts`), Compass (Kenney pack, `Information.png`), Tile system + art assets, Using the art assets, walk(), bridgeOf() (+17 more)

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
Cohesion: 0.23
Nodes (10): doorSpriteFor(), groupDoorTiles(), imgFor(), ISO, main(), parseSprite(), ROOT, stairVariantFor() (+2 more)

### Community 12 - "RoomRegistry"
Cohesion: 0.31
Nodes (4): createProdRegistry(), entranceHall, library, RoomRegistry

### Community 14 - "subdivide.mjs"
Cohesion: 0.40
Nodes (5): expandTilesBlock(), [file, flag], out, src, subdivide()

### Community 15 - "vercel.json"
Cohesion: 0.33
Nodes (5): buildCommand, framework, installCommand, outputDirectory, $schema

## Knowledge Gaps
- **153 isolated node(s):** `name`, `private`, `version`, `type`, `description` (+148 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 188 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GameScene` connect `GameScene` to `GameScene.ts`, `App.tsx`, `Manor Layout (design doc)`, `timeManager`, `LevelEditor.tsx`, `RoomRegistry`?**
  _High betweenness centrality (0.288) - this node is a cross-community bridge._
- **Why does `ASCII legend (`TILE_BRUSHES` in `src/rooms/spriteCatalog.ts`)` connect `LevelEditor.tsx` to `GameScene`?**
  _High betweenness centrality (0.217) - this node is a cross-community bridge._
- **Why does `walk()` connect `LevelEditor.tsx` to `ref_node_fs`?**
  _High betweenness centrality (0.213) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `GameScene` (e.g. with `Fixed beats tied to layout` and `Prod vs dev profiles`) actually correct?**
  _`GameScene` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `RoomDef` (e.g. with `Implemented stubs (data/logic ready, UI or wiring pending)` and `i18n (`src/text/i18n.ts`)`) actually correct?**
  _`RoomDef` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _153 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `GameScene.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.050078247261345854 - nodes in this community are weakly interconnected._