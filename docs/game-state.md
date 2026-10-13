# Current game state

## Playable today

- **Rooms**: 2 production rooms (`entrance_hall` ⇄ `library`, `src/rooms/manor.ts`)
  with portal jumps (impossible geometry allowed: any tile → any room/tile).
- **Movement**: 4-direction tile steps (see `tiles-and-sprites.md` for the
  compass). 1 step = 1 tile = 1 minute (`COST.MOVE`). Smooth single-footfall
  glide, no run-cycle jitter.
- **Time**: 72h loop clock (`src/time/TimeManager.ts`), starts Day 1 08:00.
  Great-clock noon chime each day. Final-6h `collapseFactor` exists but no
  room uses it yet.
- **Locks**: 3 keys (`servant` / `master` / `kitchen`). Locked portals bump
  with a translated message, cost no time. No in-game key items yet —
  unlock via story hooks (future) or the dev panel.
- **Save/continue**: autosaves to `localStorage` after every move/room change.
- **Menu**: fullscreen game-view backdrop + overlaid title/buttons
  (`src/ui/MenuScene.tsx`, `MainMenu.tsx`), settings (language), credits,
  fade transitions between all screens and rooms.
- **Languages**: full EN/ES UI except the title (`src/text/i18n.ts`).

## Controls

Arrows / WASD step one tile: **Up = north, Right = east, Down = south,
Left = west** (iso: up-right / down-right / down-left / up-left on screen).
`Q`/`E`/`Z`/`C` are aliases (W/N/S/E). `Esc` returns to the menu.
One step per keypress edge.

## Implemented stubs (data/logic ready, UI or wiring pending)

| System | File | State |
|---|---|---|
| Dialogue queue | `src/text/TextEngine.ts` | Works (say/advance/listen); LLM-written lines plug in later |
| Diary (loop memory) | `src/diary/DiaryStore.ts` | Working store; no HUD yet |
| NPC roster | `src/characters/roster.ts` | 7 static defs from `idea.md`; no NPC actors/wiring yet |
| Reusable tile actor | `src/movement/IsoTiles.ts` (`TileActor`) | Player steps resolve through `src/manor/turns.ts` (`resolveStep`) over a short-lived `TileActor` adapter; scene keeps tile/facing fields + all rendering. Ready for NPCs next |
| Costs | `src/time/types.ts` (`COST`) | TALK/EAT/PUZZLE = 20 defined; only MOVE is charged |
| Room flavor/names, portal labels | `RoomDef` | Exported + editor-visible; not shown in-game (hence untranslated) |

## Dev profile (`npm run dev` only)

Boots the real game: `LevelScene` (`src/core/LevelScene.ts`) generates a
certified `LevelDef` per depth (fallback generator today, AI via
`/api/generate-level` next) and renders it with real theme-pack sprites
— ground, theme walls, locking exit door, pickups, red-tinted chasers
(dungeon `Male` actors on all themes). Arrows/WASD move, `Space` waits,
`R` retries the same seed, `N` jumps to the next depth; death reloads the
level, the exit advances depth (theme rotates via the difficulty curve).
Status (depth/theme/keys) is a Phaser HUD line; pickups, deaths, and
clears narrate through the dialogue box.

Still around (legacy v1): 11 test rooms replicating `manor-layout.md`
(`src/dev/testLevels.ts`, reachable only inside `GameScene`, which dev no
longer boots), time slider + day jumps + room jumper (`DevTools.tsx` —
its room/editor commands no-op against the level scene), full level editor
(`LevelEditor.tsx`, now on the real-pack palette). None of it ships in
prod (see `tech-stack.md` guards).

## Known limits (by design, for now)

- Stair flights render continuation visually (`stairs` → `steps` upward) but
  grant no height/climb mechanics; stacked `>` tiles are all walkable floor.
- Multi-tile door openings show **one** leaf arch (linear runs add frame
  pieces); all member tiles still trigger their portals.
- Front (south-facing) wall runs render as low fence rails so interiors stay
  visible; `wallCurve` is corners-only, never freestanding cheeks.
- Props placed on wall tiles hide behind the wall face — stand blockers on
  the floor in front instead.
- HUD is dialogue-only (no clock/counters by design).
