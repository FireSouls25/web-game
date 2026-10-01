# src/ layout — domain separation

- `core/` — Phaser boot, GameScene, placeholder textures. No game rules.
- `time/` — 72h loop clock (`TimeManager`), costs, formatting. Framework-agnostic.
- `movement/` — `Grid` + step logic. Framework-agnostic, unit-testable.
- `rooms/` — `RoomDef`, `RoomRegistry`, production manor graph (`manor.ts`).
- `characters/` — NPC roster data (idea.md). LLM context wiring later.
- `diary/` — knowledge persisting across loop resets.
- `text/` — dialogue queue stub (LLM plugs in later).
- `ui/` — React overlay: `App`, `Hud` (clock, wait, diary, dialogue).
- `dev/` — **DEV PROFILE ONLY.** Test rooms, arbitrary time selector, room jumper.
  Loaded via dynamic `import()` behind `import.meta.env.DEV`, dropped from
  prod bundles. `vite.config.ts` fails prod builds on static dev imports;
  `npm run check:prod-leak` does the same check in CI.
