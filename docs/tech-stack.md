# Tech stack

## Runtime

| Piece | Tech | Role |
|---|---|---|
| Build / dev server | **Vite 7** + `@vitejs/plugin-react` | `npm run dev` (port 5173), `build`, `preview` |
| Language | **TypeScript 5** (`tsc --noEmit` in build) | Everything under `src/` |
| Game canvas | **Phaser 3.90** | `src/core/GameScene.ts` — rooms, sprites, movement, camera |
| Overlay UI | **React 19** | `src/ui/` — menu, settings, credits, HUD dialogue |
| Preview renders | **ImageMagick** (`magick` CLI) | `scripts/iso-preview.mjs` — software iso compositor |
| Art | **Kenney Prototype Pack**, CC0 | Vendored in `public/prototype_sprites/` (see `tiles-and-sprites.md`) |
| Persistence | **`localStorage`** (no backend) | Save file, editor drafts, language choice |

Nothing else is a dependency (see `package.json`): no router, no i18n
library, no state library — all three are ~50-line hand modules.

## npm scripts

| Script | What |
|---|---|
| `npm run dev` | Dev server with test rooms + editor |
| `npm run build` | `tsc --noEmit && vite build` (prod; dev code eliminated) |
| `npm run build:dev` | Dev-mode bundle (keeps test rooms) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check:prod-leak` | Fails if prod code statically imports `src/dev/` |
| `npm run check:gates` | Node conformance gates: turn rules (`check-turns.mjs`) + projection/autotile mirror (`check-projection.mjs`) |

## `scripts/`

| Script | What |
|---|---|
| `iso-preview.mjs <room.json> <out.png>` | Renders a room exactly like `GameScene.renderRoom` (walls, grouped doors, stairs, props) for visual review. **Must mirror** the `*VariantFor` / `groupDoorTiles` logic in `GameScene.ts` — both files carry `MUST match` comments. |
| `subdivide.mjs <file.ts> [--write]` | ONE-TIME migration helper: 1 tile → 2×2 tiles (finer movement, 2-wide doors). Dry run by default. |
| `check-prod-leak.mjs` | CI twin of the Vite `no-dev-in-prod` guard. |

## Prod vs dev profiles

- `src/dev/` (test rooms, time slider, room jumper, level editor) loads only
  via dynamic `import()` behind `import.meta.env.DEV` (`GameScene` boots prod
  rooms first, then registers `DEV_TEST_ROOMS`). The Vite plugin
  `no-dev-in-prod` **fails production builds** on any static dev import.
- Compile-time flag `__DEV_PROFILE__` (`vite.config.ts` `define`) marks
  dev-only branches for dead-code elimination.

## Storage keys (`localStorage`)

| Key | Owner | Notes |
|---|---|---|
| `manor-loop-save-v1` | `src/save/SaveManager.ts` | roomId + tile + clock; written after every move/room change. Kept across the rebrand so saves survive. |
| `mansion-mystery-lang` | `src/text/i18n.ts` | `'en'` / `'es'`. |
| `manor-loop-editor-v1` | dev editor UI | Dev-only room drafts. |

## Leftovers

- `lancedb/` (repo root) is an empty, unreferenced leftover — safe to delete.
