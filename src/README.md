# src/ layout — domain separation

- `core/` — Phaser boot, GameScene (rendering + narrowed React↔Phaser bridge in `bridge.ts`). Turn rules live in `manor/`.
- `time/` — 72h loop clock (`TimeManager`), costs, formatting. Framework-agnostic.
- `movement/` — `Grid` (walkability) + `IsoTiles` (compass, anchors, `TileActor`). Framework-agnostic, unit-testable.
- `manor/` — pure turn-step rules (`turns.ts`): step resolution over `TileActor` (walkability, locked-door bump, portal lookup, 1-min charge, noon-chime data). No Phaser import, unit-testable; `GameScene.tryStep` is a thin rendering adapter over it.
- `rooms/` — `RoomDef`, `RoomRegistry`, production manor graph (`manor.ts`).
- `characters/` — NPC roster data (idea.md). LLM context wiring later.
- `diary/` — knowledge persisting across loop resets.
- `text/` — dialogue queue stub (LLM plugs in later) + hand EN/ES `i18n`.
- `ui/` — React overlay: `App` (screens + fades), fullscreen menu diorama (`MenuScene`), `MainMenu`, `Settings` (language), `Credits`, `Hud` (dialogue).
- `dev/` — **DEV PROFILE ONLY.** Test rooms, arbitrary time selector, room jumper.
  Loaded via dynamic `import()` behind `import.meta.env.DEV`, dropped from
  prod bundles. `vite.config.ts` fails prod builds on static dev imports;
  `npm run check:prod-leak` does the same check in CI.
